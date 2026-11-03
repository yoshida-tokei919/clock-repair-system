import type { Prisma } from "@prisma/client";
import { resolveLockedLineContact } from "./line-contact";
import { businessEstimateLineKey, resolveLockedBusinessEstimateDestination } from "./estimate-line-confirmation";
import { assertConsolidatedSourceUnpaid, isCurrentConsolidatedPdf, validConsolidatedShareToken } from "./consolidated-invoice-publication";

export class LineContactDestinationInvalidError extends Error {}

/** Applies only to the two B2B intents that may use a delegate. */
export async function assertLineContactOutboxCurrent(tx: Prisma.TransactionClient, outbox: {
  idempotencyKey: string; inquiryId: number; lineManagerChatId: number; sourceRepairId?: number | null;
  text?: string; managerBotIdSnapshot?: string; managerChatIdSnapshot?: string;
}) {
  const consolidated = /^b2b-consolidated-invoice-line:([1-9]\d*)$/.exec(outbox.idempotencyKey);
  if (consolidated) {
    await assertConsolidatedOutboxCurrent(tx, Number(consolidated[1]), outbox);
    return;
  }
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

async function assertConsolidatedOutboxCurrent(tx: Prisma.TransactionClient, id: number, outbox: {
  inquiryId: number; lineManagerChatId: number; sourceRepairId?: number | null;
  text?: string; managerBotIdSnapshot?: string; managerChatIdSnapshot?: string;
}) {
  const invalid = () => new LineContactDestinationInvalidError("集約請求の元請求書・公開PDFまたはLINE送信先が変更されました。");
  if (!Number.isSafeInteger(id) || outbox.sourceRepairId != null) throw invalid();
  const bundle = await tx.consolidatedInvoice.findUnique({ where: { id }, include: {
    sources: { orderBy: { invoiceId: "asc" } }, publication: true,
  } });
  if (!bundle || bundle.sources.length < 2 || new Set(bundle.sources.map(source => source.invoiceId)).size !== bundle.sources.length) throw invalid();
  let total = 0;
  // Match the source Invoice lock order used when queuing the consolidated delivery.
  for (const source of bundle.sources) {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Invoice" WHERE "id" = ${source.invoiceId} FOR UPDATE`;
    if (locked.length !== 1) throw invalid();
    const invoice = await tx.invoice.findUnique({ where: { id: source.invoiceId }, select: {
      id: true, invoiceNumber: true, customerId: true, issuedDate: true, status: true,
      totalAmount: true, taxAmount: true, shippingFeeAmount: true, grossTotalAmount: true,
      sentAt: true, lineSendRetryKey: true, lineSendStartedAt: true, pdfFiles: { select: { sentAt: true } },
      paymentAllocations: { select: { allocatedAmount: true, releases: { select: { amount: true } },
        payment: { select: { customerId: true, status: true, kind: true, provider: true,
          refunds: { select: { amount: true, status: true } } } } } },
    } });
    if (!invoice || invoice.paymentAllocations.length !== 0 || invoice.invoiceNumber !== source.invoiceNumber ||
      invoice.customerId !== source.sourceCustomerId || invoice.issuedDate.getTime() !== source.issuedDate.getTime() ||
      invoice.totalAmount !== source.totalAmount || invoice.taxAmount !== source.taxAmount ||
      invoice.shippingFeeAmount !== source.shippingFeeAmount || invoice.grossTotalAmount !== source.grossTotalAmount ||
      source.grossTotalAmount <= 0 || source.grossTotalAmount !== source.totalAmount + source.taxAmount + source.shippingFeeAmount ||
      invoice.sentAt || invoice.lineSendRetryKey || invoice.lineSendStartedAt || invoice.pdfFiles.some(file => file.sentAt)) throw invalid();
    try { assertConsolidatedSourceUnpaid(source, invoice); } catch { throw invalid(); }
    const prepayments = await tx.payment.count({ where: { kind: "REPAIR_PREPAYMENT", repair: { invoiceId: invoice.id } } });
    if (prepayments !== 0) throw invalid();
    total += source.grossTotalAmount;
  }
  if (!Number.isSafeInteger(total) || total !== bundle.grossTotalAmount) throw invalid();
  const publication = bundle.publication;
  if (!publication) throw invalid();
  const lockedPublication = await tx.$queryRaw<{ id: number }[]>`
    SELECT "id" FROM "ConsolidatedInvoicePublication" WHERE "id" = ${publication.id} FOR UPDATE`;
  const current = await tx.consolidatedInvoicePublication.findUnique({ where: { id: publication.id } });
  if (lockedPublication.length !== 1 || !current || current.consolidatedInvoiceId !== id ||
    !isCurrentConsolidatedPdf(current) || !current.publishedAt || !validConsolidatedShareToken(current.publicToken) ||
    !outbox.text?.includes(`/customer/consolidated-invoices/${current.publicToken}`)) throw invalid();
  for (const source of bundle.sources) {
    if (await tx.lineManagerSendOutbox.findUnique({ where: { idempotencyKey: `b2b-invoice-line:${source.invoiceId}` }, select: { id: true } })) throw invalid();
  }
  const customer = await tx.customer.findUnique({ where: { id: bundle.billingCustomerId }, select: { type: true } });
  if (customer?.type !== "business") throw invalid();
  const users = await tx.lineUser.findMany({ where: { linkedCustomerId: bundle.billingCustomerId }, select: { id: true } });
  if (users.length !== 1) throw invalid();
  const user = users[0];
  const lockedUser = await tx.$queryRaw<{ linkedCustomerId: number | null }[]>`
    SELECT "linkedCustomerId" FROM "LineUser" WHERE "id" = ${user.id} FOR UPDATE`;
  const currentUsers = await tx.lineUser.findMany({ where: { linkedCustomerId: bundle.billingCustomerId }, select: { id: true } });
  const chat = await tx.lineManagerChat.findUnique({ where: { lineUserId: user.id }, select: {
    id: true, lineUserId: true, verifiedAt: true, managerBotId: true, managerChatId: true,
  } });
  if (lockedUser.length !== 1 || lockedUser[0].linkedCustomerId !== bundle.billingCustomerId ||
    currentUsers.length !== 1 || currentUsers[0].id !== user.id ||
    !chat?.verifiedAt || chat.lineUserId !== user.id || chat.id !== outbox.lineManagerChatId ||
    chat.managerBotId !== outbox.managerBotIdSnapshot || chat.managerChatId !== outbox.managerChatIdSnapshot) throw invalid();
  const orderBy = [{ lastReceivedAt: "desc" as const }, { id: "desc" as const }];
  const inquiry = await tx.inquiry.findFirst({ where: { lineUserId: user.id, status: "OPEN" }, orderBy, select: { id: true } })
    ?? await tx.inquiry.findFirst({ where: { lineUserId: user.id }, orderBy, select: { id: true } });
  if (inquiry?.id !== outbox.inquiryId) throw invalid();
}
