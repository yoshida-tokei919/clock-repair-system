import { Prisma, type PrismaClient } from "@prisma/client";

export type StorageLocationAuditInput = { storageLocationId: number; repairIds: number[] };
export type AuditClassification = "MATCH" | "OTHER_LOCATION" | "UNASSIGNED";
export type StorageLocationAuditResult = {
  storageLocation: { storageLocationId: number; name: string; shortCode: string | null; locationType: string };
  scanned: Array<{ repairId: number; inquiryNumber: string; classification: AuditClassification;
    currentLocation: { storageLocationId: number; name: string; shortCode: string | null; locationType: string } | null }>;
  missing: Array<{ repairId: number; inquiryNumber: string }>;
  counts: { match: number; otherLocation: number; unassigned: number; missing: number };
};

export class StorageLocationAuditError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "StorageLocationAuditError";
  }
}

function positiveId(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new StorageLocationAuditError(400, "IDが不正です。");
  }
  return value;
}

export function parseStorageLocationAudit(input: unknown): StorageLocationAuditInput {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new StorageLocationAuditError(400, "入力が不正です。");
  }
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["storageLocationId", "repairIds"].includes(key))) {
    throw new StorageLocationAuditError(400, "入力が不正です。");
  }
  const storageLocationId = positiveId(value.storageLocationId);
  if (!Array.isArray(value.repairIds) || value.repairIds.length > 100) {
    throw new StorageLocationAuditError(400, "修理案件の件数が不正です。");
  }
  const repairIds = value.repairIds.map(positiveId);
  if (new Set(repairIds).size !== repairIds.length) throw new StorageLocationAuditError(400, "修理案件が重複しています。");
  return { storageLocationId, repairIds };
}

export function storageLocationAuditFailure(error: unknown): { status: number; message: string } {
  if (error instanceof StorageLocationAuditError) return { status: error.status, message: error.message };
  return { status: 500, message: "棚卸し結果を確認できませんでした。" };
}

export async function auditStorageLocation(db: PrismaClient, input: StorageLocationAuditInput): Promise<StorageLocationAuditResult> {
  return db.$transaction(async tx => {
    const target = await tx.storageLocation.findUnique({
      where: { id: input.storageLocationId },
      select: { id: true, name: true, shortCode: true, locationType: true, isActive: true },
    });
    if (!target) throw new StorageLocationAuditError(404, "棚卸し場所が見つかりません。");
    if (!target.isActive) throw new StorageLocationAuditError(409, "棚卸し場所は使用できません。");

    const repairs = input.repairIds.length ? await tx.repair.findMany({
      where: { id: { in: input.repairIds } }, select: { id: true, inquiryNumber: true },
    }) : [];
    if (repairs.length !== input.repairIds.length) throw new StorageLocationAuditError(404, "修理案件が見つかりません。");

    const assignments = await tx.storageLocationAssignment.findMany({
      where: { releasedAt: null, OR: [
        { storageLocationId: target.id }, { repairId: { in: input.repairIds } },
      ] },
      select: { repairId: true, storageLocationId: true,
        repair: { select: { inquiryNumber: true } },
        storageLocation: { select: { id: true, name: true, shortCode: true, locationType: true } },
      },
    });
    const byRepair = new Map(assignments.map(assignment => [assignment.repairId, assignment]));
    const repairById = new Map(repairs.map(repair => [repair.id, repair]));
    const scannedIds = new Set(input.repairIds);
    const scanned = input.repairIds.map(repairId => {
      const assignment = byRepair.get(repairId);
      const classification: AuditClassification = !assignment ? "UNASSIGNED" :
        assignment.storageLocationId === target.id ? "MATCH" : "OTHER_LOCATION";
      return { repairId, inquiryNumber: repairById.get(repairId)!.inquiryNumber, classification,
        currentLocation: assignment ? { storageLocationId: assignment.storageLocation.id,
          name: assignment.storageLocation.name, shortCode: assignment.storageLocation.shortCode,
          locationType: assignment.storageLocation.locationType } : null };
    });
    const missing = assignments.filter(assignment => assignment.storageLocationId === target.id &&
      !scannedIds.has(assignment.repairId)).map(assignment => ({
        repairId: assignment.repairId, inquiryNumber: assignment.repair.inquiryNumber,
      })).sort((a, b) => a.repairId - b.repairId);
    return { storageLocation: { storageLocationId: target.id, name: target.name,
      shortCode: target.shortCode, locationType: target.locationType }, scanned, missing,
      counts: { match: scanned.filter(item => item.classification === "MATCH").length,
        otherLocation: scanned.filter(item => item.classification === "OTHER_LOCATION").length,
        unassigned: scanned.filter(item => item.classification === "UNASSIGNED").length,
        missing: missing.length } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
