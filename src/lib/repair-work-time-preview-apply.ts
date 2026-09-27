import { Prisma, type PrismaClient } from "@prisma/client";
import { getRepairWorkTimePreview } from "@/lib/repair-work-time-preview";

export class StaleWorkTimePreviewError extends Error {
  constructor() { super("作業時間のプレビューが変更されました。再プレビューしてください。"); }
}

export class UnsafeWorkTimePreviewError extends Error {
  constructor() { super("完全で有効な作業時間のプレビューが必要です。"); }
}

export function parseWorkTimePreviewApplyBody(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== 1 || !("revision" in value) ||
    typeof value.revision !== "string" || !/^[0-9a-f]{64}$/.test(value.revision)) {
    throw new Error("Invalid work-time preview revision.");
  }
  return value.revision;
}

export async function applyRepairWorkTimePreview(db: PrismaClient, repairId: number,
  revision: string, now = new Date()) {
  return db.$transaction(async tx => {
    const preview = await getRepairWorkTimePreview(tx, repairId, now);
    if (!preview) return null;
    if (preview.revision !== revision) throw new StaleWorkTimePreviewError();
    const minutes = preview.roundedEstimatedWorkMinutes;
    if (!preview.complete || minutes === null || !Number.isSafeInteger(minutes) ||
      minutes <= 0 || minutes > 2147483647) throw new UnsafeWorkTimePreviewError();
    const updated = await tx.repair.updateMany({
      where: { id: repairId, estimatedWorkMinutes: preview.currentEstimatedWorkMinutes },
      data: { estimatedWorkMinutes: minutes },
    });
    if (updated.count !== 1) throw new StaleWorkTimePreviewError();
    return { estimatedWorkMinutes: minutes };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function applyRepairWorkTimePreviewRequest(db: PrismaClient, repairId: number,
  body: unknown, now = new Date()) {
  let revision: string;
  try {
    revision = parseWorkTimePreviewApplyBody(body);
  } catch {
    return { status: 400, body: { error: "Invalid work-time preview revision." } };
  }
  try {
    const applied = await applyRepairWorkTimePreview(db, repairId, revision, now);
    if (!applied) return { status: 404, body: { error: "Repair not found" } };
    return { status: 200, body: applied };
  } catch (error) {
    if (error instanceof StaleWorkTimePreviewError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"))
      return { status: 409, body: { error: "作業時間のプレビューが変更されました。再プレビューしてください。" } };
    if (error instanceof UnsafeWorkTimePreviewError ||
      (error instanceof Error && error.message === "SchedulerSetting is missing."))
      return { status: 409, body: { error: error.message } };
    throw error;
  }
}
