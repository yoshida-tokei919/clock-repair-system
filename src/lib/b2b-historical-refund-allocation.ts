import type { Prisma } from "@prisma/client";

export const historicalRefundAllocationSelect = {
  amount: true, status: true,
  refund: { select: { originalSaleReference: true, customerId: true } },
} as const;

export type HistoricalRefundCredit = {
  amount: number; status: string;
  refund: { originalSaleReference: string; customerId: number };
};

export function activeHistoricalRefundCredit(rows: readonly { amount: number; status: string }[]) {
  return rows.reduce((sum, row) => {
    if (row.status !== "ACTIVE") return sum;
    if (!Number.isSafeInteger(row.amount) || row.amount <= 0 || !Number.isSafeInteger(sum + row.amount)) {
      throw new Error("履歴返金の相殺額を確認できません");
    }
    return sum + row.amount;
  }, 0);
}

export function historicalCreditSnapshot(customerId: number, rows: readonly HistoricalRefundCredit[]) {
  const active = rows.filter(row => row.status === "ACTIVE");
  if (active.some(row => row.refund.customerId !== customerId)) throw new Error("相殺元の顧客が請求元と一致しません");
  return { offsetCreditAmount: activeHistoricalRefundCredit(active),
    offsetCreditReference: active.length ? active.map(row => row.refund.originalSaleReference).join(" / ") : null };
}

export async function allocateHistoricalRefunds(tx: Prisma.TransactionClient, invoice: {
  id: number; customerId: number; grossTotalAmount: number;
}) {
  if (!Number.isSafeInteger(invoice.grossTotalAmount) || invoice.grossTotalAmount < 0) throw new Error("請求額を確認できません");
  if (invoice.grossTotalAmount === 0) return 0;
  const customer = await tx.customer.findUnique({ where: { id: invoice.customerId }, select: { type: true } });
  if (customer?.type !== "business") throw new Error("法人請求書のみ相殺できます");
  const refunds = await tx.b2BHistoricalRefund.findMany({ where: {
    customerId: invoice.customerId, method: "OFFSET", originalSaleSource: "LEGACY", status: "AWAITING_OFFSET",
  }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  let remaining = invoice.grossTotalAmount;
  for (const { id } of refunds) {
    if (remaining === 0) break;
    // Every issuer locks refund rows in the same order. The balance is read only after the lock.
    const locked = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "B2BHistoricalRefund" WHERE "id" = ${id} FOR UPDATE`;
    if (locked.length !== 1) continue;
    const refund = await tx.b2BHistoricalRefund.findUnique({ where: { id }, select: {
      amount: true, customerId: true, method: true, originalSaleSource: true, status: true,
      allocations: { select: { amount: true, status: true } },
    } });
    if (!refund || refund.customerId !== invoice.customerId || refund.method !== "OFFSET" ||
        refund.originalSaleSource !== "LEGACY" || refund.status !== "AWAITING_OFFSET") continue;
    const available = refund.amount - activeHistoricalRefundCredit(refund.allocations);
    if (available < 0) throw new Error("履歴返金の相殺額が登録額を超えています");
    const amount = Math.min(available, remaining);
    if (!amount) continue;
    await tx.b2BHistoricalRefundAllocation.create({ data: { refundId: id, invoiceId: invoice.id, amount } });
    remaining -= amount;
  }
  return invoice.grossTotalAmount - remaining;
}
