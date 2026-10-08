import assert from "node:assert/strict";
import test from "node:test";
import { voidInvoice } from "./invoice-void";
import { releaseAllocation } from "./allocation-release";

function fixture(rows: any[], lineSendStartedAt: Date | null = null, lineSendRetryKey: string | null = null) {
  const releases: any[] = [];
  let status = "issued";
  const tx: any = {
    $queryRaw: async () => [{ id: 1, lineSendStartedAt, lineSendRetryKey }],
    invoice: { findUnique: async () => ({ status, paymentAllocations: rows }),
      update: async ({ data }: any) => { status = data.status; return { id: 1, invoiceNumber: "TI-1", status }; } },
    paymentAllocation: { findMany: async () => rows,
      findUnique: async ({ where, include }: any) => { const row = rows.find(r => r.id === where.id);
        return include ? row : { paymentId: row.paymentId }; },
    },
    paymentAllocationRelease: { create: async ({ data }: any) => { releases.push(data);
      rows.find(r => r.id === data.allocationId).releases.push({ amount: data.amount }); return data; } },
    repair: { updateMany: async () => ({ count: 1 }) },
  };
  return { db: { $transaction: async (fn: any) => fn(tx) } as any, tx, releases, getStatus: () => status };
}

function row(kind: "INVOICE" | "REPAIR_PREPAYMENT", amount: number, refunds: any[] = []): any {
  return { id: 1, paymentId: 2, allocatedAmount: amount, releases: [],
    payment: { kind, status: "SUCCEEDED", amount, refunds } };
}

test("prepayment-only invoice void releases credit without deleting allocation", async () => {
  const original = row("REPAIR_PREPAYMENT", 5000);
  const state = fixture([original]);
  const result = await voidInvoice(state.db, 1, 9);
  assert.equal(result.releasedAmount, 5000);
  assert.equal(state.getStatus(), "void");
  assert.equal(state.releases[0].allocationId, 1);
  assert.equal(original.releases[0].amount, 5000);
});

test("unresolved LINE reservation blocks void before payment locks and allocation releases", async () => {
  const state = fixture([row("REPAIR_PREPAYMENT", 5000)], new Date());
  await assert.rejects(voidInvoice(state.db, 1, 9), /LINE送信結果が未確定/);
  assert.equal(state.getStatus(), "issued");
  assert.equal(state.releases.length, 0);
});

test("retained completed LINE identity does not block invoice void", async () => {
  const state = fixture([row("REPAIR_PREPAYMENT", 5000)], null, "completed-key");
  await voidInvoice(state.db, 1, 9);
  assert.equal(state.getStatus(), "void");
});

test("unrefunded final invoice payment blocks void", async () => {
  const state = fixture([row("INVOICE", 5000)]);
  await assert.rejects(voidInvoice(state.db, 1, 9), /未返金/);
  assert.equal(state.getStatus(), "issued");
  assert.equal(state.releases.length, 0);
});

test("fully refunded invoice payment permits void and releases allocation", async () => {
  const state = fixture([row("INVOICE", 5000, [{ amount: 2000, status: "SUCCEEDED" },
    { amount: 3000, status: "SUCCEEDED" }])]);
  await voidInvoice(state.db, 1, 9);
  assert.equal(state.getStatus(), "void");
  assert.equal(state.releases.length, 1);
});

test("pending refund and pending invoice payment block void", async () => {
  const first = fixture([row("INVOICE", 5000, [{ amount: 5000, status: "PENDING" }])]);
  await assert.rejects(voidInvoice(first.db, 1, 9), /処理中/);
  const pending = row("INVOICE", 5000); pending.payment.status = "PENDING";
  const second = fixture([pending]);
  await assert.rejects(voidInvoice(second.db, 1, 9), /処理中/);
});

test("partial release cannot exceed the remaining allocation", async () => {
  const state = fixture([row("REPAIR_PREPAYMENT", 5000)]);
  await releaseAllocation(state.tx, 1, 3000, "adjust", 9);
  await assert.rejects(releaseAllocation(state.tx, 1, 2001, "adjust", 9), /超え/);
  assert.equal(state.releases.length, 1);
});
