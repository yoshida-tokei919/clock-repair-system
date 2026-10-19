import type { Prisma } from "@prisma/client";
import { resolveLockedLineContact } from "./line-contact";
import { businessEstimateLineKey, resolveLockedBusinessEstimateDestination } from "./estimate-line-confirmation";

export class LineContactDestinationInvalidError extends Error {}

/** Applies only to the two B2B intents that may use a delegate. */
export async function assertLineContactOutboxCurrent(tx: Prisma.TransactionClient, outbox: {
  idempotencyKey: string; inquiryId: number; lineManagerChatId: number; sourceRepairId?: number | null;
}) {
  const estimate = /^estimate-document-line:([1-9]\d*):[a-f0-9]{64}$/.exec(outbox.idempotencyKey);
  const comment = /^b2b-repair-comment-notice:([1-9]\d*)$/.exec(outbox.idempotencyKey);
  if (!estimate && !comment) return;
  const id = Number((estimate ?? comment)![1]);
  if (!Number.isSafeInteger(id)) throw new LineContactDestinationInvalidError("LINE送信元を確認できません。");
  const source = estimate
    ? await tx.estimateDocument.findUnique({ where: { id }, select: { customerId: true } })
    : await tx.repairCustomerMessage.findUnique({ where: { id }, select: { repairId: true, repair: { select: { customerId: true } } } });
  const customerId = source && ("customerId" in source ? source.customerId : source.repair.customerId);
  if (!customerId) throw new LineContactDestinationInvalidError("LINE送信元を確認できません。");
  let contact: Awaited<ReturnType<typeof resolveLockedLineContact>>;
  try {
    contact = await resolveLockedLineContact(tx, customerId);
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("LINE連絡先") || error.message === "顧客が見つかりません。")) {
      throw new LineContactDestinationInvalidError(error.message);
    }
    throw error;
  }
  if (comment && (!source || !('repairId' in source) ||
      (outbox.sourceRepairId !== source.repairId && !(outbox.sourceRepairId == null && contact.source.lineContactCustomerId === null)))) {
    throw new LineContactDestinationInvalidError("LINE通知の修理案件が変更されました。");
  }
  if (contact.source.type !== "business") return; // Existing B2C estimate path has its own origin validation.
  const destination = await resolveLockedBusinessEstimateDestination(tx, contact.contactCustomerId);
  if (!destination || destination.inquiryId !== outbox.inquiryId || destination.lineManagerChatId !== outbox.lineManagerChatId) {
    throw new LineContactDestinationInvalidError("LINE代理連絡先または確認済み送信先が変更されました。");
  }
  if (estimate) {
    const repairs = await tx.repair.findMany({ where: { estimateDocumentId: id }, select: { id: true, customerId: true }, orderBy: { id: "asc" } });
    if (!repairs.length || repairs.some(repair => repair.customerId !== customerId) ||
        businessEstimateLineKey(id, customerId, repairs, destination, contact.contactCustomerId) !== outbox.idempotencyKey) {
      throw new LineContactDestinationInvalidError("見積書の修理案件またはLINE連絡先が変更されました。");
    }
  }
}
