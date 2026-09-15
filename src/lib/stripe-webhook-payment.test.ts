import assert from "node:assert/strict";
import test from "node:test";

import { settleStripeCheckoutPayment } from "./stripe-webhook-payment";

function paymentAttempt(overrides: Record<string, unknown> = {}) {
  const attempt = {
    id: 12, paymentId: 10, provider: "STRIPE", status: "PENDING", checkoutSessionId: "cs_test_123", paymentIntentId: null,
    payment: {
      id: 10, customerId: 7, amount: 33000, currency: "JPY", provider: "STRIPE", status: "PENDING",
      allocations: [{ allocatedAmount: 33000, invoice: { id: 3, invoiceNumber: "TI-003", customerId: 7, grossTotalAmount: 33000 } }],
    },
  };
  return { ...attempt, ...overrides } as any;
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_123", payment_status: "paid", amount_total: 33000, currency: "jpy", payment_intent: "pi_123",
    metadata: { invoiceId: "3", invoiceNumber: "TI-003", paymentId: "10", paymentAttemptId: "12" },
    ...overrides,
  } as any;
}

function mockDb(attempt = paymentAttempt()) {
  const writes: any[] = [];
  const tx = {
    $queryRaw: async () => [{ id: attempt.paymentId }],
    paymentAttempt: {
      findUnique: async (query: any) => query.select ? { paymentId: attempt.paymentId } : attempt,
      update: async (query: any) => { writes.push({ kind: "attempt", ...query }); },
    },
    payment: { update: async (query: any) => { writes.push({ kind: "payment", ...query }); } },
  };
  return { db: { $transaction: async (fn: any) => fn(tx) } as any, writes };
}

test("paid Checkout settles Payment and PaymentAttempt and records PaymentIntent", async () => {
  const { db, writes } = mockDb();
  const paidAt = new Date("2026-09-16T00:00:00Z");
  assert.deepEqual(await settleStripeCheckoutPayment(db, session(), paidAt), {
    outcome: "settled", paymentId: 10, paymentAttemptId: 12,
  });
  assert.deepEqual(writes, [
    { kind: "attempt", where: { id: 12 }, data: { status: "SUCCEEDED", paymentIntentId: "pi_123" } },
    { kind: "payment", where: { id: 10 }, data: { status: "SUCCEEDED", paidAt } },
  ]);
});

test("replayed paid Checkout is idempotent", async () => {
  const attempt = paymentAttempt({ status: "SUCCEEDED", paymentIntentId: "pi_123", payment: { ...paymentAttempt().payment, status: "SUCCEEDED" } });
  const { db, writes } = mockDb(attempt);
  assert.equal((await settleStripeCheckoutPayment(db, session(), new Date())).outcome, "idempotent");
  assert.equal(writes.length, 0);
});

for (const [name, changed] of [
  ["amount mismatch", { amount_total: 33001 }],
  ["currency mismatch", { currency: "usd" }],
  ["metadata mismatch", { metadata: { invoiceId: "4", invoiceNumber: "TI-003", paymentId: "10", paymentAttemptId: "12" } }],
] as const) {
  test(name + " does not settle", async () => {
    const { db, writes } = mockDb();
    await assert.rejects(settleStripeCheckoutPayment(db, session(changed), new Date()));
    assert.equal(writes.length, 0);
  });
}

test("unknown Checkout Session does not settle any payment", async () => {
  const { db, writes } = mockDb();
  await assert.rejects(settleStripeCheckoutPayment(db, session({ id: "cs_test_unknown" }), new Date()));
  assert.equal(writes.length, 0);
});

test("a non-paid Checkout remains pending", async () => {
  const { db, writes } = mockDb();
  assert.deepEqual(await settleStripeCheckoutPayment(db, session({ payment_status: "unpaid" }), new Date()), { outcome: "ignored" });
  assert.equal(writes.length, 0);
});

test("a succeeded payment with a different PaymentIntent is rejected", async () => {
  const attempt = paymentAttempt({ status: "SUCCEEDED", paymentIntentId: "pi_original", payment: { ...paymentAttempt().payment, status: "SUCCEEDED" } });
  const { db, writes } = mockDb(attempt);
  await assert.rejects(settleStripeCheckoutPayment(db, session(), new Date()));
  assert.equal(writes.length, 0);
});
