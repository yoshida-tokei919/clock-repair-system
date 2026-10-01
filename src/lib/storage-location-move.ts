import { Prisma, type PrismaClient } from "@prisma/client";

export type StorageLocationMoveInput = { storageLocationId: number; repairIds: number[]; reason?: string };

export class StorageLocationMoveError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "StorageLocationMoveError";
  }
}

function positiveId(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new StorageLocationMoveError(400, "IDが不正です。");
  }
  return value;
}

export function parseStorageLocationMove(input: unknown): StorageLocationMoveInput {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new StorageLocationMoveError(400, "入力が不正です。");
  }
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["storageLocationId", "repairIds", "reason"].includes(key))) {
    throw new StorageLocationMoveError(400, "入力が不正です。");
  }
  const storageLocationId = positiveId(value.storageLocationId);
  if (!Array.isArray(value.repairIds) || value.repairIds.length < 1 || value.repairIds.length > 100) {
    throw new StorageLocationMoveError(400, "修理案件の件数が不正です。");
  }
  const repairIds = value.repairIds.map(positiveId);
  if (new Set(repairIds).size !== repairIds.length) throw new StorageLocationMoveError(400, "修理案件が重複しています。");
  let reason: string | undefined;
  if (value.reason !== undefined) {
    if (typeof value.reason !== "string" || !value.reason.trim() || value.reason.trim().length > 500) {
      throw new StorageLocationMoveError(400, "理由が不正です。");
    }
    reason = value.reason.trim();
  }
  return { storageLocationId, repairIds, reason };
}

export function storageLocationMoveFailure(error: unknown): { status: number; message: string } {
  if (error instanceof StorageLocationMoveError) return { status: error.status, message: error.message };
  if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
    return { status: 409, message: "保管場所の割当状態が変更されました。再確認してください。" };
  }
  return { status: 500, message: "保管場所の移動に失敗しました。" };
}

export async function moveStorageLocation(db: PrismaClient, input: StorageLocationMoveInput, adminId: number) {
  return db.$transaction(async tx => {
    const destination = await tx.storageLocation.findUnique({
      where: { id: input.storageLocationId },
      select: { id: true, name: true, locationType: true, shortCode: true, isActive: true },
    });
    if (!destination) throw new StorageLocationMoveError(404, "移動先が見つかりません。");
    if (!destination.isActive) throw new StorageLocationMoveError(409, "移動先は使用できません。");

    const repairs = await tx.repair.findMany({
      where: { id: { in: input.repairIds } }, select: { id: true },
    });
    if (repairs.length !== input.repairIds.length) throw new StorageLocationMoveError(404, "修理案件が見つかりません。");

    const activeAssignments = await tx.storageLocationAssignment.findMany({
      where: { repairId: { in: input.repairIds }, releasedAt: null },
      select: { id: true, repairId: true, storageLocationId: true },
    });
    const byRepair = new Map(activeAssignments.map(assignment => [assignment.repairId, assignment]));
    const assignedAt = new Date();
    const moved: Array<{ repairId: number; assignmentId: number; assignedAt: Date; previousStorageLocationId: number | null }> = [];
    const unchangedRepairIds: number[] = [];
    for (const repairId of input.repairIds) {
      const previous = byRepair.get(repairId);
      if (previous?.storageLocationId === destination.id) {
        unchangedRepairIds.push(repairId);
        continue;
      }
      if (previous) {
        const released = await tx.storageLocationAssignment.updateMany({
          where: { id: previous.id, repairId, storageLocationId: previous.storageLocationId, releasedAt: null },
          data: { releasedAt: assignedAt, releasedBy: adminId, releaseReason: input.reason ?? "保管場所移動" },
        });
        if (released.count !== 1) throw new StorageLocationMoveError(409, "保管場所の割当状態が変更されました。");
      }
      const created = await tx.storageLocationAssignment.create({
        data: { storageLocationId: destination.id, repairId, assignedAt, assignedBy: adminId,
          assignReason: input.reason ?? (previous ? "保管場所移動" : "保管場所登録") },
        select: { id: true, assignedAt: true },
      });
      moved.push({ repairId, assignmentId: created.id, assignedAt: created.assignedAt,
        previousStorageLocationId: previous?.storageLocationId ?? null });
    }
    return { storageLocation: { storageLocationId: destination.id, name: destination.name,
      locationType: destination.locationType, shortCode: destination.shortCode }, moved, unchangedRepairIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
