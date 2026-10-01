import { Prisma, type PrismaClient } from "@prisma/client";

export type PhysicalTagAction = "assign" | "release" | "replace";
export type PhysicalTagInput =
  | { action: "assign"; physicalTagId: number; repairId: number; reason?: string }
  | { action: "release"; repairId: number; reason?: string }
  | { action: "replace"; repairId: number; replacementPhysicalTagId: number; reason: string };

export class PhysicalTagLifecycleError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "PhysicalTagLifecycleError";
  }
}

function positiveId(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new PhysicalTagLifecycleError(400, "IDが不正です。");
  }
  return value;
}

export function parsePhysicalTagAction(action: PhysicalTagAction, body: unknown): PhysicalTagInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PhysicalTagLifecycleError(400, "入力が不正です。");
  }
  const value = body as Record<string, unknown>;
  const allowed = action === "assign"
    ? ["physicalTagId", "repairId", "reason"]
    : action === "replace" ? ["repairId", "replacementPhysicalTagId", "reason"] : ["repairId", "reason"];
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new PhysicalTagLifecycleError(400, "入力が不正です。");
  }
  let reason: string | undefined;
  if (value.reason !== undefined) {
    if (typeof value.reason !== "string" || !value.reason.trim() || value.reason.trim().length > 500) {
      throw new PhysicalTagLifecycleError(400, "理由が不正です。");
    }
    reason = value.reason.trim();
  }
  const repairId = positiveId(value.repairId);
  if (action === "assign") {
    return { action, repairId, physicalTagId: positiveId(value.physicalTagId), reason };
  }
  if (action === "replace") {
    if (!reason) throw new PhysicalTagLifecycleError(400, "交換理由が必要です。");
    return { action, repairId, replacementPhysicalTagId: positiveId(value.replacementPhysicalTagId), reason };
  }
  return { action, repairId, reason };
}

export function physicalTagLifecycleFailure(error: unknown): { status: number; message: string } {
  if (error instanceof PhysicalTagLifecycleError) return { status: error.status, message: error.message };
  if (error && typeof error === "object" && "code" in error &&
    (error.code === "P2002" || error.code === "P2034")) {
    return { status: 409, message: "タグの割当状態が変更されました。再確認してください。" };
  }
  return { status: 500, message: "PhysicalTagの操作に失敗しました。" };
}

export async function applyPhysicalTagAction(db: PrismaClient, input: PhysicalTagInput, adminId: number) {
  return db.$transaction(async tx => {
    if (input.action === "assign") {
      const tag = await tx.physicalTag.findUnique({
        where: { id: input.physicalTagId }, select: { id: true, status: true },
      });
      if (!tag) throw new PhysicalTagLifecycleError(404, "タグが見つかりません。");
      if (tag.status !== "ACTIVE") throw new PhysicalTagLifecycleError(409, "タグは使用できません。");
      const repair = await tx.repair.findUnique({ where: { id: input.repairId }, select: { id: true } });
      if (!repair) throw new PhysicalTagLifecycleError(404, "修理案件が見つかりません。");
      const activeTag = await tx.physicalTagAssignment.findFirst({
        where: { physicalTagId: input.physicalTagId, releasedAt: null }, select: { id: true },
      });
      if (activeTag) throw new PhysicalTagLifecycleError(409, "タグは割当済みです。");
      const activeRepair = await tx.physicalTagAssignment.findFirst({
        where: { repairId: input.repairId, releasedAt: null }, select: { id: true },
      });
      if (activeRepair) throw new PhysicalTagLifecycleError(409, "修理案件にはタグが割当済みです。");
      const created = await tx.physicalTagAssignment.create({
        data: { physicalTagId: input.physicalTagId, repairId: input.repairId,
          assignedBy: adminId, assignReason: input.reason },
        select: { id: true, physicalTagId: true, repairId: true, assignedAt: true },
      });
      return { assignmentId: created.id, physicalTagId: created.physicalTagId,
        repairId: created.repairId, assignedAt: created.assignedAt };
    }

    const active = await tx.physicalTagAssignment.findFirst({
      where: { repairId: input.repairId, releasedAt: null },
      select: { id: true, physicalTagId: true, repairId: true, assignedAt: true },
    });
    if (!active) throw new PhysicalTagLifecycleError(404, "有効なタグ割当が見つかりません。");
    if (input.action === "replace" && active.physicalTagId === input.replacementPhysicalTagId) {
      throw new PhysicalTagLifecycleError(409, "同じタグには交換できません。");
    }

    if (input.action === "replace") {
      const replacement = await tx.physicalTag.findUnique({
        where: { id: input.replacementPhysicalTagId }, select: { id: true, status: true },
      });
      if (!replacement) throw new PhysicalTagLifecycleError(404, "交換先タグが見つかりません。");
      if (replacement.status !== "ACTIVE") throw new PhysicalTagLifecycleError(409, "交換先タグは使用できません。");
      const assigned = await tx.physicalTagAssignment.findFirst({
        where: { physicalTagId: input.replacementPhysicalTagId, releasedAt: null }, select: { id: true },
      });
      if (assigned) throw new PhysicalTagLifecycleError(409, "交換先タグは割当済みです。");
    }

    const releasedAt = new Date();
    const released = await tx.physicalTagAssignment.updateMany({
      where: { id: active.id, releasedAt: null },
      data: { releasedAt, releasedBy: adminId, releaseReason: input.reason },
    });
    if (released.count !== 1) throw new PhysicalTagLifecycleError(409, "タグの割当状態が変更されました。");
    if (input.action === "release") {
      return { assignmentId: active.id, physicalTagId: active.physicalTagId,
        repairId: active.repairId, releasedAt };
    }

    const retired = await tx.physicalTag.updateMany({
      where: { id: active.physicalTagId, status: "ACTIVE", retiredAt: null },
      data: { status: "RETIRED", retiredAt: releasedAt, retireReason: input.reason },
    });
    if (retired.count !== 1) throw new PhysicalTagLifecycleError(409, "交換元タグは使用できません。");
    const created = await tx.physicalTagAssignment.create({
      data: { physicalTagId: input.replacementPhysicalTagId, repairId: input.repairId,
        assignedBy: adminId, assignReason: input.reason },
      select: { id: true, physicalTagId: true, repairId: true, assignedAt: true },
    });
    return { releasedAssignmentId: active.id, assignmentId: created.id,
      retiredPhysicalTagId: active.physicalTagId, physicalTagId: created.physicalTagId,
      repairId: created.repairId, releasedAt, assignedAt: created.assignedAt };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
