import type { Prisma } from "@prisma/client";

type CustomerIdentity = { id: number; type: string };
type LockedCustomer = CustomerIdentity & { prefix: string | null; seqInvoice: number; invoiceRecipientCustomerId: number | null };

export async function lockInvoiceRecipientCustomers(tx: Prisma.TransactionClient, ids: number[]) {
  const rows = new Map<number, LockedCustomer>();
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    const [row] = await tx.$queryRaw<LockedCustomer[]>`
      SELECT "id", "type", "prefix", "seqInvoice", "invoiceRecipientCustomerId"
      FROM "Customer" WHERE "id" = ${id} FOR UPDATE`;
    if (!row) throw new Error("請求書の顧客が変更されました。再読み込みしてください。");
    rows.set(id, row);
  }
  return rows;
}

export function nextB2BSourceInvoiceNumber(source: { prefix: string | null; seqInvoice: number }) {
  const sequence = source.seqInvoice + 1;
  return { sequence, invoiceNumber: `${source.prefix || "C"}I-${String(sequence).padStart(3, "0")}` };
}

export function validateInvoiceRecipientSelection(
  source: CustomerIdentity,
  selectedId: number | null,
  target: CustomerIdentity | null,
): number | null {
  if (selectedId === null || selectedId === source.id) return null;
  if (source.type !== "business") throw new Error("法人の請求元にのみ請求先を設定できます。");
  if (!Number.isSafeInteger(selectedId) || selectedId <= 0 || !target || target.id !== selectedId || target.type !== "business") {
    throw new Error("請求先には既存の法人顧客を指定してください。");
  }
  return selectedId;
}

export function effectiveInvoiceRecipientId(invoice: { customerId: number; billingCustomerId: number | null }) {
  return invoice.billingCustomerId ?? invoice.customerId;
}

type DisplayCustomer = { id: number; name: string; companyName: string | null; address?: string | null; type?: string };

export function invoicePdfParties(invoice: {
  customerId: number; billingCustomerId: number | null;
  customer: DisplayCustomer; billingCustomer: DisplayCustomer | null;
}) {
  const alternate = effectiveInvoiceRecipientId(invoice) !== invoice.customerId;
  if (alternate && (!invoice.billingCustomer || invoice.billingCustomer.id !== invoice.billingCustomerId || invoice.billingCustomer.type !== "business")) {
    throw new Error("請求先の法人顧客を確認できません。");
  }
  const recipient = alternate ? invoice.billingCustomer! : invoice.customer;
  return {
    recipient: { name: alternate ? recipient.companyName || recipient.name : recipient.name,
      address: recipient.address || undefined, type: recipient.type },
    sourceCustomerName: alternate ? invoice.customer.companyName || invoice.customer.name : undefined,
  };
}

// Observe the target first, lock both customers in ID order, then reject a changed setting.
export async function resolveInvoiceRecipientForIssue(tx: Prisma.TransactionClient, sourceId: number) {
  const observed = await tx.customer.findUnique({ where: { id: sourceId }, select: { invoiceRecipientCustomerId: true } });
  if (!observed) throw new Error("請求元の顧客が見つかりません。");
  const locked = await lockInvoiceRecipientCustomers(tx, [sourceId, ...(observed.invoiceRecipientCustomerId === null ? [] : [observed.invoiceRecipientCustomerId])]);
  const source = locked.get(sourceId)!;
  if (source.invoiceRecipientCustomerId !== observed.invoiceRecipientCustomerId) {
    throw new Error("請求元の請求先設定が変更されました。再読み込みしてください。");
  }
  if (source.type !== "business" || source.invoiceRecipientCustomerId === null) {
    return { source, billingCustomerId: source.id };
  }
  const target = locked.get(source.invoiceRecipientCustomerId) ?? null;
  const selectedId = validateInvoiceRecipientSelection(source, source.invoiceRecipientCustomerId, target ?? null);
  return { source, billingCustomerId: selectedId ?? source.id };
}

export async function assertCustomerCanBecomeIndividual(tx: Prisma.TransactionClient, customerId: number) {
  const customer = (await lockInvoiceRecipientCustomers(tx, [customerId])).get(customerId)!;
  if (customer.type !== "business") return;
  const ownContact = await tx.customer.findUnique({ where: { id: customerId }, select: { lineContactCustomerId: true } });
  if (ownContact?.lineContactCustomerId !== null) throw new Error("LINE代理連絡先を解除してから個人顧客へ変更してください。");
  const configured = await tx.customer.count({ where: { id: { not: customerId }, invoiceRecipientCustomerId: customerId } });
  if (configured > 0) throw new Error("他の法人の請求先に設定されているため、個人顧客へ変更できません。");
  const lineContacts = await tx.customer.count({ where: { id: { not: customerId }, lineContactCustomerId: customerId } });
  if (lineContacts > 0) throw new Error("他の法人のLINE連絡先に設定されているため、個人顧客へ変更できません。");
  const issued = await tx.invoice.count({ where: { customerId: { not: customerId }, billingCustomerId: customerId } });
  if (issued > 0) throw new Error("発行済み請求書の請求先であるため、個人顧客へ変更できません。");
}
