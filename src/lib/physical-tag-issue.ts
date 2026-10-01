import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { parsePhysicalTagIdentifier, PhysicalTagIdentifierError } from "./physical-tag-resolver";

export class PhysicalTagIssueError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "PhysicalTagIssueError";
  }
}

export function parsePhysicalTagIssue(body: unknown): { repairId: number; nfcUid?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PhysicalTagIssueError(400, "入力が不正です。");
  }
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !["repairId", "nfcUid"].includes(key)) ||
      typeof value.repairId !== "number" || !Number.isInteger(value.repairId) ||
      value.repairId < 1 || value.repairId > 2147483647) {
    throw new PhysicalTagIssueError(400, "入力が不正です。");
  }
  if (value.nfcUid === undefined) return { repairId: value.repairId };
  try {
    const identifier = parsePhysicalTagIdentifier({ type: "NFC_UID", value: value.nfcUid });
    return { repairId: value.repairId, nfcUid: identifier.value };
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

export async function issuePhysicalTag(
  db: PrismaClient, input: { repairId: number; nfcUid?: string }, adminId: number,
) {
  const qrToken = randomBytes(24).toString("base64url");
  const temporaryShortCode = `PENDING-${randomBytes(16).toString("hex")}`;
  return db.$transaction(async tx => {
    const repair = await tx.repair.findUnique({
      where: { id: input.repairId }, select: { id: true },
    });
    if (!repair) throw new PhysicalTagIssueError(404, "修理案件が見つかりません。");
    const active = await tx.physicalTagAssignment.findFirst({
      where: { repairId: input.repairId, releasedAt: null }, select: { id: true },
    });
    if (active) throw new PhysicalTagIssueError(409, "修理案件にはタグが割当済みです。");

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
