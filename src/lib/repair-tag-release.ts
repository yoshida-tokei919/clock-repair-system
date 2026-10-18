import { Prisma, type PrismaClient } from "@prisma/client";
import { ShipmentTagReleaseError, type ReleaseTarget } from "@/lib/shipment-tag-release";

export type RepairTagReleaseRow = {
  repairId: number; inquiryNumber: string; assignmentId: number | null;
  physicalTagId: number | null; shortCode: string | null;
  status: "READY" | "NO_ACTIVE_ASSIGNMENT" | "INVALID_ASSIGNMENT";
};
export type RepairTagReleasePreview = {
  rows: RepairTagReleaseRow[]; eligibleCount: number; skippedCount: number; releasable: boolean;
};
type Snapshot = { repairId: number; assignmentId: number | null; physicalTagId: number | null };
const conflict = "タグ割当の状態が変更されました。一覧から再確認してください。";

function positiveId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2147483647)
    throw new ShipmentTagReleaseError(400, "IDが不正です。");
  return value;
}

export function parseRepairIds(body: unknown): number[] {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => key !== "repairIds") ||
      !Array.isArray((body as { repairIds?: unknown }).repairIds))
    throw new ShipmentTagReleaseError(400, "入力が不正です。");
  const ids = (body as { repairIds: unknown[] }).repairIds.map(positiveId);
  if (ids.length < 1 || ids.length > 100 || new Set(ids).size !== ids.length)
    throw new ShipmentTagReleaseError(400, "1～100件の重複しない修理IDが必要です。");
  return ids;
}

export function parseRepairTagReleaseRequest(body: unknown): { repairIds: number[]; confirmed: true; snapshot: Snapshot[] } {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => !["repairIds", "confirmed", "snapshot"].includes(key)))
    throw new ShipmentTagReleaseError(400, "入力が不正です。");
  const value = body as Record<string, unknown>;
  const repairIds = parseRepairIds({ repairIds: value.repairIds });
  if (value.confirmed !== true || !Array.isArray(value.snapshot) || value.snapshot.length !== repairIds.length)
    throw new ShipmentTagReleaseError(400, "明示的な確認と全選択行のプレビューが必要です。");
  const snapshot = value.snapshot.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        Object.keys(item).some(key => !["repairId", "assignmentId", "physicalTagId"].includes(key)))
      throw new ShipmentTagReleaseError(400, "プレビューが不正です。");
    const row = item as Record<string, unknown>;
    const assignmentId = row.assignmentId === null ? null : positiveId(row.assignmentId);
    const physicalTagId = row.physicalTagId === null ? null : positiveId(row.physicalTagId);
    if ((assignmentId === null) !== (physicalTagId === null))
      throw new ShipmentTagReleaseError(400, "プレビューが不正です。");
    return { repairId: positiveId(row.repairId), assignmentId, physicalTagId };
  });
  if (new Set(snapshot.map(row => row.repairId)).size !== snapshot.length ||
      snapshot.some(row => !repairIds.includes(row.repairId)) ||
      new Set(snapshot.filter(row => row.assignmentId !== null).map(row => row.assignmentId)).size !== snapshot.filter(row => row.assignmentId !== null).length ||
      new Set(snapshot.filter(row => row.physicalTagId !== null).map(row => row.physicalTagId)).size !== snapshot.filter(row => row.physicalTagId !== null).length)
    throw new ShipmentTagReleaseError(400, "プレビューに重複または対象外のIDがあります。");
  return { repairIds, confirmed: true, snapshot };
}

type Reader = Pick<PrismaClient, "repair" | "physicalTagAssignment">;
async function inspect(db: Reader, repairIds: number[]): Promise<RepairTagReleasePreview> {
  const repairs = await db.repair.findMany({ where: { id: { in: repairIds } }, select: { id: true, inquiryNumber: true } });
  if (repairs.length !== repairIds.length) throw new ShipmentTagReleaseError(404, "選択した修理案件が見つかりません。");
  const numbers = new Map(repairs.map(row => [row.id, row.inquiryNumber]));
  const active = await db.physicalTagAssignment.findMany({
    where: { repairId: { in: repairIds }, releasedAt: null },
    select: { id: true, repairId: true, physicalTagId: true,
      physicalTag: { select: { shortCode: true, status: true } } },
  });
  const rows = repairIds.map(repairId => {
    const assignments = active.filter(row => row.repairId === repairId);
    const assignment = assignments[0];
    return { repairId, inquiryNumber: numbers.get(repairId)!, assignmentId: assignment?.id ?? null,
      physicalTagId: assignment?.physicalTagId ?? null, shortCode: assignment?.physicalTag.shortCode ?? null,
      status: assignments.length === 0 ? "NO_ACTIVE_ASSIGNMENT" as const :
        assignments.length !== 1 || assignment.physicalTag.status !== "ACTIVE" ? "INVALID_ASSIGNMENT" as const : "READY" as const };
  });
  const eligibleCount = rows.filter(row => row.status === "READY").length;
  return { rows, eligibleCount, skippedCount: rows.filter(row => row.status === "NO_ACTIVE_ASSIGNMENT").length,
    releasable: eligibleCount > 0 && rows.every(row => row.status !== "INVALID_ASSIGNMENT") };
}

export async function previewRepairTagRelease(db: PrismaClient, repairIds: number[]) {
  return db.$transaction(tx => inspect(tx, repairIds), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function releaseRepairTags(db: PrismaClient, input: ReturnType<typeof parseRepairTagReleaseRequest>, adminId: number) {
  if (input.confirmed !== true) throw new ShipmentTagReleaseError(400, "明示的な確認が必要です。");
  return db.$transaction(async tx => {
    const current = await inspect(tx, input.repairIds);
    if (!current.releasable) throw new ShipmentTagReleaseError(409, conflict);
    const expected = new Map(input.snapshot.map(row => [row.repairId, row]));
    if (current.rows.some(row => {
      const previous = expected.get(row.repairId);
      return !previous || row.status === "INVALID_ASSIGNMENT" ||
        previous.assignmentId !== row.assignmentId || previous.physicalTagId !== row.physicalTagId;
    })) throw new ShipmentTagReleaseError(409, conflict);
    const releasedAt = new Date();
    const releaseReason = "修理一覧からNFCタグ割当解除";
    for (const row of current.rows.filter(row => row.status === "READY")) {
      const target: ReleaseTarget = { repairId: row.repairId, assignmentId: row.assignmentId!, physicalTagId: row.physicalTagId! };
      const result = await tx.physicalTagAssignment.updateMany({
        where: { id: target.assignmentId, repairId: target.repairId, physicalTagId: target.physicalTagId, releasedAt: null,
          physicalTag: { status: "ACTIVE" } },
        data: { releasedAt, releasedBy: adminId, releaseReason },
      });
      if (result.count !== 1) throw new ShipmentTagReleaseError(409, conflict);
    }
    return { releasedCount: current.eligibleCount, skippedCount: current.skippedCount };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
