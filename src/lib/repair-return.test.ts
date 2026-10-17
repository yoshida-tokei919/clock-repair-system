import assert from "node:assert/strict";
import test from "node:test";
import { applyRepairReturn, repairReturnLines } from "./repair-return";
import { canAllocateRepairParts } from "./repair-part-allocation";
import { canApplyPartsOrderStatus } from "./repair-parts-status";
import { assertRepairStatus, persistManualRepairStatus } from "./repair-manual-status";
import { getRepairStatusTransition } from "./repair-status-transition";

function fixture(status = "作業中", consumed = false, pendingPrepayment = false) {
  const repair = { id: 7, status, invoiceId: null as number | null, deliveryNoteId: null as number | null, estimate: { id: 8, pricingTaxMode: "EXCLUSIVE" } };
  const document = { id: 9, currentPdfFileId: 10, pdfFiles: [{ id: 10, storageKey: "issued.pdf", approvedAt: new Date() }] };
  const originalDocument = structuredClone(document);
  let estimateItems: any[] = [{ itemName: "オーバーホール", unitPrice: 40000 }];
  let repairItems: any[] = [{ itemNameSnapshot: "オーバーホール", amount: 40000 }];
  let totals: any = null;
  const calls: string[] = [];
  const tx: any = {
    $queryRaw: async () => [{ id: 7 }],
    repair: { findUnique: async () => repair },
    payment: { findFirst: async () => pendingPrepayment ? { id: 21 } : null },
    repairPartAllocation: { findFirst: async () => consumed ? { id: 12 } : null },
    estimate: { upsert: async ({ update }: any) => { totals = update; return repair.estimate; } },
    estimateItem: {
      deleteMany: async () => { calls.push("estimate-delete"); estimateItems = []; },
      createMany: async ({ data }: any) => { calls.push("estimate-create"); estimateItems = data; },
    },
    repairLineItem: {
      deleteMany: async () => { calls.push("mirror-delete"); repairItems = []; },
      createMany: async ({ data }: any) => { calls.push("mirror-create"); repairItems = data; },
    },
  };
  const persist = async (_tx: any, _id: number, outcome: string, actor: number) => {
    calls.push(`status:${outcome}:${actor}`);
    repair.status = outcome;
    return { repair, reconciliation: { status: outcome } };
  };
  return { tx, persist, repair, document, originalDocument, calls, get estimateItems() { return estimateItems; }, get repairItems() { return repairItems; }, get totals() { return totals; } };
}

test("repair-unavailable zero yen replaces old lines and preserves issued evidence", async () => {
  const f = fixture();
  await applyRepairReturn(f.tx, 7, 42, { outcome: "修理不可返却", charge: 0, shipping: 0 }, f.persist as never);
  assert.deepEqual(f.estimateItems.map(i => [i.itemName, i.unitPrice]), [["修理不可による返却", 0]]);
  assert.deepEqual(f.repairItems.map(i => [i.itemNameSnapshot, i.amount]), [["修理不可による返却", 0]]);
  assert.equal(f.totals.totalAmount, 0);
  assert.equal(f.totals.taxAmount, 0);
  assert.equal(f.repair.status, "修理不可返却");
  assert.deepEqual(f.document, f.originalDocument);
  assert.deepEqual(f.calls, ["estimate-delete", "estimate-create", "mirror-delete", "mirror-create", "status:修理不可返却:42"]);
});

test("cancel charge and optional shipping produce matching totals and mirrors", async () => {
  const f = fixture();
  await applyRepairReturn(f.tx, 7, 3, { outcome: "キャンセル返却", charge: 3000, shipping: 1000 }, f.persist as never);
  assert.deepEqual(f.estimateItems.map(i => [i.itemName, i.unitPrice]), [["キャンセルによる返却", 3000], ["返送料", 1000]]);
  assert.deepEqual(f.repairItems.map(i => [i.itemNameSnapshot, i.amount]), [["キャンセルによる返却", 3000], ["返送料", 1000]]);
  assert.equal(f.totals.totalAmount, 4000);
  assert.equal(f.totals.taxAmount, 400);
  assert.equal(f.repair.status, "キャンセル返却");
});

test("return status is terminal for parts flow and still releases reservations", () => {
  assert.doesNotThrow(() => assertRepairStatus("修理不可返却"));
  assert.doesNotThrow(() => assertRepairStatus("キャンセル返却"));
  assert.doesNotThrow(() => assertRepairStatus("キャンセル"));
  assert.equal(canApplyPartsOrderStatus("修理不可返却"), false);
  assert.equal(canApplyPartsOrderStatus("キャンセル返却"), false);
  assert.equal(canAllocateRepairParts({ status: "修理不可返却", approvalStatus: "pending", customerType: "individual" }), true);
  assert.equal(canAllocateRepairParts({ status: "キャンセル返却", approvalStatus: "pending", customerType: "individual" }), true);
  assert.equal(canAllocateRepairParts({ status: "キャンセル", approvalStatus: "pending", customerType: "individual" }), false);
  assert.throws(() => getRepairStatusTransition("修理不可返却", "作業待ち"));
  assert.throws(() => getRepairStatusTransition("キャンセル返却", "作業待ち"));
  assert.doesNotThrow(() => getRepairStatusTransition("修理不可返却", "納品済み"));
  assert.doesNotThrow(() => getRepairStatusTransition("キャンセル返却", "納品済み"));
  assert.doesNotThrow(() => getRepairStatusTransition("キャンセル", "作業待ち"));
});

