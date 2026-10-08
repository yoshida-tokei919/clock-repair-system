import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentRefund, PaymentRefundError, reconcilePaymentRefund, type RefundGateway } from "./payment-refund";

function fixture(kind: "INVOICE" | "REPAIR_PREPAYMENT" = "INVOICE", provider: "STRIPE" | "MANUAL" = "STRIPE") {
  const rows: any[] = [];
  const payment: any = { id: 1, amount: 10000, kind, provider, method: provider === "STRIPE" ? "CARD" : "BANK_TRANSFER",
    currency: "JPY", status: "SUCCEEDED", allocations: kind === "REPAIR_PREPAYMENT"
      ? [{ allocatedAmount: 3000, releases: [] }] : [{ allocatedAmount: 10000, releases: [] }],
    attempts: provider === "STRIPE" ? [{ paymentIntentId: "pi_1" }] : [], refunds: rows };
  const tx: any = {
    $queryRaw: async () => [{ id: 1 }],
    payment: { findUnique: async ({ select }: any) => select ? payment : payment },
    invoice: { findUnique: async () => ({ status: "issued", paymentAllocations: [{ payment: { status: "SUCCEEDED" } }] }) },
    paymentRefund: {
      create: async ({ data }: any) => { const row = { id: rows.length + 1, createdAt: new Date(), externalRefundId: null,
        providerStatus: null, lastError: null, ...data }; rows.push(row); return row; },
      findUnique: async ({ where, include }: any) => {
        const row = rows.find(row => where.id !== undefined ? row.id === where.id : row.idempotencyKey === where.idempotencyKey);
        return row && include ? { ...row, payment } : row ?? null;
      },
      findUniqueOrThrow: async ({ where }: any) => rows.find(row => row.id === where.id),
      update: async ({ where, data }: any) => Object.assign(rows.find(row => row.id === where.id), data),
    },
  };
  const db: any = { ...tx, $transaction: async (fn: any) => fn(tx) };
  return { db, rows, payment };
}

test("unknown Stripe create retains one PENDING row and reconciles with exactly the same key and params", async () => {
  const { db, rows } = fixture();
  const calls: any[] = [];
  const gateway: RefundGateway = { create: async (params, key) => {
    calls.push({ params, key });
    if (calls.length === 1) throw new Error("transport unknown");
    return { id: "re_1", status: "succeeded", created: 1_760_000_000 };
  }, retrieve: async () => { throw new Error("should not retrieve"); } };
  await assert.rejects(createPaymentRefund(db, gateway, { paymentId: 1, amount: 4000, reason: "return", adminId: 9, mode: "STRIPE" }),
    (error: any) => error.reconciliationNeeded === true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "PENDING");
  const result = await reconcilePaymentRefund(db, gateway, 1);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(rows.length, 1);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0].params, { payment_intent: "pi_1", amount: 4000, metadata: { paymentRefundId: "1" } });
});

test("thrown Stripe rejection keeps the refund PENDING and reserves capacity", async () => {
  const { db, rows } = fixture();
  const rejected: RefundGateway = { create: async () => {
    throw { type: "StripeInvalidRequestError", message: "refund rejected" };
  }, retrieve: async () => { throw new Error("should not retrieve"); } };
  await assert.rejects(createPaymentRefund(db, rejected, { paymentId: 1, amount: 4000, reason: "return", adminId: 9, mode: "STRIPE" }),
    (error: any) => error.reconciliationNeeded === true && error.status === 502);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "PENDING");
  assert.equal(rows[0].externalRefundId, null);
  const key = rows[0].idempotencyKey;

  await assert.rejects(createPaymentRefund(db, rejected, { paymentId: 1, amount: 1000, reason: "later", adminId: 9, mode: "STRIPE" }),
    (error: any) => error.reconciliationNeeded === true && error.status === 409);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].idempotencyKey, key);
});

test("a later Stripe rejection cannot release a reservation after an unknown first result", async () => {
  const { db, rows } = fixture();
  let calls = 0;
  const gateway: RefundGateway = { create: async () => {
    calls += 1;
    if (calls === 1) throw new Error("transport unknown");
    throw { type: "StripeAuthenticationError", message: "credentials changed" };
  }, retrieve: async () => { throw new Error("should not retrieve"); } };

  await assert.rejects(createPaymentRefund(db, gateway, { paymentId: 1, amount: 4000, reason: "return", adminId: 9, mode: "STRIPE" }),
    (error: any) => error.reconciliationNeeded === true);
  assert.equal(rows[0].status, "PENDING");
  await assert.rejects(reconcilePaymentRefund(db, gateway, rows[0].id),
    (error: any) => error.reconciliationNeeded === true && error.status === 502);
  assert.equal(rows[0].status, "PENDING");
});

