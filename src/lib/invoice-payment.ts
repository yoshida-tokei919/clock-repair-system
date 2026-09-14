import type { PaymentMethod, PaymentProvider, PaymentStatus, Prisma, PrismaClient } from "@prisma/client";

export function assertIntegerYen(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    throw new Error("金額はDBに保存可能な非負の整数円で指定してください");
  }
  return value;
}

export function calculateInvoicePaymentSummary(
  invoice: { grossTotalAmount: number },
  allocations: { allocatedAmount: number; payment: { status: PaymentStatus } }[],
) {
  const invoiceTotal = assertIntegerYen(invoice.grossTotalAmount);
  const paidAmount = allocations.reduce((sum, allocation) => {
    if (allocation.payment.status !== "SUCCEEDED") return sum;
    const amount = sum + assertIntegerYen(allocation.allocatedAmount);
    if (!Number.isSafeInteger(amount)) throw new Error("充当額の合計が整数の安全範囲を超えています");
    return amount;
  }, 0);
  // Preserve a negative result so an inconsistent overpayment is not hidden.
  return { invoiceTotal, paidAmount, outstandingBalance: invoiceTotal - paidAmount };
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
        select: { allocatedAmount: true, payment: { select: { status: true } } },
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
 * One atomic nested create plus unique paymentId enforces one Invoice per Payment.
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
        paymentAllocations: { select: { allocatedAmount: true, payment: { select: { status: true } } } } },
    });
    if (!invoice) throw new Error("請求書が見つかりません");
    if (invoice.customerId !== input.customerId) throw new Error("請求書と支払いの顧客が一致しません");
    if (invoice.status !== "issued") throw new Error("この請求書は支払いを作成できません");
    const summary = calculateInvoicePaymentSummary(invoice, invoice.paymentAllocations);
    if (summary.outstandingBalance <= 0) throw new Error("この請求書に未払い残高はありません");
    if (invoice.paymentAllocations.some(allocation => allocation.payment.status === "PENDING")) {
      throw new Error("この請求書には処理中の支払いがあります");
    }
    if (summary.paidAmount > 0) throw new Error("部分入金済みの請求書は今回の支払い対象外です");
    const amount = assertIntegerYen(invoice.grossTotalAmount);
    if (amount === 0) throw new Error("支払いには正の請求額が必要です");
    return tx.payment.create({
      data: {
        customerId: invoice.customerId, amount, currency: "JPY", provider: input.provider,
        method, status, paidAt: input.paidAt ?? null,
        allocations: { create: { invoiceId: invoice.id, allocatedAmount: amount } },
      },
      include: { allocations: true },
    });
  });
}
