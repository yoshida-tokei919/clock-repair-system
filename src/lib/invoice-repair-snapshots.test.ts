import assert from "node:assert/strict";
import test from "node:test";

import { buildInvoiceRepairSnapshotData, calculateIssuedInvoiceAmounts, hasConsistentInvoiceSnapshots } from "./invoice-repair-snapshots";

test("invoice repair snapshots retain invoice-time amount and delivery details", () => {
  const issuedDate = new Date("2026-09-14T00:00:00.000Z");
  const snapshots = buildInvoiceRepairSnapshotData([
    {
      id: 10,
      inquiryNumber: "T-010",
      deliveryNoteId: 3,
      deliveryNote: { slipNumber: "TD-003", issuedDate },
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
  }]);
});

test("issued gross total and included tax use integer yen and floor rounding", () => {
  assert.deepEqual(calculateIssuedInvoiceAmounts(30000), { totalAmount: 30000, taxAmount: 3000, grossTotalAmount: 33000 });
  assert.deepEqual(calculateIssuedInvoiceAmounts(10009), { totalAmount: 10009, taxAmount: 1000, grossTotalAmount: 11009 });
  assert.throws(() => calculateIssuedInvoiceAmounts(0.5));
  assert.throws(() => calculateIssuedInvoiceAmounts(2147483647));
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
