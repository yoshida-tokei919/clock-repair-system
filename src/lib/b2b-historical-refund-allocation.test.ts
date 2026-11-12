import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { activeHistoricalRefundCredit, allocateHistoricalRefunds, historicalCreditSnapshot } from "./b2b-historical-refund-allocation";
import { calculateInvoicePaymentSummary } from "./invoice-payment";

function fixture() {
  const refunds = [
    { id: 1, customerId: 10, amount: 14014, method: "OFFSET", originalSaleSource: "LEGACY", status: "AWAITING_OFFSET", allocations: [] as { amount: number; status: string }[] },
    { id: 2, customerId: 10, amount: 1000, method: "OFFSET", originalSaleSource: "LEGACY", status: "AWAITING_OFFSET", allocations: [] as { amount: number; status: string }[] },
    { id: 3, customerId: 11, amount: 5000, method: "OFFSET", originalSaleSource: "LEGACY", status: "AWAITING_OFFSET", allocations: [] as { amount: number; status: string }[] },
  ];
  const writes: { refundId: number; invoiceId: number; amount: number }[] = [];
  const tx = {
    customer: { findUnique: async ({ where }: { where: { id: number } }) => ({ type: where.id === 10 ? "business" : "individual" }) },
    b2BHistoricalRefund: {
      findMany: async ({ where }: { where: { customerId: number } }) => refunds.filter(row => row.customerId === where.customerId).map(row => ({ id: row.id })),
      findUnique: async ({ where }: { where: { id: number } }) => refunds.find(row => row.id === where.id),
    },
    $queryRaw: async () => [{ id: 1 }],
    b2BHistoricalRefundAllocation: { create: async ({ data }: { data: { refundId: number; invoiceId: number; amount: number } }) => {
      writes.push(data);
      refunds.find(row => row.id === data.refundId)!.allocations.push({ amount: data.amount, status: "ACTIVE" });
    } },
  } as unknown as Prisma.TransactionClient;
  return { tx, refunds, writes };
}

test("zero gross consumes no credit; partial credit carries to a second invoice", async () => {
  const f = fixture();
  assert.equal(await allocateHistoricalRefunds(f.tx, { id: 1, customerId: 10, grossTotalAmount: 0 }), 0);
  assert.equal(f.writes.length, 0);
  assert.equal(await allocateHistoricalRefunds(f.tx, { id: 2, customerId: 10, grossTotalAmount: 10000 }), 10000);
  assert.equal(await allocateHistoricalRefunds(f.tx, { id: 3, customerId: 10, grossTotalAmount: 6000 }), 5014);
  assert.deepEqual(f.writes, [
    { refundId: 1, invoiceId: 2, amount: 10000 },
    { refundId: 1, invoiceId: 3, amount: 4014 },
    { refundId: 2, invoiceId: 3, amount: 1000 },
  ]);
  assert.equal(activeHistoricalRefundCredit(f.refunds[0].allocations), 14014);
  assert.equal(calculateInvoicePaymentSummary({ grossTotalAmount: 6000 }, [], [{ amount: 5014, status: "ACTIVE" }]).outstandingBalance, 986);
  assert.equal(calculateInvoicePaymentSummary({ grossTotalAmount: 6000 }, [], [{ amount: 5014, status: "VOID" }]).outstandingBalance, 6000);
});

test("credit rejects another source customer and over-gross totals", async () => {
  const f = fixture();
  await assert.rejects(allocateHistoricalRefunds(f.tx, { id: 4, customerId: 11, grossTotalAmount: 1000 }), /法人/);
  assert.deepEqual(f.writes, []);
  assert.throws(() => historicalCreditSnapshot(10, [{ amount: 10, status: "ACTIVE", refund: { customerId: 11, originalSaleReference: "OLD" } }]), /顧客/);
  assert.throws(() => calculateInvoicePaymentSummary({ grossTotalAmount: 100 }, [], [{ amount: 101, status: "ACTIVE" }]), /超え/);
});