test("concurrent same-key rejection leaves room for the accepted result to persist", async () => {
  const { db, rows } = fixture();
  let acceptedStarted!: () => void;
  const started = new Promise<void>(resolve => { acceptedStarted = resolve; });
  let releaseAccepted!: () => void;
  const held = new Promise<void>(resolve => { releaseAccepted = resolve; });
  const keys: string[] = [];
  let calls = 0;
  const gateway: RefundGateway = { create: async (_params, key) => {
    keys.push(key);
    calls += 1;
    if (calls === 1) {
      acceptedStarted();
      await held;
      return { id: "re_accepted", status: "succeeded", created: 1_760_000_000 };
    }
    throw { type: "StripeAuthenticationError", message: "credentials changed" };
  }, retrieve: async () => { throw new Error("should not retrieve"); } };

  const accepted = createPaymentRefund(db, gateway, { paymentId: 1, amount: 4000, reason: "return", adminId: 9, mode: "STRIPE" });
  await started;
  await assert.rejects(reconcilePaymentRefund(db, gateway, rows[0].id),
    (error: any) => error.reconciliationNeeded === true && error.status === 502);
  assert.equal(rows[0].status, "PENDING");
  assert.equal(rows[0].externalRefundId, null);
  await assert.rejects(createPaymentRefund(db, gateway, { paymentId: 1, amount: 1000, reason: "later", adminId: 9, mode: "STRIPE" }),
    (error: any) => error.reconciliationNeeded === true && error.status === 409);
  assert.equal(rows.length, 1);
  releaseAccepted();
  const result = await accepted;
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(rows[0].externalRefundId, "re_accepted");
  assert.deepEqual(keys, [rows[0].idempotencyKey, rows[0].idempotencyKey]);
});

test("a late thrown rejection does not overwrite an already persisted accepted result", async () => {
  const { db, rows } = fixture();
  let releaseRejected!: () => void;
  const held = new Promise<void>(resolve => { releaseRejected = resolve; });
  let rejectedStarted!: () => void;
  const started = new Promise<void>(resolve => { rejectedStarted = resolve; });
  let calls = 0;
  const gateway: RefundGateway = { create: async () => {
    calls += 1;
    if (calls === 1) throw new Error("transport unknown");
    if (calls === 2) {
      rejectedStarted();
      await held;
      throw { type: "StripeInvalidRequestError", message: "late rejection" };
    }
    return { id: "re_accepted", status: "succeeded", created: 1_760_000_000 };
  }, retrieve: async () => { throw new Error("should not retrieve"); } };
  await assert.rejects(createPaymentRefund(db, gateway, { paymentId: 1, amount: 4000, reason: "return", adminId: 9, mode: "STRIPE" }),
    (error: any) => error.reconciliationNeeded === true);
  const rejected = reconcilePaymentRefund(db, gateway, rows[0].id);
  await started;
  const accepted = await reconcilePaymentRefund(db, gateway, rows[0].id);
  assert.equal(accepted.status, "SUCCEEDED");
  releaseRejected();
  await assert.rejects(rejected, (error: any) => error.reconciliationNeeded === true);
  assert.equal(rows[0].status, "SUCCEEDED");
  assert.equal(rows[0].externalRefundId, "re_accepted");
});

for (const [providerStatus, expected] of [["pending", "PENDING"], ["requires_action", "PENDING"], ["failed", "FAILED"],
  ["canceled", "CANCELED"], ["succeeded", "SUCCEEDED"]] as const) {
  test(`Stripe ${providerStatus} maps conservatively to ${expected}`, async () => {
    const { db, rows } = fixture();
    let calls = 0;
    const gateway: RefundGateway = { create: async () => ({ id: `re_${++calls}`, status: providerStatus, created: 1_760_000_000 }),
      retrieve: async () => ({ id: "re_1", status: providerStatus, created: 1_760_000_000 }) };
    await createPaymentRefund(db, gateway, { paymentId: 1, amount: 1000, reason: "return", adminId: 9, mode: "STRIPE" });
    assert.equal(rows[0].status, expected);
    assert.equal(rows[0].externalRefundId, "re_1");
    if (providerStatus === "failed" || providerStatus === "canceled") {
      assert.equal(rows[0].lastError, null);
      const later = await createPaymentRefund(db, gateway, { paymentId: 1, amount: 1000, reason: "later", adminId: 9, mode: "STRIPE" });
      assert.equal(later.status, expected);
      assert.equal(rows.length, 2);
    }
  });
}

test("no-ID refund at 23 hours requires manual verification without replay", async () => {
  const { db, rows } = fixture();
  let calls = 0;
  const gateway: RefundGateway = { create: async () => {
    calls += 1;
    throw new Error("transport unknown");
  }, retrieve: async () => { throw new Error("should not retrieve"); } };
  await assert.rejects(createPaymentRefund(db, gateway, { paymentId: 1, amount: 4000, reason: "return", adminId: 9, mode: "STRIPE" }),
    (error: any) => error.reconciliationNeeded === true);
  rows[0].createdAt = new Date(Date.now() - 23 * 60 * 60 * 1000);
  await assert.rejects(reconcilePaymentRefund(db, gateway, rows[0].id),
    (error: any) => error.reconciliationNeeded === true && error.status === 409 && /手動照合/.test(error.message));
  assert.equal(calls, 1);
  assert.equal(rows[0].status, "PENDING");
});

