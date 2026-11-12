import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ConsolidatedBundle } from "./consolidated-invoice-publication";
import { assertConsolidatedSourceUnpaid, buildConsolidatedPdfData, consolidatedDeliveryNotePdfFileName, consolidatedDeliveryNoteRows, hasConsolidatedSourceSnapshotIntegrity, isConsolidatedDeliveryNotePdf, isConsolidatedNetDeliveryNotePdf, isCurrentConsolidatedPdf, newConsolidatedShareToken, validConsolidatedShareToken } from "./consolidated-invoice-publication";
import { consolidatedInvoiceDocumentData, renderConsolidatedInvoicePdf } from "./consolidated-invoice-pdf";
import { InvoiceDocument } from "@/components/pdf/InvoiceDocument";

function documentText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(documentText).join(" ");
  if (node && typeof node === "object" && "props" in node) return documentText((node as { props: { children?: unknown } }).props.children);
  return "";
}

const due = new Date("2026-12-31T00:00:00Z");
const fixture = {
  id: 1, createdAt: new Date("2026-11-03T00:00:00Z"), issueState: { issuedDate: new Date("2026-11-04T15:00:00Z") }, companyName: "架空グループ", billingName: "架空取引先",
  billingCompanyName: "請求先支店", billingZipCode: "1234567", billingAddress: "支店住所", billingPrefecture: null,
  billingCity: null, billingStreet: null, billingBuilding: null,
  grossTotalAmount: 82428,
  sources: [
    { id: 1, invoiceId: 11, invoiceNumber: "KI-001", sourceCustomerName: "架空A店", sourceCompanyName: null,
      totalAmount: 71500, taxAmount: 7150, shippingFeeAmount: 679, grossTotalAmount: 79329,
      deliveryNotes: [{ id: 1, slipNumber: "KD-001", deliveryNoteId: 1, issuedDate: due, repairCount: 6, subtotalAmount: 71500 }] },
    { id: 2, invoiceId: 12, invoiceNumber: "SI-001", sourceCustomerName: "架空B店", sourceCompanyName: null,
      totalAmount: 2200, taxAmount: 220, shippingFeeAmount: 679, grossTotalAmount: 3099,
      deliveryNotes: [{ id: 2, slipNumber: "SD-001", deliveryNoteId: 2, issuedDate: due, repairCount: 4, subtotalAmount: 2200 }] },
  ],
} as unknown as ConsolidatedBundle;

test("admin actions require frozen source integrity but ordinary payment status is separate", () => {
  const sources = fixture.sources.map((source, index) => ({ ...source,
    sourceCustomerId: index + 20, issuedDate: due,
    invoice: { id: source.invoiceId, invoiceNumber: source.invoiceNumber, customerId: index + 20,
      issuedDate: due, totalAmount: source.totalAmount, taxAmount: source.taxAmount,
      shippingFeeAmount: source.shippingFeeAmount, grossTotalAmount: source.grossTotalAmount, status: "paid" },
  }));
  const bundle = { grossTotalAmount: fixture.grossTotalAmount, sources };
  assert.equal(hasConsolidatedSourceSnapshotIntegrity(bundle), true);
  assert.equal(hasConsolidatedSourceSnapshotIntegrity({ ...bundle, grossTotalAmount: bundle.grossTotalAmount - 1 }), false);
  for (const changed of [
    { invoiceNumber: "other" }, { customerId: 999 }, { issuedDate: new Date(0) },
    { totalAmount: 0 }, { taxAmount: 0 }, { shippingFeeAmount: 1 }, { grossTotalAmount: 1 },
  ]) {
    assert.equal(hasConsolidatedSourceSnapshotIntegrity({ ...bundle, sources: [
      { ...sources[0], invoice: { ...sources[0].invoice, ...changed } }, sources[1],
    ] }), false);
  }
});

test("consolidated PDF totals use immutable source snapshots", () => {
  const data = buildConsolidatedPdfData(fixture, [due, due]);
  assert.equal(data.bundle.issueState?.issuedDate.toISOString(), "2026-11-04T15:00:00.000Z");
  assert.throws(() => buildConsolidatedPdfData({ ...fixture, issueState: null }, [due, due]));
  assert.equal(data.gross, 82428);
  assert.equal(data.subtotal, 73700);
  assert.equal(data.tax, 7370);
  assert.deepEqual(data.rows.map(row => [row.slipNumber, row.repairCount, row.amount, row.taxAmount, row.grossAmount]),
    [["KD-001", 6, 72179, 7150, 79329], ["SD-001", 4, 2879, 220, 3099]]);
  assert.equal(data.rows.reduce((sum, row) => sum + row.amount, 0), data.gross - data.tax);
  assert.equal(data.dueDate, "2026-12-31");
  assert.throws(() => buildConsolidatedPdfData({ ...fixture, grossTotalAmount: 82427 }, [due, due]));
  assert.throws(() => buildConsolidatedPdfData({ ...fixture, sources: [{ ...fixture.sources[0], taxAmount: 0 }, fixture.sources[1]] }, [due, due]));
});

