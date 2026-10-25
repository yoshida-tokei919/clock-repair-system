import assert from "node:assert/strict";
import test from "node:test";
import { reopenReturnedRepair } from "./repair-reopen";
import { assertEstimateDocumentNotArchived, assertFreshReopenEstimate, encodeReopenEvent,
  HistoricalEstimateDocumentError, parseReopenEvent, REOPEN_EVENT_PREFIX } from "./repair-reopen-approval";

function fixture(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const repair = {
    status: "キャンセル返却", invoiceId: null, deliveryNoteId: null, estimateDocumentId: 3,
    estimate: { id: 8, technicalFee: 0, partsTotal: 0, mechanicCost: 0, discountAmount: 0, shipping: 0,
      taxAmount: 0, totalAmount: 0, pricingTaxMode: "EXCLUSIVE",
      items: [{ itemName: "キャンセルによる返却", type: "labor", quantity: 1, unitPrice: 0, partsMasterId: null }] },
    repairLineItems: [{ itemNameSnapshot: "キャンセルによる返却", lineType: "LABOR", quantity: 1, unitPrice: 0,
      partsMasterId: null, pricingRuleId: null, repairWorkCategoryId: null, repairWorkActionId: null, targetPartNameId: null }],
    ...overrides,
  };
  const tx: any = {
    $queryRaw: async () => [{ id: 7 }],
    repair: { findUnique: async () => repair, update: async ({ data }: any) => { calls.push("repair"); Object.assign(repair, data); } },
    shipmentRepair: { findFirst: async () => null }, payment: { findFirst: async () => null },
    invoiceRepairSnapshot: { findFirst: async () => null }, orderRequest: { findFirst: async () => null },
    repairPartAllocation: { findFirst: async () => null }, lineManagerSendOutbox: { findFirst: async () => null },
    estimateOptionApproval: { findUnique: async () => null }, estimateOptionSet: { findFirst: async () => null },
    estimateDocument: { findFirst: async () => ({ id: 3 }), findUnique: async () => ({ repairs: [{ id: 7 }] }) },
    estimateItem: { deleteMany: async () => { calls.push("estimate-items"); } },
    repairLineItem: { deleteMany: async () => { calls.push("repair-lines"); } },
    estimate: { update: async () => { calls.push("estimate"); } },
    repairStatusLog: { create: async ({ data }: any) => { calls.push(data.status); } },
  };
  return { tx, repair, calls };
}

test("reopen clears only the return draft, keeps the historical document link and logs the boundary", async () => {
  const f = fixture();
  await reopenReturnedRepair(f.tx, 7, 42);
  assert.equal(f.repair.status, "見積中");
  assert.equal(f.repair.estimateDocumentId, 3);
  assert.equal((f.repair as any).approvalStatus, "pending");
  assert.deepEqual(f.calls, [`${REOPEN_EVENT_PREFIX}v2:3:3:0:0:0:0:E`, "estimate-items", "repair-lines", "estimate", "repair", "見積中"]);
  assert.deepEqual(parseReopenEvent(f.calls[0]), { boundary: 3, oldDocumentId: 3, charge: 0, shipping: 0,
    tax: 0, total: 0, taxMode: "EXCLUSIVE" });
});

test("nonzero return charge and shipping remain in the audit before draft deletion", async () => {
  const f = fixture();
  f.repair.estimate.technicalFee = 3000;
  f.repair.estimate.taxAmount = 400;
  f.repair.estimate.totalAmount = 4000;
  f.repair.estimate.items[0].unitPrice = 3000;
  f.repair.estimate.items.push({ ...f.repair.estimate.items[0], itemName: "返送料", unitPrice: 1000 });
  f.repair.repairLineItems[0].unitPrice = 3000;
  f.repair.repairLineItems.push({ ...f.repair.repairLineItems[0], itemNameSnapshot: "返送料", unitPrice: 1000 });
  await reopenReturnedRepair(f.tx, 7, 42);
  assert.equal(f.calls[0], `${REOPEN_EVENT_PREFIX}v2:3:3:3000:1000:400:4000:E`);
  assert.equal(f.calls[1], "estimate-items");
});

test("unreconciled return totals fail closed without deleting a draft", async () => {
  const f = fixture();
  f.repair.estimate.items[0].unitPrice = 1000;
  f.repair.repairLineItems[0].unitPrice = 1000;
  await assert.rejects(() => reopenReturnedRepair(f.tx, 7, 42), /請求金額/);
  assert.deepEqual(f.calls, []);
});

