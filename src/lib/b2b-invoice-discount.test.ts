import assert from "node:assert/strict";
import test from "node:test";
import { invoiceAmountsWithDiscount, resolveDiscountBps, parseDiscountBps, percentInputToBps } from "./b2b-invoice-discount";
import { summarizeB2BInvoicePreview } from "./b2b-invoice-preview";
import { buildInvoiceRepairSnapshotData, hasConsistentInvoiceSnapshots } from "./invoice-repair-snapshots";
import { consolidatedDeliveryNoteRows } from "./consolidated-invoice-publication";
import { consolidatedInvoiceDocumentData } from "./consolidated-invoice-pdf";

test("basis point rates resolve invoice, customer, standard including explicit zero", () => {
  assert.equal(resolveDiscountBps(undefined, null, 300), 300);
  assert.equal(resolveDiscountBps(undefined, 250, 300), 250);
  assert.equal(resolveDiscountBps(0, 250, 300), 0);
  assert.equal(resolveDiscountBps(200, 250, 300), 200);
  assert.throws(() => parseDiscountBps(250.5));
  assert.equal(percentInputToBps("2.55"), 255);
  assert.equal(percentInputToBps("2.01"), 201);
  assert.equal(percentInputToBps("0"), 0);
  assert.equal(percentInputToBps(""), "");
  assert.equal(Number.isNaN(percentInputToBps("2.555")), true);
});

test("discount applies to exclusive basis, floors yen, and excludes tax-inclusive shipping", () => {
  for (const [rate, discount, net, tax, gross] of [
    [0, 0, 10001, 1000, 11801], [200, 200, 9801, 980, 11581],
    [250, 250, 9751, 975, 11526], [300, 300, 9701, 970, 11471],
  ]) {
    const amounts = invoiceAmountsWithDiscount(10001, 800, "EXCLUSIVE", rate);
    assert.deepEqual([amounts.discountAmount, amounts.totalAmount, amounts.taxAmount, amounts.grossTotalAmount], [discount, net, tax, gross]);
    assert.equal(summarizeB2BInvoicePreview([{ subtotal: 10001, deliveryNoteId: 1, shippingFee: 800 }], rate).total, gross);
  }
});

test("inclusive lines retain original gross snapshots while discount uses their tax-exclusive basis", () => {
  const repair = { id: 1, inquiryNumber: "B-001", deliveryNoteId: 1,
    deliveryNote: { slipNumber: "BD-001", issuedDate: new Date("2026-10-01"), shippingFee: 800 },
    deliveryDateActual: null, estimate: { pricingTaxMode: "INCLUSIVE", items: [{ unitPrice: 11000, quantity: 1 }] } };
  const repairSnapshots = buildInvoiceRepairSnapshotData([repair], "INCLUSIVE");
  const invoice = { ...invoiceAmountsWithDiscount(11000, 800, "INCLUSIVE", 300), pricingTaxMode: "INCLUSIVE", repairSnapshots };
  assert.deepEqual([invoice.discountBasisAmount, invoice.discountAmount, invoice.totalAmount, invoice.taxAmount, invoice.grossTotalAmount], [10000, 300, 9700, 970, 11470]);
  assert.equal(repairSnapshots[0].grossAmount, 11000);
  assert.equal(hasConsistentInvoiceSnapshots(invoice), true);
  assert.equal(hasConsistentInvoiceSnapshots({ ...invoice, discountAmount: 600 }), false);
  const legacy = { discountBasisAmount: null, discountRateBps: null, discountAmount: null,
    totalAmount: 10000, taxAmount: 1000, shippingFeeAmount: 800, grossTotalAmount: 11800,
    pricingTaxMode: "INCLUSIVE", repairSnapshots };
  assert.equal(hasConsistentInvoiceSnapshots(legacy), true);
});

test("consolidated 2% and 3% source snapshots allocate once per delivery note", () => {
  const date = new Date("2026-10-01T00:00:00Z");
  const sources = [200, 300].map((rate, index) => {
    const amounts = invoiceAmountsWithDiscount(10000, 800, "EXCLUSIVE", rate);
    return { ...amounts, deliveryNotes: [{ slipNumber: `D-${index}`, issuedDate: date, repairCount: 1, subtotalAmount: 10000 }] };
  });
  const grossTotalAmount = sources.reduce((sum, row) => sum + row.grossTotalAmount, 0);
  const rows = consolidatedDeliveryNoteRows({ grossTotalAmount, sources });
  assert.deepEqual(rows.map(row => row.discountAmount), [200, 300]);
  assert.equal(rows.reduce((sum, row) => sum + row.grossAmount, 0), grossTotalAmount);
  assert.equal(rows.reduce((sum, row) => sum + row.originalAmount, 0), 20000);
  const data = consolidatedInvoiceDocumentData({
    bundle: { id: 1, companyName: "Group", issueState: { issuedDate: date }, sources },
    rows, originalSubtotal: 20000, subtotal: 19500, discount: 500, tax: 1950,
    shipping: 1600, gross: grossTotalAmount, dueDate: "2026-11-30",
  } as Parameters<typeof consolidatedInvoiceDocumentData>[0]);
  assert.deepEqual([data.discountBasisAmount, data.discountAmount, data.subtotalAmount, data.shippingFeeAmount, data.grossTotalAmount],
    [20000, 500, 19500, 1600, grossTotalAmount]);
  assert.match(data.items[0].description, /2%/);
  assert.match(data.items[1].description, /3%/);
});
