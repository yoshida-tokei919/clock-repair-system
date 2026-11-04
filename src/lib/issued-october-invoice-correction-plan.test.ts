import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { archivedOctoberNumber, assertCorrectionNotStarted, assertExpectedCorrectionNumber, assertNoOctoberDeliveryOrPayment, assertStoredPdfMatches, correctionBundlePdfMetadata, OCTOBER_TARGETS, pendingOctoberNumber, verifiedOctoberAmounts } from "./issued-october-invoice-correction-plan";

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

test("the six canonical numbers transfer through deterministic unique staging and archive labels", () => {
  for (const target of OCTOBER_TARGETS) {
    assert.equal(pendingOctoberNumber(target.number), `CORR-PENDING-${target.number}`);
    assert.equal(archivedOctoberNumber(target.number), `ARCHIVED-202610-${target.number}`);
    assert.doesNotThrow(() => assertExpectedCorrectionNumber(1, target.number, false, false));
    assert.throws(() => assertExpectedCorrectionNumber(2, target.number, false, false));
    assert.throws(() => assertExpectedCorrectionNumber(1, target.number, true, false));
    assert.throws(() => assertExpectedCorrectionNumber(1, target.number, false, true));
  }
  assert.throws(() => assertExpectedCorrectionNumber(1, "NI-001", false, false));
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
  assert.match(source, /invoiceNumber: archivedOctoberNumber\(target.number\)/);
  assert.match(source, /invoiceNumber: target.number/);
  assert.match(source, /fileName: `invoice_\$\{target.number\}\.pdf`/);
  assert.match(source, /renderInvoicePdfBuffer\(correctionInvoicePdfData\(invoice, target.number\)\)/);
  assert.match(source, /sourceNumbers = bundle.sources.flatMap\(source => source.deliveryNotes.map\(\(\) => source.invoiceNumber\)\)/);
  assert.match(source, /description: `\$\{item.description\} \/ \$\{sourceNumbers\[index\]\}`/);
  assert.doesNotMatch(source, /customer\.update\(/);
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

test("staged bundle metadata is either absent or complete", () => {
  const empty = { bundlePdfStorageKey: null, bundlePdfHash: null, bundlePdfFileSize: null };
  assert.equal(correctionBundlePdfMetadata(empty), null);
  const complete = { bundlePdfStorageKey: "private/bundle.pdf", bundlePdfHash: "a".repeat(64), bundlePdfFileSize: 10 };
  assert.deepEqual(correctionBundlePdfMetadata(complete), { storageKey: complete.bundlePdfStorageKey,
    hash: complete.bundlePdfHash, fileSize: complete.bundlePdfFileSize });
  for (const broken of [{ bundlePdfStorageKey: null }, { bundlePdfHash: null }, { bundlePdfFileSize: null },
    { bundlePdfStorageKey: "" }, { bundlePdfHash: "A".repeat(64) }, { bundlePdfFileSize: 0 }]) {
    assert.throws(() => correctionBundlePdfMetadata({ ...complete, ...broken }));
  }
});

test("stage stores bundle metadata on batch and activation publishes all fields atomically", () => {
  const source = readFileSync(new URL("./issued-october-invoice-correction.ts", import.meta.url), "utf8");
  const stage = source.slice(source.indexOf("export async function preparePdfBytes"), source.indexOf("export async function activateOctoberCorrection"));
  const activation = source.slice(source.indexOf("export async function activateOctoberCorrection"));
  assert.doesNotMatch(stage, /consolidatedInvoicePublication\.update/);
  assert.match(stage, /bundlePdfStorageKey: null, bundlePdfHash: null, bundlePdfFileSize: null/);
  assert.match(stage, /bundlePdfStorageKey: key, bundlePdfHash: calculateInvoicePdfHash\(bytes\), bundlePdfFileSize: bytes.length/);
  assert.match(stage, /publication\.publishedAt !== null/);
  assert.match(activation, /batch\.bundlePdfStorageKey !== stagedBundlePdfMeta\.storageKey/);
  assert.match(activation, /pub\.publishedAt !== null/);
  assert.match(activation, /status: "current", storageKey: stagedBundlePdfMeta\.storageKey, hash: stagedBundlePdfMeta\.hash,\s*fileSize: stagedBundlePdfMeta\.fileSize, publishedAt: new Date\(\)/);
  const sql = readFileSync(new URL("../../prisma/migrations/20261105_add_correction_batch_bundle_pdf_metadata/migration.sql", import.meta.url), "utf8");
  for (const column of ["bundlePdfStorageKey", "bundlePdfHash", "bundlePdfFileSize"]) assert.match(sql, new RegExp(`ADD COLUMN "${column}"`));
  assert.match(sql, /InvoiceCorrectionBatch_bundle_pdf_metadata_complete/);
  assert.match(sql, /InvoiceCorrectionBatch_ready_bundle_pdf_metadata/);
  assert.match(sql, /'ready', 'activated'/);
});
