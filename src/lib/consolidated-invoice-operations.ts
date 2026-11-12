import { Prisma, type PrismaClient } from "@prisma/client";
import { buildCustomerShareUrl } from "./customer-share-url";
import { assertConsolidatedSourceUnpaid, isCurrentConsolidatedPdf, validConsolidatedShareToken } from "./consolidated-invoice-publication";
import { calculateInvoicePaymentSummary } from "./invoice-payment";
import { buildInvoiceLineMessage, invoiceDeliveryKey, resolveInvoiceLineDestination } from "./invoice-delivery-routing";
import { lockInvoiceRecipientCustomers } from "./invoice-recipient";
import { createApprovedLineManagerSendOutbox } from "./line-manager-send-outbox";
import { hasDiscountSnapshot } from "./b2b-invoice-discount";
import { historicalRefundAllocationSelect } from "./b2b-historical-refund-allocation";

export class ConsolidatedOperationError extends Error {
  constructor(message: string, readonly postal = false) { super(message); }
}

export const consolidatedDeliveryKey = (id: number) => `b2b-consolidated-invoice-line:${id}`;
export const consolidatedPaymentPurpose = (id: number) => `consolidated-invoice:${id}`;

export async function hasIndividualInvoiceOutbox(tx: Prisma.TransactionClient, invoiceId: number) {
  return !!await tx.lineManagerSendOutbox.findUnique({
    where: { idempotencyKey: invoiceDeliveryKey(invoiceId) }, select: { id: true },
  });
}

export function consolidatedPaymentTotals(sources: readonly { paidAmount: number; outstandingBalance: number; refundCreditAmount?: number }[]) {
  const paidAmount = sources.reduce((sum, row) => sum + row.paidAmount, 0);
  const outstandingBalance = sources.reduce((sum, row) => sum + row.outstandingBalance, 0);
  const refundCreditAmount = sources.reduce((sum, row) => sum + (row.refundCreditAmount ?? 0), 0);
  return { paidAmount, outstandingBalance,
    paymentStatus: outstandingBalance === 0 ? (paidAmount > 0 ? "PAID" as const : refundCreditAmount > 0 ? "CREDITED" as const : "PAID" as const)
      : paidAmount > 0 ? "PARTIAL" as const : "UNPAID" as const };
}

const allocationSelect = { allocatedAmount: true, releases: { select: { amount: true } },
  payment: { select: { customerId: true, status: true, kind: true, provider: true,
    refunds: { select: { amount: true, status: true } } } } } as const;

export async function lockAndCheckConsolidatedSources(tx: Prisma.TransactionClient, bundleId: number) {
  if (await tx.consolidatedInvoiceSupersession.findUnique({ where: { oldBundleId: bundleId }, select: { id: true } })) {
    throw new ConsolidatedOperationError("取り消された集約請求は送信・入金登録できません。");
  }
  const bundle = await tx.consolidatedInvoice.findUnique({ where: { id: bundleId }, include: {
    sources: { orderBy: { invoiceId: "asc" } }, publication: true,
  } });
  if (!bundle || bundle.sources.length < 2 || new Set(bundle.sources.map(row => row.invoiceId)).size !== bundle.sources.length) {
    throw new ConsolidatedOperationError("集約請求が見つからないか、元請求書が不完全です。");
  }
  let total = 0;
  const invoices = [];
  for (const source of bundle.sources) {
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Invoice" WHERE "id" = ${source.invoiceId} FOR UPDATE`;
    if (locked.length !== 1) throw new ConsolidatedOperationError("元請求書が変更されました。");
    const invoice = await tx.invoice.findUnique({ where: { id: source.invoiceId }, select: {
      id: true, invoiceNumber: true, customerId: true, issuedDate: true, status: true,
      totalAmount: true, taxAmount: true, shippingFeeAmount: true, grossTotalAmount: true,
      discountBasisAmount: true, discountRateBps: true, discountAmount: true,
      sentAt: true, lineSendRetryKey: true, lineSendStartedAt: true,
      pdfFiles: { select: { sentAt: true } }, paymentAllocations: { select: allocationSelect },
       historicalRefundAllocations: { select: historicalRefundAllocationSelect, orderBy: { id: "asc" } },
    } });
    if (!invoice || invoice.issuedDate.getTime() !== source.issuedDate.getTime() ||
      invoice.totalAmount !== source.totalAmount || invoice.taxAmount !== source.taxAmount ||
      invoice.discountBasisAmount !== source.discountBasisAmount || invoice.discountRateBps !== source.discountRateBps ||
      invoice.discountAmount !== source.discountAmount || !hasDiscountSnapshot(source) ||
      invoice.shippingFeeAmount !== source.shippingFeeAmount ||
      source.grossTotalAmount <= 0 ||
      source.grossTotalAmount !== source.totalAmount + source.taxAmount + source.shippingFeeAmount) {
      throw new ConsolidatedOperationError("元請求書の確定内容が作成時から変更されました。");
    }
    try { assertConsolidatedSourceUnpaid(source, invoice); }
    catch { throw new ConsolidatedOperationError("元請求書に入金・処理中決済があるか、状態が変更されました。"); }
    // A prepayment for an underlying repair may exist without an invoice allocation yet.
    const prepayments = await tx.payment.count({ where: { kind: "REPAIR_PREPAYMENT", repair: { invoiceId: invoice.id } } });
    if (prepayments || invoice.paymentAllocations.length) {
      throw new ConsolidatedOperationError("元請求書に入金・前受金または処理履歴があります。個別に確認してください。");
    }
    invoices.push(invoice);
    total += source.grossTotalAmount;
  }
  if (!Number.isSafeInteger(total) || total !== bundle.grossTotalAmount || total <= 0) {
    throw new ConsolidatedOperationError("集約請求の合計額が一致しません。");
  }
  return { bundle, invoices };
}

