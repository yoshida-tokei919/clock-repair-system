import { Prisma } from "@prisma/client";
import { assertIntegerYen } from "./invoice-payment";
import { refundableAmount, type RefundAmount, type AllocationAmount } from "./payment-accounting";

export type RequestedAllocation = { paymentId: number; allocatedAmount: number };

type Candidate = {
  id: number; customerId: number; repairId: number | null; kind: string; status: string;
  currency: string; amount: number; paidAt: Date | null; purpose: string | null;
  allocations: (AllocationAmount & { invoiceId?: number })[];
  refunds?: RefundAmount[];
};

export function availablePrepayment(payment: Candidate) {
  if (payment.kind !== "REPAIR_PREPAYMENT" || payment.status !== "SUCCEEDED" || payment.currency !== "JPY") return 0;
  return refundableAmount({ ...payment, refunds: payment.refunds ?? [] });
}

export function suggestPrepaymentAllocations(payments: Candidate[], gross: number): RequestedAllocation[] {
  let remaining = assertIntegerYen(gross);
  return [...payments].sort((a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0) || a.id - b.id)
    .flatMap((payment) => {
      const amount = Math.min(remaining, availablePrepayment(payment));
      remaining -= amount;
      return amount > 0 ? [{ paymentId: payment.id, allocatedAmount: amount }] : [];
    });
}

export async function findEligiblePrepayments(
  db: Pick<Prisma.TransactionClient, "payment">, customerId: number, repairIds: number[],
) {
  return db.payment.findMany({
    where: { customerId, repairId: { in: repairIds }, kind: "REPAIR_PREPAYMENT", status: "SUCCEEDED", currency: "JPY" },
    select: { id: true, customerId: true, repairId: true, kind: true, status: true, currency: true,
      amount: true, paidAt: true, purpose: true,
      allocations: { select: { allocatedAmount: true, invoiceId: true, releases: { select: { amount: true } } } },
      refunds: { select: { amount: true, status: true } } },
    orderBy: [{ paidAt: "asc" }, { id: "asc" }],
  });
}

/** Called inside the invoice creation transaction, after its Repairs have been claimed. */
export async function applyPrepaymentAllocations(
  tx: Prisma.TransactionClient,
  input: { invoiceId: number; customerId: number; repairIds: number[]; gross: number; requested: RequestedAllocation[] },
) {
  const { invoiceId, customerId, repairIds, requested } = input;
  const gross = assertIntegerYen(input.gross);
  if (!Array.isArray(requested)) throw new Error("前受金の配賦指定が必要です");
  const ids = requested.map((row) => row.paymentId);
  if (new Set(ids).size !== ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("前受金IDの重複または不正な指定です");
  }
  const requestedTotal = requested.reduce((sum, row) => sum + assertIntegerYen(row.allocatedAmount), 0);
  if (requested.some((row) => row.allocatedAmount <= 0) || requestedTotal > gross) {
    throw new Error("配賦額が請求総額を超えているか不正です");
  }
  if (!ids.length) return;
  // Lock in stable ID order, then re-read every balance and ownership under the lock.
  await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" IN (${Prisma.join([...ids].sort((a, b) => a - b))}) ORDER BY "id" FOR UPDATE`;
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId },
    select: { customerId: true, status: true, grossTotalAmount: true, repairs: { select: { id: true } } } });
  if (!invoice || invoice.customerId !== customerId || invoice.status !== "issued" || invoice.grossTotalAmount !== gross
    || invoice.repairs.length !== repairIds.length
    || invoice.repairs.some((repair) => !repairIds.includes(repair.id))) {
    throw new Error("請求書と修理案件の紐付けが変更されました");
  }
  const payments = await tx.payment.findMany({
    where: { id: { in: ids } },
    select: { id: true, customerId: true, repairId: true, kind: true, status: true, currency: true,
      amount: true, paidAt: true, purpose: true,
      allocations: { select: { allocatedAmount: true, invoiceId: true, releases: { select: { amount: true } } } },
      refunds: { select: { amount: true, status: true } } },
  });
  if (payments.length !== ids.length) throw new Error("前受金が見つかりません");
  const repairSet = new Set(repairIds);
  for (const row of requested) {
    const payment = payments.find((item) => item.id === row.paymentId)!;
    if (payment.customerId !== customerId || !payment.repairId || !repairSet.has(payment.repairId)
      || payment.kind !== "REPAIR_PREPAYMENT" || payment.status !== "SUCCEEDED" || payment.currency !== "JPY"
      || payment.allocations.some((allocation) => allocation.invoiceId === invoiceId)
      || row.allocatedAmount > availablePrepayment(payment)) {
      throw new Error("前受金の顧客・修理案件・状態・利用可能額が変更されました");
    }
  }
  for (const row of requested) {
    await tx.paymentAllocation.create({ data: { paymentId: row.paymentId, invoiceId, allocatedAmount: row.allocatedAmount } });
  }
}