test("reconcile treats even a typed gateway create error as uncertain", async () => {
  const { db, rows } = fixture();
  let calls = 0;
  const gateway: RefundGateway = { create: async () => {
    calls += 1;
    if (calls === 1) throw new Error("transport unknown");
    throw new PaymentRefundError("provider rejected", 409, false);
  }, retrieve: async () => { throw new Error("should not retrieve"); } };
  await assert.rejects(createPaymentRefund(db, gateway, { paymentId: 1, amount: 4000, reason: "return", adminId: 9, mode: "STRIPE" }),
    (error: any) => error.reconciliationNeeded === true);
  await assert.rejects(reconcilePaymentRefund(db, gateway, rows[0].id),
    (error: any) => error.reconciliationNeeded === true && error.status === 502);
  assert.equal(rows[0].status, "PENDING");
});

test("manual completed refund reserves no Stripe call and cannot exceed remaining capacity", async () => {
  const { db, rows } = fixture("INVOICE", "MANUAL");
  await createPaymentRefund(db, null, { paymentId: 1, amount: 6000, reason: "bank returned", adminId: 9, mode: "MANUAL",
    manualOperationKey: "00000000-0000-4000-8000-000000000001" });
  assert.equal(rows[0].status, "SUCCEEDED");
  await assert.rejects(createPaymentRefund(db, null, { paymentId: 1, amount: 4001, reason: "more", adminId: 9, mode: "MANUAL", manualOperationKey: "00000000-0000-4000-8000-000000000002" }), /超え/);
  assert.equal(rows.length, 1);
});

test("manual operation replay returns the same refund before checking exhausted capacity", async () => {
  const { db, rows } = fixture("INVOICE", "MANUAL");
  const input = { paymentId: 1, amount: 10000, reason: "bank returned", adminId: 9,
    mode: "MANUAL" as const, manualOperationKey: "00000000-0000-4000-8000-000000000011" };
  const first = await createPaymentRefund(db, null, input);
  const replay = await createPaymentRefund(db, null, input);
  assert.equal(replay.id, first.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].idempotencyKey, `manual-refund:${input.manualOperationKey}`);
});

test("manual operation key rejects conflicting amount or reason", async () => {
  const { db, rows } = fixture("INVOICE", "MANUAL");
  const input = { paymentId: 1, amount: 4000, reason: "first", adminId: 9,
    mode: "MANUAL" as const, manualOperationKey: "00000000-0000-4000-8000-000000000012" };
  await createPaymentRefund(db, null, input);
  await assert.rejects(createPaymentRefund(db, null, { ...input, amount: 3000 }), /操作キー/);
  await assert.rejects(createPaymentRefund(db, null, { ...input, reason: "other" }), /操作キー/);
  rows[0].paymentId = 2;
  await assert.rejects(createPaymentRefund(db, null, input), /操作キー/);
  rows[0].paymentId = 1;
  rows[0].provider = "STRIPE";
  await assert.rejects(createPaymentRefund(db, null, input), /操作キー/);
  assert.equal(rows.length, 1);
});

test("a different manual operation key records another legitimate partial refund", async () => {
  const { db, rows } = fixture("INVOICE", "MANUAL");
  const input = { paymentId: 1, amount: 4000, reason: "first", adminId: 9,
    mode: "MANUAL" as const, manualOperationKey: "00000000-0000-4000-8000-000000000013" };
  await createPaymentRefund(db, null, input);
  await createPaymentRefund(db, null, { ...input, amount: 3000, reason: "second",
    manualOperationKey: "00000000-0000-4000-8000-000000000014" });
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].idempotencyKey, rows[1].idempotencyKey);
});

test("prepayment refund is capped by active allocations", async () => {
  const { db, rows } = fixture("REPAIR_PREPAYMENT");
  const gateway: RefundGateway = { create: async () => ({ id: "re_1", status: "succeeded", created: 1_760_000_000 }),
    retrieve: async () => ({ id: "re_1", status: "succeeded", created: 1_760_000_000 }) };
  await assert.rejects(createPaymentRefund(db, gateway, { paymentId: 1, amount: 7001, reason: "return", adminId: 9, mode: "STRIPE" }), /超え/);
  assert.equal(rows.length, 0);
});

test("pending Stripe refund blocks any later refund until reconciliation", async () => {
  const { db, rows } = fixture();
  let createCalls = 0;
  const gateway: RefundGateway = { create: async () => {
    createCalls += 1;
    return { id: "re_pending", status: "pending", created: 1_760_000_000 };
  }, retrieve: async () => ({ id: "re_pending", status: "pending", created: 1_760_000_000 }) };
  await createPaymentRefund(db, gateway, { paymentId: 1, amount: 7000, reason: "first", adminId: 9, mode: "STRIPE" });
  await assert.rejects(createPaymentRefund(db, gateway, { paymentId: 1, amount: 1000, reason: "second", adminId: 9, mode: "STRIPE" }), /返金処理中/);
  assert.equal(rows.length, 1);
  assert.equal(createCalls, 1);
});