export async function queueConsolidatedInvoiceLine(db: PrismaClient, id: number, requestUrl: string,
  createApproved = createApprovedLineManagerSendOutbox) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ConsolidatedOperationError("集約請求IDが不正です。");
  return db.$transaction(async tx => {
    const initial = await tx.consolidatedInvoice.findUnique({ where: { id }, select: { billingCustomerId: true } });
    if (!initial) throw new ConsolidatedOperationError("集約請求が見つかりません。");
    const customers = await lockInvoiceRecipientCustomers(tx, [initial.billingCustomerId]);
    if (customers.get(initial.billingCustomerId)?.type !== "business") throw new ConsolidatedOperationError("請求先の法人顧客を確認できません。", true);
    const { bundle, invoices } = await lockAndCheckConsolidatedSources(tx, id);
    if (bundle.billingCustomerId !== initial.billingCustomerId) throw new ConsolidatedOperationError("請求先が変更されました。", true);
    const publication = bundle.publication;
    if (!isCurrentConsolidatedPdf(publication) || !validConsolidatedShareToken(publication.publicToken) || !publication.publishedAt) {
      throw new ConsolidatedOperationError("公開済みの集約請求PDFを確認できません。");
    }
    const current = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "ConsolidatedInvoicePublication" WHERE "id" = ${publication.id} FOR UPDATE`;
    if (current.length !== 1) throw new ConsolidatedOperationError("集約請求PDFが変更されました。");
    for (const invoice of invoices) {
      if (invoice.sentAt || invoice.lineSendRetryKey || invoice.lineSendStartedAt || invoice.pdfFiles.some(file => file.sentAt)) {
        throw new ConsolidatedOperationError("元請求書に個別送信履歴または未確定の送信があります。");
      }
      if (await tx.lineManagerSendOutbox.findUnique({ where: { idempotencyKey: invoiceDeliveryKey(invoice.id) }, select: { id: true } })) {
        throw new ConsolidatedOperationError("元請求書に個別LINE送信履歴があります。");
      }
    }
    const key = consolidatedDeliveryKey(id);
    const existing = await tx.lineManagerSendOutbox.findUnique({ where: { idempotencyKey: key }, select: { status: true } });
    if (existing?.status === "CANCELLED") throw new ConsolidatedOperationError("取り消されたLINE送信待ちは再登録できません。");
    if (existing) return { method: "LINE" as const, outboxStatus: existing.status };
    const destination = await resolveInvoiceLineDestination(tx, bundle.billingCustomerId);
    if (!destination) throw new ConsolidatedOperationError("確認済みのLINE送信先がないため郵送対象です。", true);
    const users = await tx.$queryRaw<{ linkedCustomerId: number | null }[]>`
      SELECT "linkedCustomerId" FROM "LineUser" WHERE "id" = ${destination.lineUserId} FOR UPDATE`;
    const currentDestination = await resolveInvoiceLineDestination(tx, bundle.billingCustomerId);
    if (users.length !== 1 || users[0].linkedCustomerId !== bundle.billingCustomerId ||
      currentDestination?.lineUserId !== destination.lineUserId || currentDestination?.inquiryId !== destination.inquiryId ||
      currentDestination?.lineManagerChatId !== destination.lineManagerChatId) {
      throw new ConsolidatedOperationError("LINE送信先の紐付けが変更されました。", true);
    }
    const text = buildInvoiceLineMessage("集約", buildCustomerShareUrl(`/customer/consolidated-invoices/${publication.publicToken}`, requestUrl));
    const outbox = await createApproved(tx, { inquiryId: destination.inquiryId, lineManagerChatId: destination.lineManagerChatId, text, idempotencyKey: key });
    if (outbox.status === "CANCELLED") throw new ConsolidatedOperationError("取り消されたLINE送信待ちは再登録できません。");
    return { method: "LINE" as const, outboxStatus: outbox.status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function confirmConsolidatedBankReceipt(db: PrismaClient, id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ConsolidatedOperationError("集約請求IDが不正です。");
  return db.$transaction(async tx => {
    const { bundle, invoices } = await lockAndCheckConsolidatedSources(tx, id);
    const purpose = consolidatedPaymentPurpose(id);
    const prior = await tx.payment.findFirst({ where: { purpose }, select: { id: true } });
    if (prior) throw new ConsolidatedOperationError("この集約請求の入金登録履歴があります。確認してください。");
    const paidAt = new Date();
    const payments = [];
    let receivedAmount = 0;
    for (const invoice of invoices) {
      const summary = calculateInvoicePaymentSummary(invoice, invoice.paymentAllocations, invoice.historicalRefundAllocations);
      if (summary.outstandingBalance !== invoice.grossTotalAmount - summary.refundCreditAmount) throw new ConsolidatedOperationError("元請求書の未収額が変更されました。");
      if (summary.outstandingBalance === 0) continue;
      receivedAmount += summary.outstandingBalance;
      payments.push(await tx.payment.create({ data: { customerId: invoice.customerId, kind: "INVOICE",
        purpose, amount: summary.outstandingBalance, currency: "JPY", provider: "MANUAL", method: "BANK_TRANSFER",
        status: "SUCCEEDED", paidAt,
        allocations: { create: { invoiceId: invoice.id, allocatedAmount: summary.outstandingBalance } },
      }, select: { id: true } }));
    }
    if (!payments.length) throw new ConsolidatedOperationError("振込額が0円の集約請求は入金確認できません。相殺のみで精算されています。");
    return { paymentIds: payments.map(row => row.id), paidAt, amount: receivedAmount };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