test("reopen event decoder accepts legacy boundaries and rejects ambiguous payloads", () => {
  assert.equal(parseReopenEvent(`${REOPEN_EVENT_PREFIX}3`)?.boundary, 3);
  assert.equal(parseReopenEvent(`${REOPEN_EVENT_PREFIX}v2:3:3:0:0:0:0:E`)?.oldDocumentId, 3);
  assert.equal(parseReopenEvent(`${REOPEN_EVENT_PREFIX}v2:03:3:0:0:0:0:E`), null);
  assert.equal(parseReopenEvent(`${REOPEN_EVENT_PREFIX}3:4`), null);
  assert.equal(encodeReopenEvent({ boundary: 4, oldDocumentId: null, charge: 0, shipping: 0, tax: 0, total: 0,
    taxMode: "INCLUSIVE" }), `${REOPEN_EVENT_PREFIX}v2:4:0:0:0:0:0:I`);
});

test("archived PDF guard matches exact old document ID, including B2B group history", async () => {
  const statuses = [
    `${REOPEN_EVENT_PREFIX}v2:20:12:0:0:0:0:E`, // One member of a former group; no current Repair association needed.
    `${REOPEN_EVENT_PREFIX}v2:20:4:12:0:1:12:E`, // A matching amount is not an old document ID.
    `${REOPEN_EVENT_PREFIX}v2:12:4:0:0:0:0:E`, // A matching boundary is not an old document ID.
  ];
  const db: any = { repairStatusLog: { findMany: async ({ where }: any) => statuses
    .filter(status => status.startsWith(where.status.startsWith) && status.includes(where.status.contains))
    .map(status => ({ status })) } };
  await assert.rejects(() => assertEstimateDocumentNotArchived(db, 12), HistoricalEstimateDocumentError);
  await assert.doesNotReject(() => assertEstimateDocumentNotArchived(db, 13));
  await assert.doesNotReject(() => assertEstimateDocumentNotArchived(db, 21));
  statuses.shift();
  await assert.doesNotReject(() => assertEstimateDocumentNotArchived(db, 12));
});

test("reopen rejects repeat clicks, delivered watches, money, stock, orders, outbox and drifted lines", async () => {
  const checks: [string, (f: ReturnType<typeof fixture>) => void][] = [
    ["status", f => { f.repair.status = "見積中"; }],
    ["invoice", f => { f.repair.invoiceId = 9 as never; }],
    ["group document", f => { f.tx.estimateDocument.findUnique = async () => ({ repairs: [{ id: 7 }, { id: 8 }] }); }],
    ["shipment", f => { f.tx.shipmentRepair.findFirst = async () => ({ shipmentId: 1 }); }],
    ["payment", f => { f.tx.payment.findFirst = async () => ({ id: 1 }); }],
    ["invoice snapshot", f => { f.tx.invoiceRepairSnapshot.findFirst = async () => ({ id: 1 }); }],
    ["order", f => { f.tx.orderRequest.findFirst = async () => ({ id: 1 }); }],
    ["stock", f => { f.tx.repairPartAllocation.findFirst = async () => ({ id: 1 }); }],
    ["outbox", f => { f.tx.lineManagerSendOutbox.findFirst = async () => ({ id: 1 }); }],
    ["drift", f => { f.repair.estimate.items[0].itemName = "過去の修理"; }],
  ];
  for (const [label, change] of checks) {
    const f = fixture(); change(f);
    await assert.rejects(() => reopenReturnedRepair(f.tx, 7, 42), label);
    assert.deepEqual(f.calls, [], label);
  }
});

test("reopened approval requires a newer document and PDF, with a structured zero-yen quote", async () => {
  const changedAt = new Date("2026-10-25T00:00:00Z");
  const tx: any = {
    repairStatusLog: { findFirst: async () => ({ status: `${REOPEN_EVENT_PREFIX}3`, changedAt }) },
    estimateDocument: { findUnique: async () => ({ currentPdfFile: { generatedAt: new Date("2026-10-25T01:00:00Z"),
      status: "current", storageKey: "pdf", hash: "hash" } }) },
  };
  const item = { itemName: "新しい見積", quantity: 1, unitPrice: 0, createdAt: new Date("2026-10-25T00:30:00Z") };
  const repair = { estimateDocumentId: 4, estimate: { items: [item] } };
  await assert.doesNotReject(() => assertFreshReopenEstimate(tx, 7, repair));
  await assert.rejects(() => assertFreshReopenEstimate(tx, 7, { ...repair, estimateDocumentId: 3 }));
  await assert.rejects(() => assertFreshReopenEstimate(tx, 7, { ...repair, estimate: { items: [] } }));
  item.createdAt = new Date("2026-10-25T02:00:00Z");
  await assert.rejects(() => assertFreshReopenEstimate(tx, 7, repair));
  tx.repairStatusLog.findFirst = async () => null;
  await assert.doesNotReject(() => assertFreshReopenEstimate(tx, 7, { ...repair, estimate: null }));
});
