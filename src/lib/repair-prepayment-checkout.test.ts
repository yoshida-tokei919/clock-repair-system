import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { startRepairPrepaymentCheckout } from "./repair-prepayment-checkout";

function mockSetup(options: {
  sessionId?: string | null;
  sessionStatus?: string;
  retrievePaymentStatus?: string;
  retrieveError?: boolean;
  createError?: boolean;
  payment?: Record<string, unknown>;
  persistError?: boolean;
  attemptCreatedAt?: Date;
  createStatus?: string;
  createPaymentStatus?: string;
} = {}) {
  const payment: any = { id: 10, kind: "REPAIR_PREPAYMENT", repairId: 5, customerId: 7, amount: 12000,
    purpose: "部品前受金", currency: "JPY", provider: "STRIPE", method: "CARD", status: "PENDING", allocations: [],
    repair: { id: 5, customerId: 7, publicToken: "repair-token", estimateDocument: { publicToken: "doc-token" }, customer: { type: "individual" } },
    ...options.payment };
  const attempts: any[] = [{ id: 12, provider: "STRIPE", status: "PENDING", idempotencyKey: "stable-key",
    checkoutSessionId: options.sessionId ?? null, createdAt: options.attemptCreatedAt ?? new Date() }];
  const creates: any[] = [];
  const retrieves: string[] = [];
  const updates: any[] = [];
  const stripe = {
    retrieve: async (id: string) => {
      retrieves.push(id);
      if (options.retrieveError) throw new Error("Stripe transport error");
      return { id, status: options.sessionStatus ?? "open", payment_status: options.retrievePaymentStatus ?? "unpaid",
        url: "https://checkout.stripe.test/old", payment_intent: null };
    },
    create: async (params: any, key: string) => {
      creates.push({ params, key });
      if (options.createError) throw new Error("Stripe transport error");
      return { id: "cs_new", status: options.createStatus ?? "open", payment_status: options.createPaymentStatus ?? "unpaid",
        url: "https://checkout.stripe.test/new", payment_intent: null };
    },
  };
  const tx = {
    $queryRaw: async () => [{ id: 10 }],
    payment: { findUnique: async () => payment },
    paymentAttempt: {
      findMany: async () => attempts.filter(a => a.status === "PENDING"),
      create: async (query: any) => { const attempt = { id: 13, checkoutSessionId: null, createdAt: new Date(), ...query.data }; attempts.push(attempt); return attempt; },
      update: async (query: any) => {
        if (options.persistError && query.data.checkoutSessionId) throw new Error("DB error");
        updates.push(query);
        Object.assign(attempts.find(a => a.id === query.where.id), query.data);
      },
    },
  };
  const db = { payment: tx.payment, paymentAttempt: tx.paymentAttempt, $transaction: async (fn: any) => fn(tx) } as unknown as PrismaClient;
  return { db, stripe, payment, attempts, creates, retrieves, updates };
}

test("Checkout uses only DB payment amount and exact metadata", async () => {
  const { db, stripe, creates } = mockSetup();
  await startRepairPrepaymentCheckout(db, stripe, 10, "doc-token", "https://example.test");
  assert.equal(creates[0].params.line_items[0].price_data.unit_amount, 12000);
  assert.equal(creates[0].params.line_items[0].price_data.product_data.description, "部品前受金");
  assert.deepEqual(creates[0].params.metadata, { paymentKind: "REPAIR_PREPAYMENT", repairId: "5", customerId: "7", paymentId: "10", paymentAttemptId: "12" });
  assert.match(creates[0].params.success_url, /\/customer\/repairs\/doc-token\?prepayment=success$/);
});

test("document and repair token callers use identical document-token return URLs", async () => {
  const documentCaller = mockSetup();
  const repairCaller = mockSetup();
  await startRepairPrepaymentCheckout(documentCaller.db, documentCaller.stripe, 10, "doc-token", "https://example.test");
  await startRepairPrepaymentCheckout(repairCaller.db, repairCaller.stripe, 10, "repair-token", "https://example.test");
  const documentParams = documentCaller.creates[0].params;
  const repairParams = repairCaller.creates[0].params;
  assert.equal(documentParams.success_url, "https://example.test/customer/repairs/doc-token?prepayment=success");
  assert.equal(documentParams.cancel_url, "https://example.test/customer/repairs/doc-token?prepayment=cancel");
  assert.equal(repairParams.success_url, documentParams.success_url);
  assert.equal(repairParams.cancel_url, documentParams.cancel_url);
  assert.deepEqual(repairParams, documentParams);
  assert.equal(repairCaller.creates[0].key, documentCaller.creates[0].key);
});

test("repair token is the return URL fallback when the document has no token", async () => {
  const setup = mockSetup({ payment: { repair: { id: 5, customerId: 7, publicToken: "repair-token",
    estimateDocument: { publicToken: null }, customer: { type: "individual" } } } });
  await startRepairPrepaymentCheckout(setup.db, setup.stripe, 10, "repair-token", "https://example.test");
  assert.equal(setup.creates[0].params.success_url, "https://example.test/customer/repairs/repair-token?prepayment=success");
  assert.equal(setup.creates[0].params.cancel_url, "https://example.test/customer/repairs/repair-token?prepayment=cancel");
});

test("uncertain no-session state reuses the same attempt and idempotency key", async () => {
  const { db, stripe, creates, attempts } = mockSetup({ createError: true });
  await assert.rejects(startRepairPrepaymentCheckout(db, stripe, 10, "repair-token", "https://example.test"), { status: 502 });
  await assert.rejects(startRepairPrepaymentCheckout(db, stripe, 10, "repair-token", "https://example.test"), { status: 502 });
  assert.deepEqual(creates.map(c => c.key), ["stable-key", "stable-key"]);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, "PENDING");
});

