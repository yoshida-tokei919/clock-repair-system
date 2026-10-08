import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { isValidPrepaymentAmount } from "./repair-prepayment";

export class PrepaymentCheckoutError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type CheckoutSession = {
  id: string;
  status: string | null;
  payment_status: string;
  url: string | null;
  payment_intent: string | { id: string } | null;
};

export type PrepaymentStripeGateway = {
  retrieve(sessionId: string): Promise<CheckoutSession>;
  create(params: {
    mode: "payment";
    currency: "jpy";
    payment_method_types: ["card"];
    line_items: Array<{
      price_data: {
        currency: "jpy";
        unit_amount: number;
        product_data: { name: string; description: string };
      };
      quantity: 1;
    }>;
    metadata: Record<string, string>;
    success_url: string;
    cancel_url: string;
  }, idempotencyKey: string): Promise<CheckoutSession>;
};

const paymentInclude = {
  allocations: { select: { id: true } },
  repair: {
    select: {
      id: true,
      customerId: true,
      publicToken: true,
      estimateDocument: { select: { publicToken: true } },
      customer: { select: { type: true } },
    },
  },
} satisfies Prisma.PaymentInclude;

type CheckoutPayment = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

function validatePayment(payment: CheckoutPayment | null, token: string) {
  if (!payment || !payment.repair || !token
    || (payment.repair.publicToken !== token && payment.repair.estimateDocument?.publicToken !== token)) {
    throw new PrepaymentCheckoutError("Prepayment not found", 404);
  }
  if (payment.repair.id !== payment.repairId || payment.repair.customerId !== payment.customerId
    || payment.repair.customer.type !== "individual") {
    throw new PrepaymentCheckoutError("Prepayment customer does not match", 403);
  }
  if (payment.kind !== "REPAIR_PREPAYMENT" || payment.status !== "PENDING"
    || payment.provider !== "STRIPE" || payment.method !== "CARD" || payment.currency !== "JPY"
    || !isValidPrepaymentAmount(payment.amount)
    || !payment.purpose?.trim() || payment.allocations.length !== 0) {
    throw new PrepaymentCheckoutError("Prepayment is not available for Checkout", 409);
  }
  return payment;
}

type Reserved = {
  payment: CheckoutPayment;
  attempt: {
    id: number;
    idempotencyKey: string;
    checkoutSessionId: string | null;
    createdAt: Date;
  };
};

async function reserveAttempt(
  db: PrismaClient,
  paymentId: number,
  token: string,
  expiredAttemptId?: number,
): Promise<Reserved> {
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
      if (rows.length !== 1) throw new PrepaymentCheckoutError("Prepayment not found", 404);
      const payment = validatePayment(await tx.payment.findUnique({ where: { id: paymentId }, include: paymentInclude }), token);
      const pending = await tx.paymentAttempt.findMany({
        where: { paymentId, status: "PENDING" },
        select: { id: true, provider: true, idempotencyKey: true, checkoutSessionId: true, createdAt: true },
        orderBy: { id: "desc" },
      });
      if (pending.length > 1 || pending.some(attempt => attempt.provider !== "STRIPE")) {
        throw new PrepaymentCheckoutError("Payment attempts are inconsistent", 409);
      }
      if (expiredAttemptId !== undefined) {
        if (pending[0]?.id !== expiredAttemptId || !pending[0].checkoutSessionId) {
          throw new PrepaymentCheckoutError("Checkout state changed; please retry", 409);
        }
        await tx.paymentAttempt.update({ where: { id: expiredAttemptId }, data: { status: "CANCELED" } });
      } else if (pending[0]) {
        return { payment, attempt: pending[0] };
      }
      const attempt = await tx.paymentAttempt.create({
        data: { paymentId, provider: "STRIPE", status: "PENDING", idempotencyKey: randomUUID() },
        select: { id: true, idempotencyKey: true, checkoutSessionId: true, createdAt: true },
      });
      return { payment, attempt };
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
      throw new PrepaymentCheckoutError("Checkout state changed; please retry", 409);
    }
    throw error;
  }
}

