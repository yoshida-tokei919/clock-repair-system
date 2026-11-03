import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { buildConsolidatedPdfData, isConsolidatedDeliveryNotePdf, type ConsolidatedBundle } from "./consolidated-invoice-publication";
import { parseIssuedDate } from "./document-issued-date";

test("reissue changes the rendered date while preserving sourced delivery amounts", () => {
  const oldDate = parseIssuedDate("2026-11-04");
  const newDate = parseIssuedDate("2026-11-05");
  const noteDate = parseIssuedDate("2026-10-31");
  const bundle = { id: 1, grossTotalAmount: 82428, issueState: { issuedDate: oldDate }, sources: [
    { totalAmount: 71500, taxAmount: 7150, shippingFeeAmount: 679, grossTotalAmount: 79329,
      deliveryNotes: [{ slipNumber: "KD-001", issuedDate: noteDate, repairCount: 6, subtotalAmount: 71500 }] },
    { totalAmount: 2200, taxAmount: 220, shippingFeeAmount: 679, grossTotalAmount: 3099,
      deliveryNotes: [{ slipNumber: "SD-001", issuedDate: noteDate, repairCount: 4, subtotalAmount: 2200 }] },
  ] } as ConsolidatedBundle;
  const revised = { ...bundle, issueState: { ...bundle.issueState!, issuedDate: newDate } };
  const data = buildConsolidatedPdfData(revised, [null, null]);
  assert.equal(bundle.issueState!.issuedDate.getTime(), oldDate.getTime());
  assert.equal(data.bundle.issueState!.issuedDate.getTime(), newDate.getTime());
  assert.deepEqual(data.rows.map(row => [row.slipNumber, row.amount]), [["KD-001", 72179], ["SD-001", 2879]]);
  assert.equal(data.gross, 82428);
  assert.equal(isConsolidatedDeliveryNotePdf(1, "consolidated_invoice_1_v2_delivery_notes.pdf"), true);
  assert.equal(isConsolidatedDeliveryNotePdf(1, "consolidated_invoice_1_v10_delivery_notes.pdf"), true);
});

test("PDF history migration is server-only, uniquely versioned, and immutable", () => {
  const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261104_add_consolidated_invoice_pdf_history/migration.sql"), "utf8");
  assert.match(sql, /ON DELETE RESTRICT/);
  assert.match(sql, /UNIQUE \("consolidatedInvoiceId", "version"\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\."ConsolidatedInvoicePdfHistory" FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /BEFORE UPDATE OR DELETE OR TRUNCATE ON public\."ConsolidatedInvoicePdfHistory"\s+FOR EACH STATEMENT/);
  assert.doesNotMatch(sql, /\bGRANT\b/);
});

test("reissue permits an unchanged date but checks frozen source identity", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/invoices/consolidated/[id]/pdf/reissue/route.ts"), "utf8");
  assert.doesNotMatch(route, /issuedDate\.getTime\(\) === issuedDate\.getTime\(\)/);
  assert.match(route, /invoice\.invoiceNumber !== source\.invoiceNumber/);
  assert.match(route, /invoice\.customerId !== source\.sourceCustomerId/);
  assert.match(route, /consolidatedInvoicePdfHistory\.create/);
  assert.match(route, /findFirst\(\{ where: \{ storageKey \}, select: \{ id: true \} \}\)/);
});

test("schema unique name matches migration and admin preview is legacy-only", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const page = readFileSync(join(process.cwd(), "src/app/(private)/documents/consolidated-invoice/[id]/page.tsx"), "utf8");
  assert.match(schema, /@@unique\(\[consolidatedInvoiceId, version\], map: "ConsolidatedInvoicePdfHistory_bundle_version_key"\)/);
  assert.match(page, /pdfReady && rows && !isConsolidatedNetDeliveryNotePdf\(id, bundle\.publication!\.fileName\)/);
});
