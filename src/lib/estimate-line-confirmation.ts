import crypto from "crypto";
import type { Prisma } from "@prisma/client";

const KEY_PREFIX = "estimate-document-line:";
const WAITING_FOR_APPROVAL_STATUS = "承認待ち";
const APPROVAL_SOURCE_STATUSES = ["受付", "見積中"];

export type EstimateLineRepairSnapshot = {
  id: number;
  customerId: number;
  inquiryWatchPromotion: {
    id: number;
    inquiryId: number;
    promotedRepairId: number | null;
    inquiry: { lineUser: {
      linkedCustomerId: number | null;
      lineManagerChat: { id: number; verifiedAt: Date } | null;
    } };
  } | null;
};

export function estimateLineKey(documentId: number, customerId: number, repairs: EstimateLineRepairSnapshot[]) {
  const snapshot = [customerId, ...repairs.map((repair) => [
    repair.id, repair.customerId, repair.inquiryWatchPromotion?.id,
    repair.inquiryWatchPromotion?.inquiryId, repair.inquiryWatchPromotion?.promotedRepairId,
    repair.inquiryWatchPromotion?.inquiry.lineUser.linkedCustomerId,
    repair.inquiryWatchPromotion?.inquiry.lineUser.lineManagerChat?.id,
    repair.inquiryWatchPromotion?.inquiry.lineUser.lineManagerChat?.verifiedAt?.toISOString(),
  ])];
  const digest = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  return `${KEY_PREFIX}${documentId}:${digest}`;
}

export function estimateLineKeyPrefix(documentId: number) { return `${KEY_PREFIX}${documentId}:`; }

/** Runs only for estimate intents after the Manager message has been verified. Drift skips the status effect. */
export async function transitionConfirmedEstimateRepairs(
  tx: Prisma.TransactionClient,
  outbox: { idempotencyKey: string; inquiryId: number; lineManagerChatId: number; sourceRepairId: number | null },
  confirmedAt: Date,
) {
  const match = /^estimate-document-line:([1-9]\d*):([a-f0-9]{64})$/.exec(outbox.idempotencyKey);
  if (!match) return 0;
  const documentId = Number(match[1]);
  if (!Number.isSafeInteger(documentId)) return 0;

  // Lock the document and current members so a concurrent edit cannot make the validation stale.
  const documents = await tx.$queryRaw<{ customerId: number }[]>`
    SELECT "customerId" FROM "EstimateDocument" WHERE "id" = ${documentId} FOR UPDATE
  `;
  if (documents.length !== 1) return 0;
  const lockedRepairs = await tx.$queryRaw<{ id: number }[]>`
    SELECT "id" FROM "Repair" WHERE "estimateDocumentId" = ${documentId} ORDER BY "id" FOR UPDATE
  `;
  const repairs = await tx.repair.findMany({
    where: { estimateDocumentId: documentId }, orderBy: { id: "asc" },
    select: {
      id: true, customerId: true, status: true,
      inquiryWatchPromotion: { select: {
        id: true, inquiryId: true, promotedRepairId: true,
        inquiry: { select: { lineUser: { select: {
          linkedCustomerId: true,
          lineManagerChat: { select: { id: true, verifiedAt: true } },
        } } } },
      } },
    },
  });
  const customerId = documents[0].customerId;
  if (!repairs.length || repairs.length !== lockedRepairs.length ||
      repairs.some((repair, index) => repair.id !== lockedRepairs[index]?.id ||
        repair.customerId !== customerId ||
        repair.inquiryWatchPromotion?.promotedRepairId !== repair.id ||
        repair.inquiryWatchPromotion?.inquiryId !== outbox.inquiryId ||
        repair.inquiryWatchPromotion?.inquiry.lineUser.linkedCustomerId !== customerId ||
        repair.inquiryWatchPromotion?.inquiry.lineUser.lineManagerChat?.id !== outbox.lineManagerChatId ||
        !repair.inquiryWatchPromotion?.inquiry.lineUser.lineManagerChat?.verifiedAt) ||
      (outbox.sourceRepairId ?? null) !== (repairs.length === 1 ? repairs[0].id : null) ||
      estimateLineKey(documentId, customerId, repairs) !== outbox.idempotencyKey) return 0;

  let changed = 0;
  for (const repair of repairs) {
    if (!APPROVAL_SOURCE_STATUSES.includes(repair.status)) continue;
    const updated = await tx.repair.updateMany({
      where: { id: repair.id, estimateDocumentId: documentId, customerId,
        status: { in: APPROVAL_SOURCE_STATUSES } },
      data: { status: WAITING_FOR_APPROVAL_STATUS },
    });
    if (updated.count !== 1) continue;
    const existingLog = await tx.repairStatusLog.findFirst({
      where: { repairId: repair.id, status: WAITING_FOR_APPROVAL_STATUS }, select: { id: true },
    });
    if (!existingLog) await tx.repairStatusLog.create({
      data: { repairId: repair.id, status: WAITING_FOR_APPROVAL_STATUS, changedAt: confirmedAt },
    });
    changed++;
  }
  return changed;
}
