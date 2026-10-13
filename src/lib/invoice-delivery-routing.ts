import { randomBytes } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { buildCustomerShareUrl } from "./customer-share-url";
import { createApprovedLineManagerSendOutbox } from "./line-manager-send-outbox";

export const invoiceDeliveryKey = (invoiceId: number) => `b2b-invoice-line:${invoiceId}`;

export async function hasUnresolvedInvoiceLineOutbox(tx: Prisma.TransactionClient, invoiceId: number) {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT "status" FROM "LineManagerSendOutbox"
    WHERE "idempotencyKey" = ${invoiceDeliveryKey(invoiceId)} FOR UPDATE`;
  // Unknown statuses also block mutation until their delivery outcome is understood.
  return rows.length > 1 || (rows.length === 1 && !["CONFIRMED", "CANCELLED"].includes(rows[0].status));
}

export class InvoiceDeliveryUnavailableError extends Error {
  constructor(message: string, readonly status = 409, readonly postal = false) { super(message); }
}

type RoutingDb = Pick<Prisma.TransactionClient, "lineUser" | "inquiry">;

export async function resolveInvoiceLineDestination(db: RoutingDb, customerId: number) {
  const users = await db.lineUser.findMany({
    where: { linkedCustomerId: customerId },
    select: { id: true, linkedCustomerId: true, lineManagerChat: { select: { id: true, lineUserId: true, verifiedAt: true } } },
  });
  // Invoice delivery has no recipient picker. More than one linked user is ambiguous.
  if (users.length !== 1) return null;
  const user = users[0];
  const chat = user.lineManagerChat;
  if (user.linkedCustomerId !== customerId || !chat?.verifiedAt || chat.lineUserId !== user.id) return null;
  const orderBy = [{ lastReceivedAt: "desc" as const }, { id: "desc" as const }];
  const inquiry = await db.inquiry.findFirst({ where: { lineUserId: user.id, status: "OPEN" }, orderBy, select: { id: true, lineUserId: true } })
    ?? await db.inquiry.findFirst({ where: { lineUserId: user.id }, orderBy, select: { id: true, lineUserId: true } });
  if (!inquiry || inquiry.lineUserId !== user.id) return null;
  return { lineUserId: user.id, inquiryId: inquiry.id, lineManagerChatId: chat.id };
}

function formatBillingMonth(billingMonth: string | null, dates: { issuedDate: Date | null }[]) {
  const match = billingMonth?.match(/^(\d{4})-(\d{1,2})$/);
  if (match) return `${match[1]}年${Number(match[2])}月分`;
  if (billingMonth) return billingMonth;
  const first = dates.map(row => row.issuedDate).filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime())[0];
  if (!first) return "請求書";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric" }).formatToParts(first);
  return `${parts.find(part => part.type === "year")?.value}年${parts.find(part => part.type === "month")?.value}月分`;
}

export function buildInvoiceLineMessage(label: string, sharedUrl: string) {
  return `いつもお世話になり有難うございます。\n${label}の請求書を発行いたしました。\n\n下記URLより請求書PDFをご確認ください。\n${sharedUrl}\n\nよろしくお願いいたします。`;
}

export async function getInvoiceDeliveryState(db: PrismaClient, invoiceId: number) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: {
    customerId: true, status: true, customer: { select: { type: true } }, sentAt: true, lineSendRetryKey: true, lineSendStartedAt: true,
  } });
  if (!invoice || invoice.customer.type !== "business" || !["issued", "paid"].includes(invoice.status)) return null;
  const outbox = await db.lineManagerSendOutbox.findUnique({ where: { idempotencyKey: invoiceDeliveryKey(invoiceId) }, select: { status: true } });
  if (outbox) return { method: "LINE" as const, status: outbox.status };
  if (invoice.sentAt) return { method: "LINE" as const, status: "LEGACY_SENT" as const };
  if (invoice.lineSendRetryKey || invoice.lineSendStartedAt) return { method: "LINE" as const, status: "LEGACY_UNRESOLVED" as const };
  const destination = await resolveInvoiceLineDestination(db, invoice.customerId);
  return destination ? { method: "LINE" as const, status: "READY" as const } : { method: "POSTAL" as const, status: "PRINT_PENDING" as const };
}

export async function queueInvoiceLineDelivery(
  db: PrismaClient, invoiceId: number, requestUrl: string,
  createApproved = createApprovedLineManagerSendOutbox,
) {
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) throw new InvoiceDeliveryUnavailableError("請求書IDが不正です。", 400);
  const initial = await db.invoice.findUnique({ where: { id: invoiceId }, select: { customerId: true } });
  if (!initial) throw new InvoiceDeliveryUnavailableError("請求書が見つかりません。", 404);
  return db.$transaction(async tx => {
    const customers = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Customer" WHERE "id" = ${initial.customerId} FOR UPDATE`;
    const invoices = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} AND "customerId" = ${initial.customerId} FOR UPDATE`;
    if (customers.length !== 1 || invoices.length !== 1) throw new InvoiceDeliveryUnavailableError("請求書の顧客が変更されました。");
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: {
      id: true, customerId: true, status: true, billingMonth: true, publicToken: true, sentAt: true, lineSendRetryKey: true, lineSendStartedAt: true,
      customer: { select: { type: true } }, currentPdfFile: { select: { status: true, storageKey: true } },
    } });
    if (!invoice || invoice.customer.type !== "business" || !["issued", "paid"].includes(invoice.status)) {
      throw new InvoiceDeliveryUnavailableError("法人の発行済み請求書のみ送信待ちにできます。");
    }
    if (invoice.sentAt) throw new InvoiceDeliveryUnavailableError("旧LINE送信記録があるため再送信を止めました。履歴を確認してください。");
    if (invoice.lineSendRetryKey || invoice.lineSendStartedAt) throw new InvoiceDeliveryUnavailableError("旧LINE送信状態が未確定です。履歴を確認してください。");
    if (!invoice.currentPdfFile || invoice.currentPdfFile.status !== "current" || !invoice.currentPdfFile.storageKey) {
      throw new InvoiceDeliveryUnavailableError("先に請求書PDFを生成してください。", 400);
    }
    const key = invoiceDeliveryKey(invoiceId);
    const existing = await tx.lineManagerSendOutbox.findUnique({ where: { idempotencyKey: key }, select: { status: true } });
    if (existing?.status === "CANCELLED") throw new InvoiceDeliveryUnavailableError("この請求書のLINE送信待ちは取り消されています。");
    if (existing) return { method: "LINE" as const, outboxStatus: existing.status };
    const destination = await resolveInvoiceLineDestination(tx, invoice.customerId);
    if (!destination) throw new InvoiceDeliveryUnavailableError("確認済みのLINE送信先がないため郵送対象です。", 409, true);
    const users = await tx.$queryRaw<{ linkedCustomerId: number | null }[]>`
      SELECT "linkedCustomerId" FROM "LineUser" WHERE "id" = ${destination.lineUserId} FOR UPDATE`;
    if (users.length !== 1 || users[0].linkedCustomerId !== invoice.customerId) {
      throw new InvoiceDeliveryUnavailableError("LINE送信先の紐付けが変更されたため郵送対象です。", 409, true);
    }
    const token = invoice.publicToken ?? randomBytes(24).toString("base64url");
    if (!invoice.publicToken) await tx.invoice.update({ where: { id: invoiceId }, data: { publicToken: token, publicTokenCreatedAt: new Date() } });
    const dates = await tx.repair.findMany({ where: { invoiceId }, select: { deliveryNote: { select: { issuedDate: true } } } });
    const label = formatBillingMonth(invoice.billingMonth, dates.map(row => ({ issuedDate: row.deliveryNote?.issuedDate ?? null })));
    const text = buildInvoiceLineMessage(label, buildCustomerShareUrl(`/customer/invoices/${token}`, requestUrl));
    const outbox = await createApproved(tx, { inquiryId: destination.inquiryId, lineManagerChatId: destination.lineManagerChatId, text, idempotencyKey: key });
    if (outbox.status === "CANCELLED") throw new InvoiceDeliveryUnavailableError("この請求書のLINE送信待ちは取り消されています。");
    return { method: "LINE" as const, outboxStatus: outbox.status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
