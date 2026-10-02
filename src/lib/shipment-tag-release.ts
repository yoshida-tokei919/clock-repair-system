import { Prisma, type PrismaClient } from "@prisma/client";

export class ShipmentTagReleaseError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "ShipmentTagReleaseError";
  }
}

export type ReleaseTarget = { repairId: number; assignmentId: number; physicalTagId: number };
export type ReleasePreviewRow = {
  repairId: number;
  inquiryNumber: string;
  assignmentId: number | null;
  physicalTagId: number | null;
  shortCode: string | null;
  status: "READY" | "NO_ACTIVE_ASSIGNMENT" | "MULTIPLE_ACTIVE_ASSIGNMENTS" | "TAG_NOT_ACTIVE";
};
export type ReleasePreview = { shipmentId: number; releasable: boolean; blockers: string[]; targets: ReleasePreviewRow[] };

const MAX_REPAIRS = 100;
const CONFLICT = "発送またはタグ割当の状態が変更されました。梱包から再確認してください。";

function id(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2147483647)
    throw new ShipmentTagReleaseError(400, "IDが不正です。");
  return value;
}

export function parseReleaseRequest(body: unknown): { confirmed: true; targets: ReleaseTarget[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ShipmentTagReleaseError(400, "入力が不正です。");
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !["confirmed", "targets"].includes(key)) || value.confirmed !== true ||
      !Array.isArray(value.targets) || value.targets.length < 1 || value.targets.length > MAX_REPAIRS)
    throw new ShipmentTagReleaseError(400, "明示的な確認と1～100件の対象が必要です。");
  const targets = value.targets.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        Object.keys(item).some(key => !["repairId", "assignmentId", "physicalTagId"].includes(key)))
      throw new ShipmentTagReleaseError(400, "対象が不正です。");
    const target = item as Record<string, unknown>;
    return { repairId: id(target.repairId), assignmentId: id(target.assignmentId), physicalTagId: id(target.physicalTagId) };
  });
  if (new Set(targets.map(item => item.repairId)).size !== targets.length ||
      new Set(targets.map(item => item.assignmentId)).size !== targets.length ||
      new Set(targets.map(item => item.physicalTagId)).size !== targets.length)
    throw new ShipmentTagReleaseError(400, "対象に重複があります。");
  return { confirmed: true, targets };
}

type Reader = Pick<PrismaClient, "shipment" | "physicalTagAssignment">;

async function inspect(db: Reader, shipmentId: number): Promise<ReleasePreview> {
  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: { id: true, direction: true, status: true, actualShippedAt: true,
      repairs: { select: { repairId: true, repair: { select: { inquiryNumber: true } } } } },
  });
  if (!shipment) throw new ShipmentTagReleaseError(404, "発送が見つかりません。");
  const blockers: string[] = [];
  if (shipment.direction !== "OUTBOUND") blockers.push("OUTBOUNDの発送ではありません。");
  if (shipment.status === "CANCELLED") blockers.push("取消済みの発送です。");
  if (shipment.actualShippedAt !== null) blockers.push("発送済みです。");
  if (shipment.repairs.length === 0) blockers.push("修理案件がありません。");
  if (shipment.repairs.length > MAX_REPAIRS) blockers.push(`修理案件が${MAX_REPAIRS}件を超えています。`);
  const repairIds = shipment.repairs.map(item => item.repairId);
  if (new Set(repairIds).size !== repairIds.length) blockers.push("発送の修理案件に重複があります。");
  const active = repairIds.length ? await db.physicalTagAssignment.findMany({
    where: { repairId: { in: repairIds }, releasedAt: null },
    select: { id: true, repairId: true, physicalTagId: true,
      physicalTag: { select: { shortCode: true, status: true } } },
  }) : [];
  const targets: ReleasePreviewRow[] = shipment.repairs.map(item => {
    const assignments = active.filter(assignment => assignment.repairId === item.repairId);
    const assignment = assignments[0];
    return { repairId: item.repairId, inquiryNumber: item.repair.inquiryNumber,
      assignmentId: assignment?.id ?? null, physicalTagId: assignment?.physicalTagId ?? null,
      shortCode: assignment?.physicalTag.shortCode ?? null,
      status: assignments.length === 0 ? "NO_ACTIVE_ASSIGNMENT" : assignments.length !== 1 ?
        "MULTIPLE_ACTIVE_ASSIGNMENTS" : assignment.physicalTag.status !== "ACTIVE" ? "TAG_NOT_ACTIVE" : "READY" };
  });
  if (targets.some(item => item.status !== "READY")) blockers.push("有効なACTIVEタグ割当がない修理案件があります。");
  return { shipmentId, releasable: blockers.length === 0, blockers, targets };
}

export async function previewShipmentTagRelease(db: PrismaClient, shipmentId: number): Promise<ReleasePreview> {
  return db.$transaction(tx => inspect(tx, shipmentId), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function releaseShipmentTags(db: PrismaClient, shipmentId: number,
  input: { confirmed: true; targets: ReleaseTarget[] }, adminId: number) {
  if (input.confirmed !== true) throw new ShipmentTagReleaseError(400, "明示的な確認が必要です。");
  return db.$transaction(async tx => {
    const preview = await inspect(tx, shipmentId);
    if (!preview.releasable || input.targets.length !== preview.targets.length) throw new ShipmentTagReleaseError(409, CONFLICT);
    const expected = new Map(preview.targets.map(item => [item.repairId, item]));
    if (new Set(input.targets.map(item => item.repairId)).size !== input.targets.length ||
        input.targets.some(item => {
          const current = expected.get(item.repairId);
          return !current || current.status !== "READY" || current.assignmentId !== item.assignmentId ||
            current.physicalTagId !== item.physicalTagId;
        })) throw new ShipmentTagReleaseError(409, CONFLICT);
    const releasedAt = new Date();
    const releaseReason = `発送前PhysicalTag解放確認 / Shipment ID ${shipmentId}`;
    for (const target of input.targets) {
      const result = await tx.physicalTagAssignment.updateMany({
        where: { id: target.assignmentId, repairId: target.repairId,
          physicalTagId: target.physicalTagId, releasedAt: null },
        data: { releasedAt, releasedBy: adminId, releaseReason },
      });
      if (result.count !== 1) throw new ShipmentTagReleaseError(409, CONFLICT);
    }
    return { shipmentId, releasedCount: input.targets.length, releasedAt, releaseReason };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function shipmentTagReleaseFailure(error: unknown): { status: number; message: string } {
  if (error instanceof ShipmentTagReleaseError) return { status: error.status, message: error.message };
  if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034"))
    return { status: 409, message: CONFLICT };
  return { status: 500, message: "PhysicalTagの発送前解放に失敗しました。" };
}