test("return transition records actor and calls allocation reconciliation without status rollback", async () => {
  const repair = { id: 7, status: "作業中" };
  const logs: { id: number; status: string; changedBy: number | null }[] = [{ id: 1, status: "作業中", changedBy: null }];
  let requestedStatus = "";
  const tx: any = {
    repair: {
      findUniqueOrThrow: async () => ({ ...repair }),
      update: async ({ data }: any) => Object.assign(repair, data),
    },
    repairStatusLog: {
      findFirst: async () => logs.at(-1),
      create: async ({ data }: any) => { logs.push({ id: 2, status: data.status, changedBy: null }); },
      updateMany: async ({ where, data }: any) => { for (const log of logs) if (log.id > where.id.gt) log.changedBy = data.changedBy; },
    },
  };
  const reconcile = async (_tx: any, _id: number, options: any) => { requestedStatus = options.requestedStatus; return { status: repair.status }; };
  await persistManualRepairStatus(tx, 7, "修理不可返却", 42, undefined, reconcile as never, { allowReturnStatus: true });
  assert.equal(requestedStatus, "修理不可返却");
  assert.deepEqual(logs[1], { id: 2, status: "修理不可返却", changedBy: 42 });
});

test("shipping-waiting repair uses normal cancellation instead of return processing", async () => {
  const f = fixture("送付待ち");
  await assert.rejects(
    () => applyRepairReturn(f.tx, 7, 1, { outcome: "キャンセル返却", charge: 0, shipping: 0 }, f.persist as never),
    /未受領の案件/,
  );
  assert.equal(f.totals, null);
  assert.deepEqual(f.estimateItems, [{ itemName: "オーバーホール", unitPrice: 40000 }]);
  assert.deepEqual(f.repairItems, [{ itemNameSnapshot: "オーバーホール", amount: 40000 }]);
  assert.equal(f.repair.status, "送付待ち");
  assert.deepEqual(f.calls, []);
});

test("issued invoice or delivery note blocks return before any current state changes", async () => {
  for (const [field, message] of [["invoiceId", /請求書が発行済み/], ["deliveryNoteId", /納品書が発行済み/]] as const) {
    const f = fixture();
    f.repair[field] = 99;
    await assert.rejects(
      () => applyRepairReturn(f.tx, 7, 1, { outcome: "修理不可返却", charge: 1000, shipping: 500 }, f.persist as never),
      message,
    );
    assert.equal(f.totals, null);
    assert.deepEqual(f.estimateItems, [{ itemName: "オーバーホール", unitPrice: 40000 }]);
    assert.deepEqual(f.repairItems, [{ itemNameSnapshot: "オーバーホール", amount: 40000 }]);
    assert.equal(f.repair.status, "作業中");
    assert.deepEqual(f.document, f.originalDocument);
    assert.deepEqual(f.calls, []);
  }
});

test("invalid charges and repeat returns are rejected before replacing lines", async () => {
  assert.throws(() => repairReturnLines("修理不可返却", -1, 0));
  assert.throws(() => repairReturnLines("修理不可返却", 0.5, 0));
  const f = fixture("キャンセル返却");
  await assert.rejects(() => applyRepairReturn(f.tx, 7, 1, { outcome: "キャンセル返却", charge: 0, shipping: 0 }, f.persist as never));
  assert.equal(f.estimateItems[0].itemName, "オーバーホール");
});

test("consumed parts fail closed before billing, status, or document changes", async () => {
  const f = fixture("作業中", true);
  await assert.rejects(
    () => applyRepairReturn(f.tx, 7, 1, { outcome: "修理不可返却", charge: 0, shipping: 0 }, f.persist as never),
    /消費済み部品割当/,
  );
  assert.equal(f.estimateItems[0].itemName, "オーバーホール");
  assert.equal(f.repairItems[0].itemNameSnapshot, "オーバーホール");
  assert.equal(f.repair.status, "作業中");
  assert.deepEqual(f.document, f.originalDocument);
  assert.deepEqual(f.calls, []);
});

test("pending prepayment blocks return before billing, status, or document changes", async () => {
  const f = fixture("作業中", false, true);
  await assert.rejects(
    () => applyRepairReturn(f.tx, 7, 1, { outcome: "キャンセル返却", charge: 1000, shipping: 0 }, f.persist as never),
    /未決済の前受金/,
  );
  assert.equal(f.estimateItems[0].itemName, "オーバーホール");
  assert.equal(f.repairItems[0].itemNameSnapshot, "オーバーホール");
  assert.equal(f.repair.status, "作業中");
  assert.deepEqual(f.document, f.originalDocument);
  assert.deepEqual(f.calls, []);
});
