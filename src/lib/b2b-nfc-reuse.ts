import { Prisma, type PrismaClient } from "@prisma/client";
import { parsePhysicalTagIdentifier, PhysicalTagIdentifierError } from "./physical-tag-resolver";
import { PhysicalTagNfcBindError } from "./physical-tag-nfc-bind";

type Input = { physicalTagId: number; repairId: number; nfcUid: string };
const conflict = "タグの割当状態が変わりました。NFC UIDを再確認してください。";

export function parseB2bNfcReuseInput(body: unknown, confirm: boolean): Input & { reusableTagId?: number } {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new PhysicalTagNfcBindError(400, "入力が不正です。");
  const value = body as Record<string, unknown>;
  const keys = confirm ? ["physicalTagId", "repairId", "nfcUid", "reusableTagId", "confirmed"] :
    ["physicalTagId", "repairId", "nfcUid"];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key)) ||
      [value.physicalTagId, value.repairId, ...(confirm ? [value.reusableTagId] : [])].some(id =>
        typeof id !== "number" || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) ||
      (confirm && value.confirmed !== true))
    throw new PhysicalTagNfcBindError(400, "入力が不正です。");
  try {
    const uid = parsePhysicalTagIdentifier({ type: "NFC_UID", value: value.nfcUid }).value;
    return { physicalTagId: value.physicalTagId as number, repairId: value.repairId as number,
      nfcUid: uid, ...(confirm ? { reusableTagId: value.reusableTagId as number } : {}) };
  } catch (error) {
    if (error instanceof PhysicalTagIdentifierError)
      throw new PhysicalTagNfcBindError(400, "NFC UIDが不正です。");
    throw error;
  }
}

async function inspect(db: Prisma.TransactionClient, input: Input) {
  const repair = await db.repair.findUnique({
    where: { id: input.repairId }, select: { customer: { select: { type: true } } },
  });
  if (!repair || repair.customer.type !== "business")
    throw new PhysicalTagNfcBindError(404, "B2B修理案件が見つかりません。");
  const provisional = await db.physicalTag.findUnique({
    where: { id: input.physicalTagId }, select: { status: true, nfcUid: true },
  });
  const assignment = await db.physicalTagAssignment.findFirst({
    where: { physicalTagId: input.physicalTagId, repairId: input.repairId, releasedAt: null },
    select: { id: true, assignReason: true },
  });
  if (!provisional || provisional.status !== "ACTIVE" || provisional.nfcUid !== null ||
      !assignment || assignment.assignReason !== "B2B一括受付タグ発行")
    throw new PhysicalTagNfcBindError(409, conflict);
  const tag = await db.physicalTag.findUnique({
    where: { nfcUid: input.nfcUid }, select: { id: true, shortCode: true, status: true,
      assignments: { where: { releasedAt: null }, select: { id: true }, take: 1 } },
  });
  if (!tag) return { status: "AVAILABLE" as const };
  if (tag.status !== "ACTIVE") return { status: "RETIRED" as const };
  if (tag.assignments.length) return { status: "ASSIGNED" as const };
  return { status: "REUSABLE" as const, physicalTagId: tag.id, shortCode: tag.shortCode,
    assignmentId: assignment.id };
}

export async function preflightB2bNfcReuse(db: PrismaClient, input: Input) {
  const result = await db.$transaction(tx => inspect(tx, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result.status === "REUSABLE")
    return { status: result.status, physicalTagId: result.physicalTagId, shortCode: result.shortCode };
  return { status: result.status };
}

export async function reuseB2bNfcTag(db: PrismaClient, input: Input & { reusableTagId: number }, adminId: number) {
  return db.$transaction(async tx => {
    const result = await inspect(tx, input);
    if (result.status !== "REUSABLE" || result.physicalTagId !== input.reusableTagId)
      throw new PhysicalTagNfcBindError(409, conflict);
    const claimed = await tx.physicalTag.updateMany({
      where: { id: result.physicalTagId, status: "ACTIVE", nfcUid: input.nfcUid,
        assignments: { none: { releasedAt: null } } },
      data: { status: "ACTIVE" },
    });
    if (claimed.count !== 1) throw new PhysicalTagNfcBindError(409, conflict);
    const now = new Date();
    const released = await tx.physicalTagAssignment.updateMany({
      where: { id: result.assignmentId, physicalTagId: input.physicalTagId,
        repairId: input.repairId, releasedAt: null },
      data: { releasedAt: now, releasedBy: adminId, releaseReason: "B2B NFC既存タグ再利用" },
    });
    if (released.count !== 1) throw new PhysicalTagNfcBindError(409, conflict);
    const retired = await tx.physicalTag.updateMany({
      where: { id: input.physicalTagId, status: "ACTIVE", nfcUid: null, retiredAt: null },
      data: { status: "RETIRED", retiredAt: now, retireReason: "B2B NFC既存タグ再利用" },
    });
    if (retired.count !== 1) throw new PhysicalTagNfcBindError(409, conflict);
    await tx.physicalTagAssignment.create({ data: { physicalTagId: result.physicalTagId,
      repairId: input.repairId, assignedBy: adminId, assignReason: "B2B NFC既存タグ再利用" } });
    return { physicalTagId: result.physicalTagId, repairId: input.repairId,
      nfcUid: input.nfcUid, shortCode: result.shortCode, retiredPhysicalTagId: input.physicalTagId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
