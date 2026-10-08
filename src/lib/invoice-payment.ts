import type { PaymentMethod, PaymentProvider, PaymentStatus, Prisma, PrismaClient } from "@prisma/client";
import { effectiveAllocation, refundTotals, type RefundAmount, type AllocationAmount } from "./payment-accounting";

export function assertIntegerYen(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    throw new Error("金額はDBに保存可能な非負の整数円で指定してください");
  }
  return value;
}

export function calculateInvoicePaymentSummary(
  invoice: { grossTotalAmount: number },
  allocations: (AllocationAmount & { payment: { status: PaymentStatus; kind?: string; refunds?: RefundAmount[] } })[],
) {
  const invoiceTotal = assertIntegerYen(invoice.grossTotalAmount);
  let prepaymentAppliedAmount = 0;
  let invoiceRefundedAmount = 0;
  let invoiceRefundPendingAmount = 0;
  const paidAmount = allocations.reduce((sum, allocation) => {
    if (allocation.payment.status !== "SUCCEEDED") return sum;
    const applied = effectiveAllocation(allocation);
    const refunded = allocation.payment.kind === "REPAIR_PREPAYMENT" ? 0 : refundTotals(allocation.payment.refunds ?? []).succeeded;
    if (refunded > assertIntegerYen(allocation.allocatedAmount)) throw new Error("請求入金の返金額が元の充当額を超えています");
    if (allocation.payment.kind === "REPAIR_PREPAYMENT") prepaymentAppliedAmount += applied;
    else {
      invoiceRefundedAmount += refunded;
      invoiceRefundPendingAmount += refundTotals(allocation.payment.refunds ?? []).pending;
    }
    // A void releases a fully refunded invoice allocation. Both history rows
    // describe the same money and must not subtract it twice.
    const contribution = allocation.payment.kind === "REPAIR_PREPAYMENT"
      ? applied : Math.min(applied, allocation.allocatedAmount - refunded);
    const amount = sum + contribution;
    if (!Number.isSafeInteger(amount)) throw new Error("充当額の合計が整数の安全範囲を超えています");
    return amount;
  }, 0);
  // Preserve a negative result so an inconsistent overpayment is not hidden.
  return { invoiceTotal, paidAmount, prepaymentAppliedAmount, invoiceRefundedAmount, invoiceRefundPendingAmount,
    outstandingBalance: invoiceTotal - paidAmount };
}

/** Server-side DB helper. The caller must authorize access to the invoice. */
export async function getInvoiceOutstandingBalance(
  db: Pick<Prisma.TransactionClient, "invoice">,
  invoiceId: number,
) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      grossTotalAmount: true,
      paymentAllocations: {
        where: { payment: { status: "SUCCEEDED" } },
        select: { allocatedAmount: true, releases: { select: { amount: true } },
          payment: { select: { status: true, kind: true, refunds: { select: { amount: true, status: true } } } } },
      },
    },
  });
  if (!invoice) throw new Error("請求書が見つかりません");
  return calculateInvoicePaymentSummary(invoice, invoice.paymentAllocations).outstandingBalance;
}

type CreateInvoicePaymentInput = {
  invoiceId: number;
  customerId: number;
  provider: PaymentProvider;
  method?: PaymentMethod | null;
  status?: "PENDING" | "SUCCEEDED";
  paidAt?: Date | null;
};

/**
 * Internal service, not a Server Action or HTTP endpoint. No client-supplied amount.
 * One atomic nested create creates one Invoice allocation for each Invoice payment.
 * A canceled/failed Payment may be replaced; pending or successful payments block it.
 */
export async function createInvoicePayment(db: PrismaClient, input: CreateInvoicePaymentInput) {
  const status = input.status ?? "PENDING";
  const method = input.method ?? null;
  if (input.provider === "STRIPE") {
    if (status !== "PENDING" || (method !== null && method !== "CARD" && method !== "PAYPAY")) {
      throw new Error("Stripe支払いは未決済として作成してください");
    }
  } else if (input.provider !== "MANUAL" || method !== "BANK_TRANSFER"
    || (status !== "PENDING" && status !== "SUCCEEDED")) {
    throw new Error("支払い方法が不正です");
  }
  if ((status === "SUCCEEDED" && (!input.paidAt || !Number.isFinite(input.paidAt.getTime())))
    || (status !== "SUCCEEDED" && input.paidAt != null)) {
    throw new Error("入金日時と支払い状態が一致しません");
  }
  return db.$transaction(async (tx) => {
    // The void route takes the same lock before checking for an allocation.
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${input.invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      select: { id: true, customerId: true, grossTotalAmount: true, status: true,
        paymentAllocations: { select: { allocatedAmount: true, releases: { select: { amount: true } },
          payment: { select: { status: true, kind: true, refunds: { select: { amount: true, status: true } } } } } } },
    });
    if (!invoice) throw new Error("請求書が見つかりません");
    if (invoice.customerId !== input.customerId) throw new Error("請求書と支払いの顧客が一致しません");
    if (invoice.status !== "issued") throw new Error("この請求書は支払いを作成できません");
    const summary = calculateInvoicePaymentSummary(invoice, invoice.paymentAllocations);
    if (summary.outstandingBalance <= 0) throw new Error("この請求書に未払い残高はありません");
    if (invoice.paymentAllocations.some(allocation => allocation.payment.status === "PENDING")) {
      throw new Error("この請求書には処理中の支払いがあります");
    }
    if (invoice.paymentAllocations.some(allocation => allocation.payment.refunds?.some(refund => refund.status === "PENDING"))) {
      throw new Error("この請求書には処理中の返金があります");
    }
    const amount = assertIntegerYen(summary.outstandingBalance);
    if (amount === 0) throw new Error("支払いには正の請求額が必要です");
    return tx.payment.create({
      data: {
        customerId: invoice.customerId, kind: "INVOICE", amount, currency: "JPY", provider: input.provider,
        method, status, paidAt: input.paidAt ?? null,
        allocations: { create: { invoiceId: invoice.id, allocatedAmount: amount } },
      },
      include: { allocations: true },
    });
  });
}
