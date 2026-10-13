import { Prisma, type PrismaClient } from "@prisma/client";
import { resolveEffectiveBillingCustomer } from "./b2b-company";
import { hasConsistentInvoiceSnapshots } from "./invoice-repair-snapshots";

export class ConsolidatedInvoiceError extends Error {}

export function assertSourcesAvailable(sources: readonly { consolidatedSource: { id: number } | null }[]) {
  if (sources.some(source => source.consolidatedSource !== null)) {
    throw new ConsolidatedInvoiceError("選択した請求書は既に集約済みです。");
  }
}

type Snapshot = {
  deliveryNoteId: number | null;
  deliverySlipNumber: string | null;
  deliveryIssuedDate: Date | null;
  subtotalAmount: number;
};

export function deliveryNoteBreakdown(rows: Snapshot[], amountsReliable: boolean) {
  const groups = new Map<string, { deliveryNoteId: number | null; slipNumber: string | null; issuedDate: Date | null; repairCount: number; subtotalAmount: number | null }>();
  for (const row of rows) {
    const key = row.deliveryNoteId !== null ? `id:${row.deliveryNoteId}` : row.deliverySlipNumber ? `slip:${row.deliverySlipNumber}` : "unlinked";
    const previous = groups.get(key);
    if (previous) {
      previous.repairCount++;
      if (amountsReliable) previous.subtotalAmount = (previous.subtotalAmount ?? 0) + row.subtotalAmount;
    } else {
      groups.set(key, { deliveryNoteId: row.deliveryNoteId, slipNumber: row.deliverySlipNumber,
        issuedDate: row.deliveryIssuedDate, repairCount: 1, subtotalAmount: amountsReliable ? row.subtotalAmount : null });
    }
  }
  return [...groups.values()];
}

export function assertConsolidationSelection(
  invoices: readonly { id: number; status: string; customerId: number; grossTotalAmount: number }[],
  invoiceIds: readonly number[],
  resolutions: readonly { companyId: number | null; billingCustomerId: number }[],
  expectedCompanyId: number,
  expectedBillingCustomerId: number,
) {
  if (invoices.length !== invoiceIds.length || resolutions.length !== invoiceIds.length
    || invoices.some(invoice => !["issued", "paid"].includes(invoice.status))) {
    throw new ConsolidatedInvoiceError("請求書の状態が変更されました。再読み込みしてください。");
  }
  if (resolutions.some(row => row.companyId === null || row.companyId !== expectedCompanyId
    || row.billingCustomerId !== expectedBillingCustomerId)) {
    throw new ConsolidatedInvoiceError("会社または請求先が変更されました。再読み込みしてください。");
  }
  const total = invoices.reduce((sum, row) => sum + BigInt(row.grossTotalAmount), BigInt(0));
  if (total < BigInt(0) || total > BigInt(2147483647)) throw new ConsolidatedInvoiceError("請求総額が保存可能な範囲を超えます。");
  return Number(total);
}

export async function createConsolidatedInvoice(
  db: PrismaClient,
  input: { invoiceIds: number[]; companyId: number; billingCustomerId: number },
) {
  const ids = input.invoiceIds;
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 100 || new Set(ids).size !== ids.length
    || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
    || !Number.isSafeInteger(input.companyId) || input.companyId <= 0
    || !Number.isSafeInteger(input.billingCustomerId) || input.billingCustomerId <= 0) {
    throw new ConsolidatedInvoiceError("会社・請求先と異なる請求書を2件以上選択してください。");
  }
  return db.$transaction(async tx => {
    // A company row lock serializes destination changes with this creation; invoice locks
    // serialize against source void and the unique invoiceId constraint prevents double inclusion.
    const companyRows = await tx.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "B2BCompany" WHERE "id" = ${input.companyId} FOR UPDATE`;
    if (companyRows.length !== 1) throw new ConsolidatedInvoiceError("会社が見つかりません。");
    for (const id of [...ids].sort((a, b) => a - b)) {
      const locked = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Invoice" WHERE "id" = ${id} FOR UPDATE`;
      if (locked.length !== 1) throw new ConsolidatedInvoiceError("請求書が変更されました。再読み込みしてください。");
    }
    const invoices = await tx.invoice.findMany({ where: { id: { in: ids } }, include: {
      customer: { select: { id: true, name: true, companyName: true } },
      repairSnapshots: { orderBy: { id: "asc" } },
      consolidatedSource: { select: { id: true } },
    } });
    const ordered = ids.map(id => invoices.find(invoice => invoice.id === id)).filter((invoice): invoice is typeof invoices[number] => !!invoice);
    const resolutions = await Promise.all(ordered.map(invoice => resolveEffectiveBillingCustomer(tx, invoice.customerId)));
    const grossTotalAmount = assertConsolidationSelection(ordered, ids, resolutions, input.companyId, input.billingCustomerId);
    assertSourcesAvailable(ordered);
    const company = await tx.b2BCompany.findUnique({ where: { id: input.companyId }, select: { name: true } });
    const recipient = await tx.customer.findUnique({ where: { id: input.billingCustomerId }, select: {
      name: true, companyName: true, zipCode: true, prefecture: true, city: true,
      street: true, building: true, address: true, phone: true, email: true,
    } });
    if (!company || !recipient) throw new ConsolidatedInvoiceError("請求先が見つかりません。");
    return tx.consolidatedInvoice.create({ data: {
      companyId: input.companyId, billingCustomerId: input.billingCustomerId,
      companyName: company.name, billingName: recipient.name,
      billingCompanyName: recipient.companyName, billingZipCode: recipient.zipCode,
      billingPrefecture: recipient.prefecture, billingCity: recipient.city,
      billingStreet: recipient.street, billingBuilding: recipient.building,
      billingAddress: recipient.address, billingPhone: recipient.phone, billingEmail: recipient.email,
      grossTotalAmount,
      sources: { create: ordered.map(invoice => ({ invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber, sourceCustomerId: invoice.customerId,
        sourceCustomerName: invoice.customer.name, sourceCompanyName: invoice.customer.companyName,
        totalAmount: invoice.totalAmount, taxAmount: invoice.taxAmount,
        grossTotalAmount: invoice.grossTotalAmount, issuedDate: invoice.issuedDate,
        deliveryNotes: { create: deliveryNoteBreakdown(invoice.repairSnapshots,
          hasConsistentInvoiceSnapshots(invoice)) },
      })) },
    }, include: { sources: { include: { deliveryNotes: true } } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