function intentId(value: CheckoutSession["payment_intent"]) {
  return typeof value === "string" ? value : value?.id ?? null;
}

/** Customer token and all charge data are revalidated under a Payment row lock. */
export async function startRepairPrepaymentCheckout(
  db: PrismaClient,
  stripe: PrepaymentStripeGateway,
  paymentId: number,
  token: string,
  origin: string,
) {
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0 || !token) {
    throw new PrepaymentCheckoutError("Prepayment not found", 404);
  }
  // Read the token first; do not reserve an attempt for a caller without access.
  validatePayment(await db.payment.findUnique({ where: { id: paymentId }, include: paymentInclude }), token);
  let reserved = await reserveAttempt(db, paymentId, token);
  if (reserved.attempt.checkoutSessionId) {
    let existing: CheckoutSession;
    try {
      existing = await stripe.retrieve(reserved.attempt.checkoutSessionId);
    } catch {
      throw new PrepaymentCheckoutError("Checkout state could not be confirmed; please retry", 502);
    }
    if (existing.id !== reserved.attempt.checkoutSessionId) {
      throw new PrepaymentCheckoutError("Checkout Session mismatch", 409);
    }
    if (existing.payment_status === "paid" || existing.status === "complete") {
      throw new PrepaymentCheckoutError("Payment result is being processed", 409);
    }
    if (existing.status === "open" && existing.url) return { url: existing.url, reused: true };
    if (existing.status !== "expired") {
      throw new PrepaymentCheckoutError("Checkout state could not be confirmed", 409);
    }
    reserved = await reserveAttempt(db, paymentId, token, reserved.attempt.id);
  }

  const { payment, attempt } = reserved;
  // Stripe may prune a key after 24 hours. An unknown older result needs reconciliation,
  // because repeating the POST could create a second Session.
  if (!Number.isFinite(attempt.createdAt.getTime()) || Date.now() - attempt.createdAt.getTime() >= 23 * 60 * 60 * 1000) {
    throw new PrepaymentCheckoutError("Checkout result needs manual reconciliation", 409);
  }
  const returnToken = payment.repair!.estimateDocument?.publicToken?.trim()
    || payment.repair!.publicToken!.trim();
  const base = origin.replace(/\/+$/, "");
  const returnPath = `/customer/repairs/${encodeURIComponent(returnToken)}`;
  const params = {
    mode: "payment" as const,
    currency: "jpy" as const,
    payment_method_types: ["card"] as ["card"],
    line_items: [{
      price_data: {
        currency: "jpy" as const,
        unit_amount: payment.amount,
        product_data: { name: "時計修理 前受金", description: payment.purpose!.trim() },
      },
      quantity: 1 as const,
    }],
    metadata: {
      paymentKind: "REPAIR_PREPAYMENT",
      repairId: String(payment.repairId),
      customerId: String(payment.customerId),
      paymentId: String(payment.id),
      paymentAttemptId: String(attempt.id),
    },
    success_url: `${base}${returnPath}?prepayment=success`,
    cancel_url: `${base}${returnPath}?prepayment=cancel`,
  };
  let session: CheckoutSession;
  try {
    session = await stripe.create(params, attempt.idempotencyKey);
  } catch {
    throw new PrepaymentCheckoutError("Checkout could not be created; please retry", 502);
  }
  if (!session.id) {
    throw new PrepaymentCheckoutError("Checkout result could not be confirmed; please retry", 502);
  }
  // A persistence failure leaves the same pending attempt and idempotency key for recovery.
  try {
    await db.paymentAttempt.update({
      where: { id: attempt.id },
      data: { checkoutSessionId: session.id, paymentIntentId: intentId(session.payment_intent) },
    });
  } catch {
    throw new PrepaymentCheckoutError("Checkout result could not be saved; please retry", 502);
  }
  if (session.payment_status === "paid" || session.status === "complete") {
    throw new PrepaymentCheckoutError("Payment result is being processed", 409);
  }
  if (session.status !== "open" || !session.url) throw new PrepaymentCheckoutError("Checkout state could not be confirmed", 409);
  return { url: session.url, reused: false };
}
