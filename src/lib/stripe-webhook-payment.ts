import type { Prisma, PrismaClient } from "@prisma/client";

type CheckoutSessionForPayment = {
  id: string;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  payment_intent: string | { id: string } | null;
  metadata: Record<string, string> | null;
};

type StripePaymentAttempt = {
  id: number;
  paymentId: number;
  provider: "STRIPE" | "MANUAL";
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  payment: {
    id: number;
    kind: "INVOICE" | "REPAIR_PREPAYMENT";
    customerId: number;
    repairId: number | null;
    purpose: string | null;
    amount: number;
    currency: string;
    provider: "STRIPE" | "MANUAL";
    method: "CARD" | "PAYPAY" | "BANK_TRANSFER" | null;
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED";
    repair: { id: number; customerId: number } | null;
    allocations: Array<{
      allocatedAmount: number;
      invoice: { id: number; invoiceNumber: string; customerId: number; grossTotalAmount: number };
    }>;
  };
};

type WebhookDb = Pick<PrismaClient, "$transaction">;

function paymentIntentId(value: CheckoutSessionForPayment["payment_intent"]) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function parseMetadataId(metadata: Record<string, string> | null, key: string) {
  const value = metadata?.[key];
  if (!value || !/^\d+$/.test(value)) throw new Error(`Stripe metadata ${key} is invalid`);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Stripe metadata ${key} is invalid`);
  return id;
}

function assertSameCurrency(left: string, right: string | null) {
  if (!right || left.toUpperCase() !== right.toUpperCase()) throw new Error("Stripe payment currency does not match");
}

function assertPaymentState(attempt: StripePaymentAttempt, session: CheckoutSessionForPayment) {
  const { payment } = attempt;
  const intentId = paymentIntentId(session.payment_intent);

  if (attempt.provider !== "STRIPE" || payment.provider !== "STRIPE") throw new Error("Payment provider does not match Stripe");
  if (attempt.checkoutSessionId !== session.id) throw new Error("Stripe Checkout Session does not match");
  if (attempt.status !== "PENDING" && attempt.status !== "SUCCEEDED") throw new Error("PaymentAttempt is not pending");
  if (payment.status !== "PENDING" && payment.status !== "SUCCEEDED") throw new Error("Payment is not pending");
  if (!Number.isSafeInteger(session.amount_total) || session.amount_total !== payment.amount) throw new Error("Stripe payment amount does not match");
  assertSameCurrency(payment.currency, session.currency);
  if (attempt.paymentId !== payment.id) throw new Error("PaymentAttempt payment does not match");
  if (payment.kind === "REPAIR_PREPAYMENT") {
    if (payment.method !== "CARD" || payment.currency !== "JPY" || payment.amount <= 0
      || !payment.purpose?.trim() || !payment.repairId || !payment.repair
      || payment.repair.id !== payment.repairId || payment.repair.customerId !== payment.customerId
      || payment.allocations.length !== 0) {
      throw new Error("Repair prepayment record is inconsistent");
    }
    if (!intentId || (attempt.paymentIntentId && attempt.paymentIntentId !== intentId)) {
      throw new Error("Stripe PaymentIntent does not match");
    }
    const metadata = session.metadata;
    if (!metadata || Object.keys(metadata).sort().join(",") !== "customerId,paymentAttemptId,paymentId,paymentKind,repairId"
      || metadata.paymentKind !== "REPAIR_PREPAYMENT"
      || parseMetadataId(metadata, "repairId") !== payment.repairId
      || parseMetadataId(metadata, "customerId") !== payment.customerId
      || parseMetadataId(metadata, "paymentId") !== payment.id
      || parseMetadataId(metadata, "paymentAttemptId") !== attempt.id) {
      throw new Error("Stripe prepayment metadata does not match");
    }
    return intentId;
  }
  if (payment.kind !== "INVOICE") throw new Error("Unsupported Payment kind");
  const [allocation] = payment.allocations;
  if (payment.allocations.length !== 1 || !allocation) throw new Error("Payment must have exactly one allocation");
  if (allocation.allocatedAmount !== payment.amount || payment.amount <= 0 || payment.currency !== "JPY") {
    throw new Error("Payment allocation amount does not match");
  }
  if (payment.customerId !== allocation.invoice.customerId) throw new Error("Payment customer does not match invoice customer");

  const metadata = session.metadata;
  if (parseMetadataId(metadata, "invoiceId") !== allocation.invoice.id
    || metadata?.invoiceNumber !== allocation.invoice.invoiceNumber
    || parseMetadataId(metadata, "paymentId") !== payment.id
    || parseMetadataId(metadata, "paymentAttemptId") !== attempt.id) {
    throw new Error("Stripe metadata does not match payment records");
  }
  if (attempt.paymentIntentId && attempt.paymentIntentId !== intentId) throw new Error("Stripe PaymentIntent does not match");

  return intentId;
}

const paymentAttemptInclude = {
  payment: {
    select: {
      id: true, kind: true, customerId: true, repairId: true, purpose: true, amount: true, currency: true,
      provider: true, method: true, status: true,
      repair: { select: { id: true, customerId: true } },
      allocations: {
        select: {
          allocatedAmount: true,
          invoice: { select: { id: true, invoiceNumber: true, customerId: true, grossTotalAmount: true } },
        },
      },
    },
  },
} satisfies Prisma.PaymentAttemptInclude;

/** Verifies a paid Checkout session, then settles its payment atomically. */
export async function settleStripeCheckoutPayment(
  db: WebhookDb,
  session: CheckoutSessionForPayment,
  paidAt: Date,
) {
  if (session.payment_status !== "paid") return { outcome: "ignored" as const };

  return db.$transaction(async (tx) => {
    const initial = await tx.paymentAttempt.findUnique({
      where: { checkoutSessionId: session.id },
      select: { paymentId: true },
    });
    if (!initial) throw new Error("Stripe Checkout Session is not registered");

    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${initial.paymentId} FOR UPDATE`;
    const attempt = await tx.paymentAttempt.findUnique({
      where: { checkoutSessionId: session.id }, include: paymentAttemptInclude,
    }) as StripePaymentAttempt | null;
    if (!attempt) throw new Error("Stripe Checkout Session is not registered");
    const intentId = assertPaymentState(attempt, session);

    if (attempt.status === "SUCCEEDED" && attempt.payment.status === "SUCCEEDED") {
      return { outcome: "idempotent" as const, paymentId: attempt.payment.id, paymentAttemptId: attempt.id };
    }
    if (attempt.status !== "PENDING" || attempt.payment.status !== "PENDING") {
      throw new Error("Payment and PaymentAttempt statuses do not match");
    }

    if (attempt.payment.kind === "INVOICE") {
      const allocation = attempt.payment.allocations[0];
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${allocation.invoice.id} FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({ where: { id: allocation.invoice.id },
        select: { status: true, customerId: true, grossTotalAmount: true,
          paymentAllocations: { select: { paymentId: true, allocatedAmount: true,
            payment: { select: { status: true } } } } } });
      if (!invoice || invoice.status !== "issued" || invoice.customerId !== attempt.payment.customerId
        || invoice.grossTotalAmount !== allocation.invoice.grossTotalAmount) {
        throw new Error("Invoice changed before Stripe settlement");
      }
      const otherSucceeded = invoice.paymentAllocations.reduce((sum, row) =>
        sum + (row.paymentId !== attempt.payment.id && row.payment.status === "SUCCEEDED" ? row.allocatedAmount : 0), 0);
      if (invoice.grossTotalAmount - otherSucceeded !== attempt.payment.amount) {
        throw new Error("Invoice outstanding balance does not match Stripe payment");
      }
    }

    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "SUCCEEDED", ...(intentId ? { paymentIntentId: intentId } : {}) },
    });
    await tx.payment.update({ where: { id: attempt.payment.id }, data: { status: "SUCCEEDED", paidAt } });
    return { outcome: "settled" as const, paymentId: attempt.payment.id, paymentAttemptId: attempt.id };
  });
}
