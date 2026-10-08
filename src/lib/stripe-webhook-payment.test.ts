import assert from "node:assert/strict";
import test from "node:test";

import { settleStripeCheckoutPayment } from "./stripe-webhook-payment";

function paymentAttempt(overrides: Record<string, unknown> = {}) {
  const attempt = {
    id: 12, paymentId: 10, provider: "STRIPE", status: "PENDING", checkoutSessionId: "cs_test_123", paymentIntentId: null,
    payment: {
      id: 10, kind: "INVOICE", customerId: 7, repairId: null, purpose: null, repair: null,
      amount: 33000, currency: "JPY", provider: "STRIPE", method: "CARD", status: "PENDING",
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

function mockDb(attempt = paymentAttempt(), otherAllocations: any[] = []) {
  const writes: any[] = [];
  const tx = {
    $queryRaw: async () => [{ id: attempt.paymentId }],
    paymentAttempt: {
      findUnique: async (query: any) => query.select ? { paymentId: attempt.paymentId,
        payment: { kind: attempt.payment.kind, allocations: attempt.payment.allocations.map((row: any) => ({ invoiceId: row.invoice.id })) } } : attempt,
      update: async (query: any) => { writes.push({ kind: "attempt", ...query }); },
    },
    payment: { update: async (query: any) => { writes.push({ kind: "payment", ...query }); } },
    invoice: { findUnique: async () => ({ status: "issued", customerId: 7, grossTotalAmount: attempt.payment.allocations[0]?.invoice?.grossTotalAmount,
      paymentAllocations: [...attempt.payment.allocations.map((row: any) => ({ paymentId: attempt.paymentId,
        allocatedAmount: row.allocatedAmount, payment: { status: attempt.payment.status } })), ...otherAllocations] }) },
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

function prepaymentAttempt(paymentOverrides: Record<string, unknown> = {}) {
  return paymentAttempt({ payment: {
    ...paymentAttempt().payment,
    kind: "REPAIR_PREPAYMENT", repairId: 5, purpose: "部品前受金", method: "CARD",
    repair: { id: 5, customerId: 7 }, allocations: [], ...paymentOverrides,
  } });
}

function prepaymentSession(overrides: Record<string, unknown> = {}) {
  return session({ metadata: { paymentKind: "REPAIR_PREPAYMENT", repairId: "5", customerId: "7",
    paymentId: "10", paymentAttemptId: "12" }, ...overrides });
}

test("paid repair prepayment settles without an invoice allocation", async () => {
  const { db, writes } = mockDb(prepaymentAttempt());
  assert.equal((await settleStripeCheckoutPayment(db, prepaymentSession(), new Date())).outcome, "settled");
  assert.equal(writes.length, 2);
});

test("44000 prepayment plus 28600 Stripe residual settles a 72600 invoice", async () => {
  const attempt = paymentAttempt();
  attempt.payment.amount = 28600;
  attempt.payment.allocations[0].allocatedAmount = 28600;
  attempt.payment.allocations[0].invoice.grossTotalAmount = 72600;
  const { db, writes } = mockDb(attempt, [{ paymentId: 9, allocatedAmount: 44000, payment: { status: "SUCCEEDED" } }]);
  assert.equal((await settleStripeCheckoutPayment(db, session({ amount_total: 28600 }), new Date())).outcome, "settled");
  assert.equal(writes.length, 2);
});

test("Stripe residual is rejected when other succeeded allocations change", async () => {
  const attempt = paymentAttempt();
  attempt.payment.amount = 28600;
  attempt.payment.allocations[0].allocatedAmount = 28600;
  attempt.payment.allocations[0].invoice.grossTotalAmount = 72600;
  const { db, writes } = mockDb(attempt, [{ paymentId: 9, allocatedAmount: 45000, payment: { status: "SUCCEEDED" } }]);
  await assert.rejects(settleStripeCheckoutPayment(db, session({ amount_total: 28600 }), new Date()));
  assert.equal(writes.length, 0);
});

test("Stripe residual is rejected after prepayment allocation release", async () => {
  const attempt = paymentAttempt();
  attempt.payment.amount = 28600;
  attempt.payment.allocations[0].allocatedAmount = 28600;
  attempt.payment.allocations[0].invoice.grossTotalAmount = 72600;
  const { db, writes } = mockDb(attempt, [{ paymentId: 9, allocatedAmount: 44000,
    releases: [{ amount: 1000 }], payment: { kind: "REPAIR_PREPAYMENT", status: "SUCCEEDED" } }]);
  await assert.rejects(settleStripeCheckoutPayment(db, session({ amount_total: 28600 }), new Date()), /outstanding/);
  assert.equal(writes.length, 0);
});

test("Stripe residual is rejected after another invoice payment refund", async () => {
  const attempt = paymentAttempt();
  attempt.payment.amount = 28600;
  attempt.payment.allocations[0].allocatedAmount = 28600;
  attempt.payment.allocations[0].invoice.grossTotalAmount = 72600;
  const { db, writes } = mockDb(attempt, [{ paymentId: 9, allocatedAmount: 44000,
    payment: { kind: "INVOICE", status: "SUCCEEDED", refunds: [{ amount: 1000, status: "SUCCEEDED" }] } }]);
  await assert.rejects(settleStripeCheckoutPayment(db, session({ amount_total: 28600 }), new Date()), /outstanding/);
  assert.equal(writes.length, 0);
});

test("replayed paid repair prepayment is idempotent", async () => {
  const attempt = prepaymentAttempt({ status: "SUCCEEDED" });
  attempt.status = "SUCCEEDED";
  attempt.paymentIntentId = "pi_123";
  const { db, writes } = mockDb(attempt);
  assert.equal((await settleStripeCheckoutPayment(db, prepaymentSession(), new Date())).outcome, "idempotent");
  assert.equal(writes.length, 0);
});

test("prepayment PaymentIntent mismatch writes nothing", async () => {
  const attempt = prepaymentAttempt();
  attempt.paymentIntentId = "pi_other";
  const { db, writes } = mockDb(attempt);
  await assert.rejects(settleStripeCheckoutPayment(db, prepaymentSession(), new Date()));
  assert.equal(writes.length, 0);
});

for (const [name, payment, checkout] of [
  ["amount", {}, { amount_total: 33001 }],
  ["currency", {}, { currency: "usd" }],
  ["metadata", {}, { metadata: { paymentKind: "REPAIR_PREPAYMENT", repairId: "6", customerId: "7", paymentId: "10", paymentAttemptId: "12" } }],
  ["repair", { repairId: 6 }, {}],
  ["customer", { customerId: 8 }, {}],
  ["method", { method: "PAYPAY" }, {}],
  ["allocation", { allocations: [{ allocatedAmount: 33000 }] }, {}],
] as const) {
  test(`prepayment ${name} mismatch writes nothing`, async () => {
    const { db, writes } = mockDb(prepaymentAttempt(payment));
    await assert.rejects(settleStripeCheckoutPayment(db, prepaymentSession(checkout), new Date()));
    assert.equal(writes.length, 0);
  });
}
