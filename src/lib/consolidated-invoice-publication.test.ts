import assert from "node:assert/strict";
import test from "node:test";
import type { ConsolidatedBundle } from "./consolidated-invoice-publication";
import { assertConsolidatedSourceUnpaid, buildConsolidatedPdfData, isCurrentConsolidatedPdf, newConsolidatedShareToken, validConsolidatedShareToken } from "./consolidated-invoice-publication";
import { renderConsolidatedInvoicePdf } from "./consolidated-invoice-pdf";

const due = new Date("2026-12-31T00:00:00Z");
const fixture = {
  id: 1, createdAt: new Date("2026-11-03T00:00:00Z"), companyName: "架空グループ", billingName: "架空取引先",
  billingCompanyName: null, billingZipCode: null, billingAddress: null, billingPrefecture: null,
  billingCity: null, billingStreet: null, billingBuilding: null,
  grossTotalAmount: 82428,
  sources: [
    { id: 1, invoiceId: 11, invoiceNumber: "KI-001", sourceCustomerName: "架空A店", sourceCompanyName: null,
      totalAmount: 72117, taxAmount: 7212, shippingFeeAmount: 0, grossTotalAmount: 79329,
      deliveryNotes: [{ id: 1, slipNumber: "D-001", deliveryNoteId: 1, repairCount: 1, subtotalAmount: 72117 }] },
    { id: 2, invoiceId: 12, invoiceNumber: "SI-001", sourceCustomerName: "架空B店", sourceCompanyName: null,
      totalAmount: 2817, taxAmount: 282, shippingFeeAmount: 0, grossTotalAmount: 3099, deliveryNotes: [] },
  ],
} as unknown as ConsolidatedBundle;

test("consolidated PDF totals use immutable source snapshots", () => {
  const data = buildConsolidatedPdfData(fixture, [due, due]);
  assert.equal(data.gross, 82428);
  assert.equal(data.subtotal, 74934);
  assert.equal(data.tax, 7494);
  assert.equal(data.dueDate, "2026-12-31");
  assert.throws(() => buildConsolidatedPdfData({ ...fixture, grossTotalAmount: 82427 }, [due, due]));
  assert.throws(() => buildConsolidatedPdfData({ ...fixture, sources: [{ ...fixture.sources[0], taxAmount: 0 }, fixture.sources[1]] }, [due, due]));
});

test("missing or conflicting due dates do not become a fake payment deadline", () => {
  assert.equal(buildConsolidatedPdfData(fixture, [due, null]).dueDate, null);
  assert.equal(buildConsolidatedPdfData(fixture, [due, new Date("2027-01-31T00:00:00Z")]).dueDate, null);
  assert.throws(() => buildConsolidatedPdfData(fixture, [due]));
});

test("share token has 256 bits of randomness and strict URL syntax", () => {
  const tokens = Array.from({ length: 16 }, newConsolidatedShareToken);
  assert.equal(new Set(tokens).size, tokens.length);
  assert.ok(tokens.every(validConsolidatedShareToken));
  assert.equal(validConsolidatedShareToken("weak-token"), false);
  assert.equal(validConsolidatedShareToken(`${tokens[0]}x`), false);
});

test("public PDF access requires a fully published pointer", () => {
  const ready = { status: "current", storageKey: "consolidated-invoices/1/1.pdf", hash: "abc", fileSize: 100 };
  assert.equal(isCurrentConsolidatedPdf(ready), true);
  assert.equal(isCurrentConsolidatedPdf({ ...ready, status: "draft" }), false);
  assert.equal(isCurrentConsolidatedPdf({ ...ready, storageKey: null }), false);
  assert.equal(isCurrentConsolidatedPdf({ ...ready, hash: null }), false);
  assert.equal(isCurrentConsolidatedPdf(null), false);
});

test("paid, partial, pending and cross-customer source payments block full-gross publication", () => {
  const source = fixture.sources[0];
  const invoice = { id: source.invoiceId, invoiceNumber: source.invoiceNumber, customerId: 21,
    grossTotalAmount: source.grossTotalAmount, status: "issued", paymentAllocations: [] };
  const snapshot = { ...source, sourceCustomerId: 21 };
  assert.doesNotThrow(() => assertConsolidatedSourceUnpaid(snapshot, invoice));
  const allocation = (status: "SUCCEEDED" | "PENDING", amount: number, customerId = 21) => ({
    allocatedAmount: amount, releases: [], payment: { status, kind: "INVOICE", customerId, refunds: [] },
  });
  assert.throws(() => assertConsolidatedSourceUnpaid(snapshot, { ...invoice, status: "paid" }));
  assert.throws(() => assertConsolidatedSourceUnpaid(snapshot, { ...invoice, paymentAllocations: [allocation("SUCCEEDED", 1000)] }));
  assert.throws(() => assertConsolidatedSourceUnpaid(snapshot, { ...invoice, paymentAllocations: [allocation("SUCCEEDED", source.grossTotalAmount)] }));
  assert.throws(() => assertConsolidatedSourceUnpaid(snapshot, { ...invoice, paymentAllocations: [allocation("PENDING", 1000)] }));
  assert.throws(() => assertConsolidatedSourceUnpaid(snapshot, { ...invoice, paymentAllocations: [allocation("PENDING", 1000, 99)] }));
  assert.throws(() => assertConsolidatedSourceUnpaid(snapshot, { ...invoice, paymentAllocations: [{
    ...allocation("SUCCEEDED", 1000), payment: { ...allocation("SUCCEEDED", 1000).payment,
      refunds: [{ amount: 1000, status: "PENDING" }] },
  }] }));
});

test("one consolidated invoice renders as a PDF", async () => {
  const buffer = await renderConsolidatedInvoicePdf(buildConsolidatedPdfData(fixture, [due, due]));
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  assert.ok(buffer.length > 1000);
});
