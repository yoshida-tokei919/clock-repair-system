import assert from "node:assert/strict";
import test from "node:test";
import { cancelPendingPrepayment, type CancelCheckoutGateway } from "./prepayment-cancel";

function fixture(attempts: any[] = []) {
  const payment: any = { id: 1, kind: "REPAIR_PREPAYMENT", status: "PENDING", provider: "STRIPE", allocations: [], attempts };
  const writes: any[] = [];
  const tx: any = { $queryRaw: async () => [{ id: 1 }], payment: { findUnique: async () => payment,
    update: async ({ data }: any) => { writes.push(data); Object.assign(payment, data); return payment; } },
    paymentAttempt: { update: async ({ where, data }: any) => { writes.push(data); Object.assign(attempts.find(a => a.id === where.id), data); } } };
  return { db: { ...tx, $transaction: async (fn: any) => fn(tx) } as any, payment, writes };
}

const expired: CancelCheckoutGateway = { retrieve: async id => ({ id, status: "expired", payment_status: "unpaid" }),
  expire: async () => { throw new Error("not open"); } };

test("pending prepayment with no Checkout Session can be canceled with audit", async () => {
  const { db, payment } = fixture();
  await cancelPendingPrepayment(db, expired, 1, "request withdrawn", 9);
  assert.equal(payment.status, "CANCELED");
  assert.equal(payment.cancelReason, "request withdrawn");
  assert.equal(payment.canceledBy, 9);
  assert.ok(payment.canceledAt instanceof Date);
});

test("open unpaid Checkout must be expired before cancellation", async () => {
  const { db, payment, writes } = fixture([{ id: 2, status: "PENDING", checkoutSessionId: "cs_1" }]);
  let expiredCalled = false;
  await cancelPendingPrepayment(db, { retrieve: async id => ({ id, status: "open", payment_status: "unpaid" }),
    expire: async id => { expiredCalled = true; return { id, status: "expired", payment_status: "unpaid" }; } }, 1, "withdrawn", 9);
  assert.equal(expiredCalled, true);
  assert.equal(payment.status, "CANCELED");
  assert.equal(writes[0].status, "CANCELED");
});

for (const state of [{ status: "complete", payment_status: "paid" }, { status: "open", payment_status: "paid" }]) {
  test("paid/complete Checkout blocks cancellation", async () => {
    const { db, writes } = fixture([{ id: 2, status: "PENDING", checkoutSessionId: "cs_1" }]);
    await assert.rejects(cancelPendingPrepayment(db, { retrieve: async id => ({ id, ...state }), expire: expired.expire }, 1, "withdrawn", 9));
    assert.equal(writes.length, 0);
  });
}

test("unknown Stripe result and in-flight unknown Session block cancellation", async () => {
  const first = fixture([{ id: 2, status: "PENDING", checkoutSessionId: "cs_1" }]);
  await assert.rejects(cancelPendingPrepayment(first.db, { retrieve: async () => { throw new Error("timeout"); },
    expire: expired.expire }, 1, "withdrawn", 9));
  assert.equal(first.writes.length, 0);
  const second = fixture([{ id: 2, status: "PENDING", checkoutSessionId: null }]);
  await assert.rejects(cancelPendingPrepayment(second.db, expired, 1, "withdrawn", 9));
  assert.equal(second.writes.length, 0);
});

test("concurrent state change after Stripe confirmation blocks cancellation", async () => {
  const { db, payment, writes } = fixture([{ id: 2, status: "PENDING", checkoutSessionId: "cs_1" }]);
  await assert.rejects(cancelPendingPrepayment(db, { retrieve: async id => { payment.status = "SUCCEEDED";
    return { id, status: "expired", payment_status: "unpaid" }; }, expire: expired.expire }, 1, "withdrawn", 9));
  assert.equal(writes.length, 0);
});