test("grouped PDF applies a frozen source credit once after gross", () => {
  const credited = { ...fixture, sources: [
    { ...fixture.sources[0], offsetCreditAmount: 14014, offsetCreditReference: "OLD-T027" },
    { ...fixture.sources[1], offsetCreditAmount: 0, offsetCreditReference: null },
  ] } as ConsolidatedBundle;
  const data = buildConsolidatedPdfData(credited, [due, due]);
  const pdfData = consolidatedInvoiceDocumentData(data);
  assert.equal(data.gross, 82428);
  assert.equal(data.offsetCreditAmount, 14014);
  assert.equal(pdfData.grossTotalAmount, 82428);
  assert.deepEqual(pdfData.historicalRefundCredits, [{ amount: 14014, reference: "架空A店 / OLD-T027" }]);
  assert.match(documentText(InvoiceDocument({ data: pdfData })), /68,414/);
});

test("fully credited B2B PDF says no transfer is needed and omits bank details", () => {
  const credited = { ...fixture, sources: fixture.sources.map(source => ({ ...source,
    offsetCreditAmount: source.grossTotalAmount, offsetCreditReference: `OLD-${source.invoiceId}` })) } as ConsolidatedBundle;
  const pdfData = consolidatedInvoiceDocumentData(buildConsolidatedPdfData(credited, [due, due]));
  const content = documentText(InvoiceDocument({ data: pdfData }));
  assert.match(content, /お振込は不要です/);
  assert.doesNotMatch(content, /三井住友銀行|3602468/);
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

test("net PDF filenames distinguish new public breakdowns from saved legacy PDFs", () => {
  assert.equal(consolidatedDeliveryNotePdfFileName(1), "consolidated_invoice_1_net_delivery_notes.pdf");
  assert.equal(isConsolidatedNetDeliveryNotePdf(1, "consolidated_invoice_1_net_delivery_notes.pdf"), true);
  assert.equal(isConsolidatedNetDeliveryNotePdf(1, "consolidated_invoice_1_v2_net_delivery_notes.pdf"), true);
  assert.equal(isConsolidatedNetDeliveryNotePdf(1, "consolidated_invoice_1_delivery_notes.pdf"), false);
  assert.equal(isConsolidatedDeliveryNotePdf(1, "consolidated_invoice_1_delivery_notes.pdf"), true);
  assert.equal(isConsolidatedDeliveryNotePdf(1, "consolidated_invoice_1_v2_delivery_notes.pdf"), true);
  assert.equal(isConsolidatedDeliveryNotePdf(1, "consolidated_invoice_1.pdf"), false);
  assert.equal(isConsolidatedDeliveryNotePdf(1, "consolidated_invoice_2_delivery_notes.pdf"), false);
  const publicPage = readFileSync("src/app/(private)/customer/consolidated-invoices/[token]/page.tsx", "utf8");
  assert.match(publicPage, /const newFormat = isConsolidatedNetDeliveryNotePdf\(bundle\.id, publication\.fileName\)/);
  assert.match(publicPage, /if \(newFormat\) \{/);
  const reissue = readFileSync("src/app/api/invoices/consolidated/[id]/pdf/reissue/route.ts", "utf8");
  assert.match(reissue, /const fileName = `consolidated_invoice_\$\{id\}_v\$\{version\}_net_delivery_notes\.pdf`/);
  assert.match(reissue, /storageKey: previous\.storageKey!, fileName: previous\.fileName/);
});

test("admin PDF preview uses the same source and delivery note ordering as publication", () => {
  const preview = readFileSync("src/app/api/invoices/consolidated/[id]/pdf/preview/route.ts", "utf8");
  assert.match(preview, /sources: \{ orderBy: \{ id: "asc" \}, include: \{ deliveryNotes: \{ orderBy: \{ id: "asc" \} \}/);
  assert.match(preview, /buildConsolidatedPdfData\(bundle, bundle\.sources\.map\(source => source\.invoice\.paymentDueDate\)\)/);
  assert.match(preview, /renderConsolidatedInvoicePdf\(data\)/);
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
  const data = buildConsolidatedPdfData(fixture, [due, due]);
  const document = consolidatedInvoiceDocumentData(data);
  assert.equal(document.customer.name, "架空グループ");
  assert.equal(document.customer.address, undefined);
  assert.equal(document.invoiceNumber, "CI-000001");
  assert.equal(document.shippingFeeAmount, 0);
  assert.equal(document.dueDate, "2026/12/31");
  assert.match(document.bankInfo!, /3602468/);
  assert.equal(document.pricingTaxMode, "EXCLUSIVE");
  assert.equal(document.taxSummaryLabel, undefined);
  assert.deepEqual(document.items.map(item => [item.description, item.amount]), [["6点", 72179], ["4点", 2879]]);
  assert.equal(document.subtotalAmount, document.items.reduce((sum, row) => sum + row.amount, 0));
  assert.equal(document.grossTotalAmount, document.subtotalAmount! + document.taxAmount!);
  const renderedText = documentText(InvoiceDocument({ data: document }));
  assert.match(renderedText, /小計/);
  assert.match(renderedText, /消費税 \(10%\)/);
  assert.match(renderedText, /合計請求額/);
  assert.doesNotMatch(renderedText, /金額（税込）|内消費税|修理 6点/);
  assert.equal(JSON.stringify(document).includes("KI-001"), false);
  assert.equal(JSON.stringify(document).includes("架空A店"), false);
  assert.equal(JSON.stringify(document).includes("請求先支店"), false);
  assert.equal(JSON.stringify(document).includes("支店住所"), false);
  assert.equal(document.items.some(item => item.description.includes("送料")), false);
  assert.throws(() => consolidatedInvoiceDocumentData({ ...data, bundle: { ...fixture, companyName: " " } }));
  assert.equal(consolidatedInvoiceDocumentData({ ...data, bundle: { ...fixture, companyName: "架空グループ 御中" } }).customer.name, "架空グループ");
  const buffer = await renderConsolidatedInvoicePdf(data);
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  assert.ok(buffer.length > 1000);
});

test("split-note rounding allocates the exact sourced gross and rejects incomplete notes", () => {
  const split = { ...fixture, sources: [
    { ...fixture.sources[0], deliveryNotes: [
      { ...fixture.sources[0].deliveryNotes[0], subtotalAmount: 1 },
      { ...fixture.sources[0].deliveryNotes[0], id: 3, slipNumber: "KD-002", subtotalAmount: 71499 },
    ] }, fixture.sources[1],
  ] } as ConsolidatedBundle;
  const rows = consolidatedDeliveryNoteRows(split);
  assert.deepEqual(rows.map(row => [row.amount, row.taxAmount, row.grossAmount]), [[1, 0, 1], [72178, 7150, 79328], [2879, 220, 3099]]);
  const round = consolidatedDeliveryNoteRows({ grossTotalAmount: 3109, sources: [
    { totalAmount: 3, taxAmount: 6, shippingFeeAmount: 1, grossTotalAmount: 10,
      deliveryNotes: [1, 2, 3].map(index => ({ slipNumber: `R-${index}`, issuedDate: due, repairCount: 1, subtotalAmount: 1 })) },
    fixture.sources[1],
  ] });
  assert.deepEqual(round.map(row => [row.amount, row.taxAmount, row.grossAmount]), [[1, 2, 3], [1, 2, 3], [2, 2, 4], [2879, 220, 3099]]);
  const zeroNet = consolidatedDeliveryNoteRows({ grossTotalAmount: 3102, sources: [
    { totalAmount: 0, taxAmount: 2, shippingFeeAmount: 1, grossTotalAmount: 3,
      deliveryNotes: [1, 2].map(index => ({ slipNumber: `Z-${index}`, issuedDate: due, repairCount: 1, subtotalAmount: 0 })) },
    fixture.sources[1],
  ] });
  assert.deepEqual(zeroNet.slice(0, 2).map(row => [row.amount, row.taxAmount, row.grossAmount]), [[0, 1, 1], [1, 1, 2]]);
  for (const invalid of [
    { slipNumber: null }, { issuedDate: null }, { repairCount: 0 }, { subtotalAmount: null }, { subtotalAmount: 71499 },
  ]) {
    assert.throws(() => consolidatedDeliveryNoteRows({ ...fixture, sources: [
      { ...fixture.sources[0], deliveryNotes: [{ ...fixture.sources[0].deliveryNotes[0], ...invalid }] }, fixture.sources[1],
    ] }));
  }
  for (const invalid of [
    { taxAmount: -1 }, { shippingFeeAmount: -1 }, { totalAmount: Number.MAX_SAFE_INTEGER + 1 },
    { grossTotalAmount: fixture.sources[0].grossTotalAmount - 1 },
  ]) assert.throws(() => consolidatedDeliveryNoteRows({ ...fixture, sources: [
    { ...fixture.sources[0], ...invalid }, fixture.sources[1],
  ] }));
});
