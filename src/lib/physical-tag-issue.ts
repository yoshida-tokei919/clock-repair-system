import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { parsePhysicalTagIdentifier, PhysicalTagIdentifierError } from "./physical-tag-resolver";

export class PhysicalTagIssueError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "PhysicalTagIssueError";
  }
}

export function parsePhysicalTagIssue(body: unknown): { repairId: number; nfcUid?: string; reusableTagId?: number } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PhysicalTagIssueError(400, "入力が不正です。");
  }
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !["repairId", "nfcUid", "reusableTagId", "confirmed"].includes(key)) ||
      typeof value.repairId !== "number" || !Number.isInteger(value.repairId) ||
      value.repairId < 1 || value.repairId > 2147483647) {
    throw new PhysicalTagIssueError(400, "入力が不正です。");
  }
  if (value.reusableTagId !== undefined &&
      (typeof value.reusableTagId !== "number" || !Number.isInteger(value.reusableTagId) ||
       value.reusableTagId < 1 || value.reusableTagId > 2147483647 || value.confirmed !== true ||
       value.nfcUid === undefined))
    throw new PhysicalTagIssueError(400, "入力が不正です。");
  if (value.confirmed !== undefined && value.reusableTagId === undefined)
    throw new PhysicalTagIssueError(400, "入力が不正です。");
  if (value.nfcUid === undefined) return { repairId: value.repairId };
  try {
    const identifier = parsePhysicalTagIdentifier({ type: "NFC_UID", value: value.nfcUid });
    return { repairId: value.repairId, nfcUid: identifier.value,
      ...(value.reusableTagId === undefined ? {} : { reusableTagId: value.reusableTagId as number }) };
  } catch (error) {
    if (error instanceof PhysicalTagIdentifierError) {
      throw new PhysicalTagIssueError(400, "NFC UIDが不正です。");
    }
    throw error;
  }
}

export function physicalTagIssueFailure(error: unknown): { status: number; message: string } {
  if (error instanceof PhysicalTagIssueError) return { status: error.status, message: error.message };
  if (error && typeof error === "object" && "code" in error &&
      (error.code === "P2002" || error.code === "P2034")) {
    return { status: 409, message: "NFC UIDまたはタグの割当が重複しました。再確認してください。" };
  }
  return { status: 500, message: "管理タグの発行に失敗しました。" };
}

const changed = "タグの状態が変わりました。NFC UIDを再確認してください。";

async function inspect(db: Prisma.TransactionClient, input: { repairId: number; nfcUid: string }) {
  const repair = await db.repair.findUnique({ where: { id: input.repairId }, select: { id: true } });
  if (!repair) throw new PhysicalTagIssueError(404, "修理案件が見つかりません。");
  const active = await db.physicalTagAssignment.findFirst({
    where: { repairId: input.repairId, releasedAt: null }, select: { id: true },
  });
  if (active) throw new PhysicalTagIssueError(409, "修理案件にはタグが割当済みです。");
  const tag = await db.physicalTag.findUnique({
    where: { nfcUid: input.nfcUid },
    select: { id: true, shortCode: true, qrToken: true, nfcUid: true, status: true,
      assignments: { where: { releasedAt: null }, select: { id: true }, take: 1 } },
  });
  if (!tag) return { status: "AVAILABLE" as const };
  if (tag.status !== "ACTIVE") return { status: "RETIRED" as const };
  if (tag.assignments.length) return { status: "ASSIGNED" as const };
  const released = await db.physicalTagAssignment.findFirst({
    where: { physicalTagId: tag.id, releasedAt: { not: null } }, select: { id: true },
  });
  if (!released) return { status: "UNAVAILABLE" as const };
  return { status: "REUSABLE" as const, tag };
}

export async function preflightPhysicalTagIssue(db: PrismaClient, input: { repairId: number; nfcUid: string }) {
  const result = await db.$transaction(tx => inspect(tx, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return result.status === "REUSABLE"
    ? { status: result.status, physicalTagId: result.tag.id, shortCode: result.tag.shortCode }
    : { status: result.status };
}

export async function issuePhysicalTag(
  db: PrismaClient, input: { repairId: number; nfcUid?: string; reusableTagId?: number }, adminId: number,
) {
  const qrToken = randomBytes(24).toString("base64url");
  const temporaryShortCode = `PENDING-${randomBytes(16).toString("hex")}`;
  return db.$transaction(async tx => {
    if (input.reusableTagId !== undefined) {
      if (!input.nfcUid) throw new PhysicalTagIssueError(400, "NFC UIDが不正です。");
      const result = await inspect(tx, { repairId: input.repairId, nfcUid: input.nfcUid });
      if (result.status !== "REUSABLE" || result.tag.id !== input.reusableTagId)
        throw new PhysicalTagIssueError(409, changed);
      const claimed = await tx.physicalTag.updateMany({
        where: { id: result.tag.id, status: "ACTIVE", nfcUid: input.nfcUid,
          assignments: { none: { releasedAt: null } } }, data: { status: "ACTIVE" },
      });
      if (claimed.count !== 1) throw new PhysicalTagIssueError(409, changed);
      const assignment = await tx.physicalTagAssignment.create({
        data: { physicalTagId: result.tag.id, repairId: input.repairId,
          assignedBy: adminId, assignReason: "管理タグ再割当" },
        select: { id: true, assignedAt: true },
      });
      return { physicalTagId: result.tag.id, shortCode: result.tag.shortCode,
        qrToken: result.tag.qrToken, nfcUid: result.tag.nfcUid,
        assignmentId: assignment.id, assignedAt: assignment.assignedAt, repairId: input.repairId };
    }
    const repair = await tx.repair.findUnique({
      where: { id: input.repairId }, select: { id: true },
    });
    if (!repair) throw new PhysicalTagIssueError(404, "修理案件が見つかりません。");
    const active = await tx.physicalTagAssignment.findFirst({
      where: { repairId: input.repairId, releasedAt: null }, select: { id: true },
    });
    if (active) throw new PhysicalTagIssueError(409, "修理案件にはタグが割当済みです。");
    if (input.nfcUid) {
      const existing = await tx.physicalTag.findUnique({
        where: { nfcUid: input.nfcUid }, select: { id: true },
      });
      if (existing) throw new PhysicalTagIssueError(409, changed);
    }

    const tag = await tx.physicalTag.create({
      data: { shortCode: temporaryShortCode, qrToken, nfcUid: input.nfcUid, status: "ACTIVE" },
      select: { id: true },
    });
    const updated = await tx.physicalTag.update({
      where: { id: tag.id },
      data: { shortCode: `PT-${String(tag.id).padStart(6, "0")}` },
      select: { id: true, shortCode: true, qrToken: true, nfcUid: true },
    });
    const assignment = await tx.physicalTagAssignment.create({
      data: { physicalTagId: tag.id, repairId: input.repairId,
        assignedBy: adminId, assignReason: "管理タグ発行" },
      select: { id: true, assignedAt: true },
    });
    return {
      physicalTagId: updated.id, shortCode: updated.shortCode, qrToken: updated.qrToken,
      nfcUid: updated.nfcUid, assignmentId: assignment.id,
      assignedAt: assignment.assignedAt, repairId: input.repairId,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
