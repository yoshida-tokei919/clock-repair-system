import assert from "node:assert/strict";
import test from "node:test";
import { summarizeB2BInvoicePreview } from "./b2b-invoice-preview";

test("monthly preview counts each selected delivery shipping charge once after repair tax", () => {
  assert.deepEqual(summarizeB2BInvoicePreview([
    { subtotal: 10000, deliveryNoteId: 4, shippingFee: 800 },
    { subtotal: 5000, deliveryNoteId: 4, shippingFee: 800 },
    { subtotal: 2000, deliveryNoteId: 5, shippingFee: 0 },
  ]), { subtotal: 17000, tax: 1700, shippingFeeAmount: 800, total: 19500, unconfirmedNoteIds: [] });
  assert.equal(summarizeB2BInvoicePreview([{ subtotal: 5000, deliveryNoteId: 4, shippingFee: 800 }]).total, 6300);
});

test("unconfirmed selected delivery shipping blocks a payable total; explicit zero is valid", () => {
  assert.deepEqual(summarizeB2BInvoicePreview([{ subtotal: 1000, deliveryNoteId: 9, shippingFee: null }]).unconfirmedNoteIds, [9]);
  assert.equal(summarizeB2BInvoicePreview([{ subtotal: 1000, deliveryNoteId: 9, shippingFee: null }]).total, null);
  assert.equal(summarizeB2BInvoicePreview([{ subtotal: 1000, deliveryNoteId: 9, shippingFee: 0 }]).total, 1100);
  assert.throws(() => summarizeB2BInvoicePreview([
    { subtotal: 1000, deliveryNoteId: 9, shippingFee: 0 },
    { subtotal: 1000, deliveryNoteId: 9, shippingFee: 900 },
  ]));
});