test("open session is reused; complete session blocks another creation", async () => {
  const open = mockSetup({ sessionId: "cs_old" });
  assert.equal((await startRepairPrepaymentCheckout(open.db, open.stripe, 10, "repair-token", "https://example.test")).reused, true);
  assert.equal(open.creates.length, 0);
  const complete = mockSetup({ sessionId: "cs_old", sessionStatus: "complete" });
  await assert.rejects(startRepairPrepaymentCheckout(complete.db, complete.stripe, 10, "repair-token", "https://example.test"), { status: 409 });
  assert.equal(complete.creates.length, 0);
});

test("retrieved open paid Session is never returned or replaced", async () => {
  const setup = mockSetup({ sessionId: "cs_old", sessionStatus: "open", retrievePaymentStatus: "paid" });
  await assert.rejects(startRepairPrepaymentCheckout(setup.db, setup.stripe, 10, "repair-token", "https://example.test"), { status: 409 });
  assert.equal(setup.creates.length, 0);
  assert.equal(setup.updates.length, 0);
  assert.equal(setup.attempts[0].status, "PENDING");
});

test("retrieved expired paid Session is never canceled or replaced", async () => {
  const setup = mockSetup({ sessionId: "cs_old", sessionStatus: "expired", retrievePaymentStatus: "paid" });
  await assert.rejects(startRepairPrepaymentCheckout(setup.db, setup.stripe, 10, "repair-token", "https://example.test"), { status: 409 });
  assert.equal(setup.creates.length, 0);
  assert.equal(setup.updates.length, 0);
  assert.equal(setup.attempts.length, 1);
  assert.equal(setup.attempts[0].status, "PENDING");
});

test("expired attempt is canceled and replaced while Payment stays pending", async () => {
  const setup = mockSetup({ sessionId: "cs_old", sessionStatus: "expired" });
  await startRepairPrepaymentCheckout(setup.db, setup.stripe, 10, "repair-token", "https://example.test");
  assert.equal(setup.attempts[0].status, "CANCELED");
  assert.equal(setup.attempts[1].status, "PENDING");
  assert.equal(setup.payment.status, "PENDING");
  assert.equal(setup.creates[0].key, setup.attempts[1].idempotencyKey);
});

test("Stripe or persistence errors retain the pending attempt and never mark paid", async () => {
  for (const options of [{ retrieveError: true, sessionId: "cs_old" }, { createError: true }, { persistError: true }]) {
    const setup = mockSetup(options);
    await assert.rejects(startRepairPrepaymentCheckout(setup.db, setup.stripe, 10, "repair-token", "https://example.test"), { status: 502 });
    assert.equal(setup.payment.status, "PENDING");
    assert.equal(setup.attempts.length, 1);
    assert.equal(setup.attempts[0].status, "PENDING");
  }
});

test("a completed Session returned during recovery is saved for webhook settlement", async () => {
  const setup = mockSetup({ createStatus: "complete" });
  await assert.rejects(startRepairPrepaymentCheckout(setup.db, setup.stripe, 10, "repair-token", "https://example.test"), { status: 409 });
  assert.equal(setup.attempts[0].checkoutSessionId, "cs_new");
  assert.equal(setup.payment.status, "PENDING");
});

test("new open paid Session ID is persisted for webhook but URL is withheld", async () => {
  const setup = mockSetup({ createStatus: "open", createPaymentStatus: "paid" });
  await assert.rejects(startRepairPrepaymentCheckout(setup.db, setup.stripe, 10, "repair-token", "https://example.test"), { status: 409 });
  assert.equal(setup.attempts[0].checkoutSessionId, "cs_new");
  assert.equal(setup.updates.length, 1);
  assert.equal(setup.payment.status, "PENDING");
});

test("unknown old attempt cannot reuse a potentially pruned Stripe idempotency key", async () => {
  const setup = mockSetup({ attemptCreatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });
  await assert.rejects(startRepairPrepaymentCheckout(setup.db, setup.stripe, 10, "repair-token", "https://example.test"), { status: 409 });
  assert.equal(setup.creates.length, 0);
});

test("token, repair, customer, and payment mismatches are rejected before Stripe", async () => {
  for (const [token, changes] of [["wrong", {}], ["repair-token", { repairId: 6 }],
    ["repair-token", { customerId: 8 }], ["repair-token", { kind: "INVOICE" }],
    ["repair-token", { allocations: [{ id: 1 }] }]] as const) {
    const setup = mockSetup({ payment: changes });
    await assert.rejects(startRepairPrepaymentCheckout(setup.db, setup.stripe, 10, token, "https://example.test"));
    assert.equal(setup.creates.length, 0);
  }
});

test("out-of-range DB prepayment amounts are rejected before Stripe create or retrieve", async () => {
  for (const amount of [49, 100_000_000]) {
    for (const sessionId of [undefined, "cs_old"]) {
      const setup = mockSetup({ payment: { amount }, sessionId });
      await assert.rejects(
        startRepairPrepaymentCheckout(setup.db, setup.stripe, 10, "repair-token", "https://example.test"),
        { status: 409 },
      );
      assert.equal(setup.creates.length, 0);
      assert.equal(setup.retrieves.length, 0);
      assert.equal(setup.updates.length, 0);
    }
  }
});
