import assert from "node:assert/strict";
import test from "node:test";
import { applyPrepaymentAllocations, availablePrepayment, suggestPrepaymentAllocations } from "./prepayment-allocation";

const base = { id: 1, customerId: 7, repairId: 5, kind: "REPAIR_PREPAYMENT", status: "SUCCEEDED",
  currency: "JPY", amount: 50000, paidAt: new Date("2026-01-01"), purpose: "deposit", allocations: [] };

test("suggestion caps at invoice gross and preserves unused prepayment", () => {
  const suggested = suggestPrepaymentAllocations([{ ...base, amount: 44000 }], 30000);
  assert.deepEqual(suggested, [{ paymentId: 1, allocatedAmount: 30000 }]);
  assert.equal(availablePrepayment({ ...base, amount: 44000, allocations: [{ allocatedAmount: 30000 }] }), 14000);
});

test("FIFO suggestion combines two prepayments", () => {
  assert.deepEqual(suggestPrepaymentAllocations([
    { ...base, id: 2, amount: 12000, paidAt: new Date("2026-02-01") },
    { ...base, id: 1, amount: 44000 },
  ], 72600), [{ paymentId: 1, allocatedAmount: 44000 }, { paymentId: 2, allocatedAmount: 12000 }]);
});

function mock(payments: any[], invoice = { customerId: 7, status: "issued", grossTotalAmount: 50000, repairs: [{ id: 5 }] }) {
  const writes: any[] = [];
  let locked = false;
  const tx = {
    $queryRaw: async () => { locked = true; return payments.map(payment => ({ id: payment.id })); },
    invoice: { findUnique: async () => invoice },
    payment: { findMany: async () => { assert.equal(locked, true); return payments; } },
    paymentAllocation: { create: async ({ data }: any) => { writes.push(data); } },
  };
  return { tx: tx as any, writes };
}

test("partial allocation leaves 30000 available in the Payment balance", async () => {
  const first = mock([base]);
  await applyPrepaymentAllocations(first.tx, { invoiceId: 3, customerId: 7, repairIds: [5], gross: 50000,
    requested: [{ paymentId: 1, allocatedAmount: 20000 }] });
  assert.deepEqual(first.writes, [{ paymentId: 1, invoiceId: 3, allocatedAmount: 20000 }]);
  assert.equal(availablePrepayment({ ...base, allocations: [{ allocatedAmount: 20000 }] }), 30000);
});

for (const [name, payment] of [
  ["wrong customer", { ...base, customerId: 8 }],
  ["wrong repair", { ...base, repairId: 6 }],
  ["prior allocation on another repair", { ...base, repairId: 6, allocations: [{ allocatedAmount: 20000, invoiceId: 2 }] }],
  ["pending", { ...base, status: "PENDING" }],
  ["over allocated", { ...base, allocations: [{ allocatedAmount: 40000 }] }],
] as const) {
  test(`${name} rejects without an allocation`, async () => {
    const { tx, writes } = mock([payment]);
    await assert.rejects(applyPrepaymentAllocations(tx, { invoiceId: 3, customerId: 7, repairIds: [5], gross: 50000,
      requested: [{ paymentId: 1, allocatedAmount: 20000 }] }));
    assert.equal(writes.length, 0);
  });
}

test("duplicate payment IDs and total over invoice gross reject", async () => {
  const { tx, writes } = mock([base]);
  await assert.rejects(applyPrepaymentAllocations(tx, { invoiceId: 3, customerId: 7, repairIds: [5], gross: 50000,
    requested: [{ paymentId: 1, allocatedAmount: 10000 }, { paymentId: 1, allocatedAmount: 10000 }] }));
  await assert.rejects(applyPrepaymentAllocations(tx, { invoiceId: 3, customerId: 7, repairIds: [5], gross: 10000,
    requested: [{ paymentId: 1, allocatedAmount: 20000 }] }));
  assert.equal(writes.length, 0);
});
