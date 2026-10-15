import assert from "node:assert/strict";
import test from "node:test";

import { aggregateDeliveryShipping, buildInvoiceRepairSnapshotData, calculateIssuedInvoiceAmounts, hasConsistentInvoiceSnapshots, invoicePdfRepairAmount } from "./invoice-repair-snapshots";
import { commonEstimateMode } from "./pricing-tax";

test("invoice repair snapshots retain invoice-time amount and delivery details", () => {
  const issuedDate = new Date("2026-09-14T00:00:00.000Z");
  const snapshots = buildInvoiceRepairSnapshotData([
    {
      id: 10,
      inquiryNumber: "T-010",
      deliveryNoteId: 3,
      deliveryNote: { slipNumber: "TD-003", issuedDate, shippingFee: 0 },
      deliveryDateActual: null,
      estimate: { items: [{ unitPrice: 5_000, quantity: 2 }] },
    },
  ]);

  assert.deepEqual(snapshots, [{
    repairId: 10,
    inquiryNumber: "T-010",
    deliveryNoteId: 3,
    deliverySlipNumber: "TD-003",
    deliveryIssuedDate: issuedDate,
    deliveryDateActual: null,
    subtotalAmount: 10_000,
    deliveryShippingFee: 0,
  }]);
});

test("issued gross total and included tax use integer yen and floor rounding", () => {
  assert.deepEqual(calculateIssuedInvoiceAmounts(30000), { totalAmount: 30000, taxAmount: 3000, shippingFeeAmount: 0, grossTotalAmount: 33000 });
  assert.deepEqual(calculateIssuedInvoiceAmounts(10009), { totalAmount: 10009, taxAmount: 1000, shippingFeeAmount: 0, grossTotalAmount: 11009 });
  assert.deepEqual(calculateIssuedInvoiceAmounts(30000, 1200), { totalAmount: 30000, taxAmount: 3000, shippingFeeAmount: 1200, grossTotalAmount: 34200 });
  assert.throws(() => calculateIssuedInvoiceAmounts(0.5));
  assert.throws(() => calculateIssuedInvoiceAmounts(2147483647));
  assert.throws(() => calculateIssuedInvoiceAmounts(100, -1));
});

test("delivery shipping is counted once per note and retained on each repair snapshot", () => {
  const date = new Date("2026-10-15T00:00:00Z");
  const repairs = [1, 2].map(id => ({ id, inquiryNumber: `T-${id}`, deliveryNoteId: 8,
    deliveryNote: { slipNumber: "TD-008", issuedDate: date, shippingFee: 1230 },
    deliveryDateActual: null, estimate: { items: [{ unitPrice: 1000, quantity: 1 }] } }));
  assert.equal(aggregateDeliveryShipping(repairs), 1230);
  const snapshots = buildInvoiceRepairSnapshotData(repairs);
  assert.deepEqual(snapshots.map(row => row.deliveryShippingFee), [1230, 1230]);
  const invoice = { ...calculateIssuedInvoiceAmounts(2000, 1230), repairSnapshots: snapshots };
  assert.equal(hasConsistentInvoiceSnapshots(invoice), true);
  assert.equal(hasConsistentInvoiceSnapshots({ ...invoice, shippingFeeAmount: 2460 }), false);
  assert.equal(hasConsistentInvoiceSnapshots({ ...invoice, repairSnapshots: [{ ...snapshots[0], deliveryShippingFee: 999 }, snapshots[1]] }), false);
  assert.throws(() => aggregateDeliveryShipping([{ ...repairs[0], deliveryNote: { ...repairs[0].deliveryNote, shippingFee: null } }]));
  assert.throws(() => aggregateDeliveryShipping([{ ...repairs[0], deliveryNote: { ...repairs[0].deliveryNote, shippingFee: -1 } }]));
  assert.throws(() => aggregateDeliveryShipping([repairs[0], { ...repairs[1], deliveryNote: { ...repairs[1].deliveryNote, shippingFee: 99 } }]));
});

test("editing estimates never changes issued snapshots; missing or inconsistent rows cannot render", () => {
  const repair = {
    id: 1, inquiryNumber: "T-001", deliveryNoteId: null, deliveryNote: null,
    deliveryDateActual: null, estimate: { items: [{ unitPrice: 30000, quantity: 1 }] },
  };
  const repairSnapshots = buildInvoiceRepairSnapshotData([repair]);
  const invoice = { ...calculateIssuedInvoiceAmounts(30000), repairSnapshots };
  repair.estimate.items[0].unitPrice = 90000;
  assert.equal(invoice.totalAmount, 30000);
  assert.equal(invoice.grossTotalAmount, 33000);
  assert.equal(repairSnapshots[0].subtotalAmount, 30000);
  assert.equal(hasConsistentInvoiceSnapshots(invoice), true);
  assert.equal(hasConsistentInvoiceSnapshots({ ...invoice, repairSnapshots: [] }), false);
  assert.equal(hasConsistentInvoiceSnapshots({ ...invoice, totalAmount: 99000 }), false);
  assert.equal(hasConsistentInvoiceSnapshots({ ...invoice, grossTotalAmount: 99000 }), false);
});

test("inclusive invoice snapshots keep displayed gross and reconcile net deterministically", () => {
  const repairs = [
    { id: 2, inquiryNumber: "B-002", deliveryNoteId: 4, deliveryNote: { slipNumber: "BD-004", issuedDate: new Date("2026-10-15"), shippingFee: 800 }, deliveryDateActual: null,
      estimate: { pricingTaxMode: "INCLUSIVE", items: [{ unitPrice: 44000, quantity: 1 }] } },
    { id: 1, inquiryNumber: "B-001", deliveryNoteId: 4, deliveryNote: { slipNumber: "BD-004", issuedDate: new Date("2026-10-15"), shippingFee: 800 }, deliveryDateActual: null,
      estimate: { pricingTaxMode: "INCLUSIVE", items: [{ unitPrice: 15000, quantity: 1 }] } },
  ];
  const mode = commonEstimateMode(repairs);
  assert.equal(mode, "INCLUSIVE");
  const rows = buildInvoiceRepairSnapshotData(repairs, mode);
  assert.deepEqual(rows.map(row => row.repairId), [1, 2]);
  assert.deepEqual(rows.map(row => row.grossAmount), [15000, 44000]);
  assert.equal(rows.reduce((sum, row) => sum + row.subtotalAmount, 0), 53637);
  const invoice = { ...calculateIssuedInvoiceAmounts(59000, 800, mode), pricingTaxMode: mode, repairSnapshots: rows };
  assert.deepEqual({ total: invoice.totalAmount, tax: invoice.taxAmount, gross: invoice.grossTotalAmount },
    { total: 53637, tax: 5363, gross: 59800 });
  assert.equal(hasConsistentInvoiceSnapshots(invoice), true);
  assert.equal(rows.reduce((sum, row) => sum + invoicePdfRepairAmount(row, mode), 0), 59000);
  assert.equal(hasConsistentInvoiceSnapshots({ ...invoice, repairSnapshots: rows.map(row => ({ ...row, grossAmount: (row.grossAmount ?? 0) + 1 })) }), false);
  assert.equal(hasConsistentInvoiceSnapshots({ ...invoice, pricingTaxMode: "EXCLUSIVE" }), false);
  assert.equal(commonEstimateMode(repairs), "INCLUSIVE"); // Billing recipient has no role in source estimate mode.
});
