import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { assertCorrectionNotStarted, assertExpectedCorrectionNumber, assertNoOctoberDeliveryOrPayment, assertStoredPdfMatches, OCTOBER_TARGETS, verifiedOctoberAmounts } from "./issued-october-invoice-correction-plan";

test("all six frozen October amounts and both totals match the 3% correction", () => {
  assert.deepEqual(OCTOBER_TARGETS.map(row => row.id), [1, 3, 4, 5, 6, 7]);
  for (const row of OCTOBER_TARGETS) {
    const actual = verifiedOctoberAmounts(row.old[0], row.old[2]);
    assert.deepEqual([actual.totalAmount, actual.taxAmount, actual.shippingFeeAmount,
      actual.grossTotalAmount, actual.discountAmount], [...row.corrected], row.number);
    assert.equal(row.old[0] + row.old[1] + row.old[2], row.old[3]);
  }
  assert.equal(OCTOBER_TARGETS.reduce((sum, row) => sum + row.old[3], 0), 283036);
  assert.equal(OCTOBER_TARGETS.reduce((sum, row) => sum + row.corrected[3], 0), 274662);
  assert.equal(OCTOBER_TARGETS.reduce((sum, row) => sum + row.old[3] - row.corrected[3], 0), 8374);
  assert.equal(OCTOBER_TARGETS.slice(-2).reduce((sum, row) => sum + row.corrected[3], 0), 79995);
});

test("sent, paid, prepayment, and pending delivery states fail closed", () => {
  const safe = { status: "issued", sentAt: null, lineSendRetryKey: null, lineSendStartedAt: null,
    allocationCount: 0, pdfSentCount: 0, paymentCount: 0, outboxCount: 0,
    lineSendPdfFileId: null, pdfPaidCount: 0 };
  assert.doesNotThrow(() => assertNoOctoberDeliveryOrPayment(safe));
  for (const changed of [{ status: "paid" }, { status: "void" }, { sentAt: new Date() },
    { lineSendRetryKey: "retry" }, { lineSendStartedAt: new Date() }, { allocationCount: 1 },
    { pdfSentCount: 1 }, { paymentCount: 1 }, { outboxCount: 1 },
    { lineSendPdfFileId: 10 }, { pdfPaidCount: 1 }]) {
    assert.throws(() => assertNoOctoberDeliveryOrPayment({ ...safe, ...changed }));
  }
});

test("every linked payment kind and status blocks correction", () => {
  const safe = { status: "issued", sentAt: null, lineSendRetryKey: null, lineSendStartedAt: null,
    allocationCount: 0, pdfSentCount: 0, paymentCount: 0, outboxCount: 0,
    lineSendPdfFileId: null, pdfPaidCount: 0 };
  for (const kindAndStatus of ["REPAIR_PREPAYMENT pending", "INVOICE pending", "INVOICE refunded"]) {
    assert.throws(() => assertNoOctoberDeliveryOrPayment({ ...safe, paymentCount: 1 }), kindAndStatus);
  }
});

test("number collision and a changed sequence reject the correction", () => {
  assert.doesNotThrow(() => assertExpectedCorrectionNumber(2, "OI-002", "O", false));
  assert.throws(() => assertExpectedCorrectionNumber(2, "OI-002", "O", true));
  assert.throws(() => assertExpectedCorrectionNumber(3, "OI-003", "O", false));
  assert.throws(() => assertExpectedCorrectionNumber(2, "JI-002", "O", false));
});

test("an existing batch makes a repeated stage request fail closed", () => {
  assert.doesNotThrow(() => assertCorrectionNotStarted(null));
  assert.throws(() => assertCorrectionNotStarted({ id: 1, status: "preparing" }));
  assert.throws(() => assertCorrectionNotStarted({ id: 1, status: "activated" }));
});

test("correction code cannot mutate immutable bundle/source rows or delete archived PDFs", () => {
  const source = readFileSync(new URL("./issued-october-invoice-correction.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /(?:consolidatedInvoice|consolidatedInvoiceSource)\.(?:update|updateMany|delete|deleteMany)\s*\(/);
  assert.doesNotMatch(source, /(?:deleteInvoicePdf|deleteConsolidatedPdf)\s*\(/);
  assert.match(source, /verifyOldPdfBytes\(observed\)/);
  assert.match(source, /consolidatedInvoiceSupersession\.create\(/);
});

test("each old invoice PDF and both bundle versions require matching stored bytes", () => {
  const bytes = Buffer.from("issued PDF bytes");
  const hash = createHash("sha256").update(bytes).digest("hex");
  for (const name of [...OCTOBER_TARGETS.map(row => row.number), "bundle-v1", "bundle-v2"]) {
    assert.doesNotThrow(() => assertStoredPdfMatches(bytes, bytes.length, hash), name);
    assert.throws(() => assertStoredPdfMatches(Buffer.from("changed"), bytes.length, hash), name);
    assert.throws(() => assertStoredPdfMatches(bytes, bytes.length + 1, hash), name);
  }
});
