import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient, PaymentStatus } from "@prisma/client";
import { calculateInvoicePaymentSummary, createInvoicePayment, getInvoiceOutstandingBalance } from "./invoice-payment";

const issued = { id: 1, customerId: 7, totalAmount: 30000, taxAmount: 3000, grossTotalAmount: 33000, status: "issued", paymentAllocations: [] as { allocatedAmount: number; payment: { status: PaymentStatus } }[] };
function mockDb(invoice: typeof issued | null = { ...issued }) {
  const writes: any[] = [];
  const queries: any[] = [];
  let locked = false;
  const tx = {
    $queryRaw: async () => { locked = true; return [{ id: 1 }]; },
    invoice: { findUnique: async (query: unknown) => { queries.push(query); return invoice; } },
    payment: { create: async (query: any) => { assert.equal(locked, true); writes.push(query); return query.data; } },
  };
  const db = { ...tx, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;
  return { db, writes, queries };
}

test("33000 yen remains due until payment succeeds; tax is not added again", () => {
  assert.equal(calculateInvoicePaymentSummary({ grossTotalAmount: 33000 }, []).outstandingBalance, 33000);
  assert.equal(calculateInvoicePaymentSummary({ grossTotalAmount: 33000 }, [
    { allocatedAmount: 33000, payment: { status: "SUCCEEDED" } },
    { allocatedAmount: 33000, payment: { status: "PENDING" } },
    { allocatedAmount: 33000, payment: { status: "FAILED" } },
    { allocatedAmount: 33000, payment: { status: "CANCELED" } },
  ]).outstandingBalance, 0);
});

test("only successful allocations are summed; overpayment is visible", () => {
  assert.deepEqual(calculateInvoicePaymentSummary({ grossTotalAmount: 1000 }, [
    { allocatedAmount: 500, payment: { status: "SUCCEEDED" } },
    { allocatedAmount: 600, payment: { status: "SUCCEEDED" } },
  ]), { invoiceTotal: 1000, paidAmount: 1100, outstandingBalance: -100 });
});

for (const amount of [-1, 0.5, NaN, Infinity, 2147483648]) test("reject invalid yen " + amount, () => {
  assert.throws(() => calculateInvoicePaymentSummary({ grossTotalAmount: amount }, []));
  assert.throws(() => calculateInvoicePaymentSummary({ grossTotalAmount: 33000 }, [
    { allocatedAmount: amount, payment: { status: "SUCCEEDED" } },
  ]));
});

test("server helper reads only successful allocations for the requested invoice", async () => {
  const { db, queries } = mockDb();
  assert.equal(await getInvoiceOutstandingBalance(db, 1), 33000);
  assert.deepEqual(queries[0].where, { id: 1 });
  assert.deepEqual(queries[0].select.paymentAllocations.where, { payment: { status: "SUCCEEDED" } });
  await assert.rejects(getInvoiceOutstandingBalance(mockDb(null).db, 1), /見つかりません/);
});

test("creates exactly one full allocation from DB total, ignoring supplied amount", async () => {
  const { db, writes } = mockDb();
  const input = { invoiceId: 1, customerId: 7, provider: "STRIPE" as const, amount: 1 };
  await createInvoicePayment(db, input);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].data, {
    customerId: 7, amount: 33000, currency: "JPY", provider: "STRIPE", method: null,
    status: "PENDING", paidAt: null,
    allocations: { create: { invoiceId: 1, allocatedAmount: 33000 } },
  });
});

test("customer mismatch writes nothing", async () => {
  const { db, writes } = mockDb();
  await assert.rejects(createInvoicePayment(db, { invoiceId: 1, customerId: 8, provider: "STRIPE" }), /顧客/);
  assert.equal(writes.length, 0);
});

for (const status of ["CANCELED", "FAILED"] as const) {
  test("a " + status + " Stripe payment can be replaced with bank transfer", async () => {
    const { db, writes } = mockDb({ ...issued,
      paymentAllocations: [{ allocatedAmount: 33000, payment: { status } }],
    });
    await createInvoicePayment(db, { invoiceId: 1, customerId: 7, provider: "MANUAL",
      method: "BANK_TRANSFER", status: "SUCCEEDED", paidAt: new Date() });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data.amount, 33000);
    assert.equal(writes[0].data.allocations.create.allocatedAmount, 33000);
  });
}

for (const amount of [1000, 33000, 34000]) {
  test("successful allocation " + amount + " prevents a duplicate full payment", async () => {
    const { db, writes } = mockDb({ ...issued,
      paymentAllocations: [{ allocatedAmount: amount, payment: { status: "SUCCEEDED" } }],
    });
    await assert.rejects(createInvoicePayment(db, { invoiceId: 1, customerId: 7, provider: "STRIPE" }));
    assert.equal(writes.length, 0);
  });
}

for (const status of ["paid", "void", "canceled"]) test("reject invoice status " + status, async () => {
  const { db, writes } = mockDb({ ...issued, status });
  await assert.rejects(createInvoicePayment(db, { invoiceId: 1, customerId: 7, provider: "STRIPE" }));
  assert.equal(writes.length, 0);
});

test("missing, zero, fractional and already allocated invoices cannot create payments", async () => {
  for (const invoice of [null, { ...issued, grossTotalAmount: 0 }, { ...issued, grossTotalAmount: 1.5 },
    { ...issued, paymentAllocations: [{ allocatedAmount: 33000, payment: { status: "PENDING" as const } }] }]) {
    const { db, writes } = mockDb(invoice);
    await assert.rejects(createInvoicePayment(db, { invoiceId: 1, customerId: 7, provider: "STRIPE" }));
    assert.equal(writes.length, 0);
  }
});

test("future manual bank transfer can record success with paidAt", async () => {
  const { db, writes } = mockDb();
  const paidAt = new Date("2026-09-15T00:00:00Z");
  await createInvoicePayment(db, { invoiceId: 1, customerId: 7, provider: "MANUAL",
    method: "BANK_TRANSFER", status: "SUCCEEDED", paidAt });
  assert.equal(writes[0].data.status, "SUCCEEDED");
  assert.equal(writes[0].data.paidAt, paidAt);
});

test("reject fake Stripe success and inconsistent provider/date combinations", async () => {
  const { db, writes } = mockDb();
  const base = { invoiceId: 1, customerId: 7 };
  await assert.rejects(createInvoicePayment(db, { ...base, provider: "STRIPE", status: "SUCCEEDED", paidAt: new Date() }));
  await assert.rejects(createInvoicePayment(db, { ...base, provider: "STRIPE", method: "BANK_TRANSFER" }));
  await assert.rejects(createInvoicePayment(db, { ...base, provider: "STRIPE", paidAt: new Date() }));
  await assert.rejects(createInvoicePayment(db, { ...base, provider: "MANUAL", method: "BANK_TRANSFER", status: "SUCCEEDED" }));
  assert.equal(writes.length, 0);
});
