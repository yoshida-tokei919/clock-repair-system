import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { createRepairPrepayment, parsePrepaymentInput } from "./repair-prepayment";

function mockDb(options: { type?: string; token?: string | null; documentToken?: string | null; pending?: any; customerId?: number } = {}) {
  const writes: any[] = [];
  const repair = { id: 5, customerId: options.customerId ?? 7, publicToken: options.token === undefined ? "repair-token" : options.token,
    estimateDocument: { publicToken: options.documentToken ?? null }, customer: { type: options.type ?? "individual" } };
  const tx = {
    $queryRaw: async () => [{ id: 5 }],
    repair: { findUnique: async () => repair },
    payment: {
      findFirst: async () => options.pending ?? null,
      create: async (query: any) => { writes.push(query); return { id: 10, ...query.data, allocations: [] }; },
    },
  };
  return { db: { $transaction: async (fn: any) => fn(tx) } as PrismaClient, writes };
}

test("creates pending card prepayment with server-derived customer and no allocation", async () => {
  const { db, writes } = mockDb({ customerId: 19 });
  const result = await createRepairPrepayment(db, 5, { amount: 12000, purpose: "  部品前受金  " });
  assert.equal(result.reused, false);
  assert.deepEqual(writes[0].data, { kind: "REPAIR_PREPAYMENT", repairId: 5, customerId: 19,
    purpose: "部品前受金", amount: 12000, currency: "JPY", provider: "STRIPE", method: "CARD", status: "PENDING" });
});

test("same pending request is reused and conflicting pending request is rejected", async () => {
  const pending = { id: 10, customerId: 7, amount: 12000, purpose: "部品前受金", currency: "JPY", provider: "STRIPE", method: "CARD", allocations: [] };
  const { db, writes } = mockDb({ pending });
  assert.equal((await createRepairPrepayment(db, 5, { amount: 12000, purpose: " 部品前受金 " })).reused, true);
  await assert.rejects(createRepairPrepayment(db, 5, { amount: 12001, purpose: "部品前受金" }), { status: 409 });
  assert.equal(writes.length, 0);
});

test("invalid amount, blank purpose, and extra fields are rejected", async () => {
  for (const value of [{ amount: 0, purpose: "a" }, { amount: 1.5, purpose: "a" },
    { amount: 50, purpose: "   " }, { amount: 50, purpose: "a", customerId: 9 }]) {
    assert.throws(() => parsePrepaymentInput(value), { status: 400 });
  }
});

test("admin creation accepts only the Stripe-valid JPY card amount boundaries", async () => {
  for (const amount of [49, 100_000_000]) {
    const { db, writes } = mockDb();
    await assert.rejects(createRepairPrepayment(db, 5, { amount, purpose: "前受金" }), { status: 400 });
    assert.equal(writes.length, 0);
  }
  for (const amount of [50, 99_999_999]) {
    const { db, writes } = mockDb();
    const result = await createRepairPrepayment(db, 5, { amount, purpose: "前受金" });
    assert.equal(result.payment.amount, amount);
    assert.equal(writes.length, 1);
  }
});

test("business customer and missing customer token are rejected without writes", async () => {
  for (const options of [{ type: "business" }, { token: null }]) {
    const { db, writes } = mockDb(options);
    await assert.rejects(createRepairPrepayment(db, 5, { amount: 1000, purpose: "前受金" }));
    assert.equal(writes.length, 0);
  }
  const { db } = mockDb({ token: null, documentToken: "document-token" });
  assert.equal((await createRepairPrepayment(db, 5, { amount: 1000, purpose: "前受金" })).reused, false);
});
