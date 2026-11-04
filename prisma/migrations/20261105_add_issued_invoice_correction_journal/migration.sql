CREATE TABLE "InvoiceCorrectionBatch" (
  "id" SERIAL PRIMARY KEY,
  "correctionKey" TEXT NOT NULL UNIQUE,
  "fingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'preparing',
  "oldBundleId" INTEGER NOT NULL UNIQUE REFERENCES "ConsolidatedInvoice"("id") ON DELETE RESTRICT,
  "newBundleId" INTEGER UNIQUE REFERENCES "ConsolidatedInvoice"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  CONSTRAINT "InvoiceCorrectionBatch_fixed_scope" CHECK ("correctionKey" = 'issued-b2b-2026-10-discount-20261105' AND "oldBundleId" = 1 AND "status" IN ('preparing', 'ready', 'activated') AND ("newBundleId" IS NULL OR "newBundleId" <> 1))
);
CREATE TABLE "InvoiceCorrectionMapping" (
  "id" SERIAL PRIMARY KEY,
  "batchId" INTEGER NOT NULL REFERENCES "InvoiceCorrectionBatch"("id") ON DELETE RESTRICT,
  "oldInvoiceId" INTEGER NOT NULL UNIQUE REFERENCES "Invoice"("id") ON DELETE RESTRICT,
  "newInvoiceId" INTEGER NOT NULL UNIQUE REFERENCES "Invoice"("id") ON DELETE RESTRICT,
  CONSTRAINT "InvoiceCorrectionMapping_fixed_scope" CHECK ("oldInvoiceId" IN (1, 3, 4, 5, 6, 7) AND "oldInvoiceId" <> "newInvoiceId")
);
CREATE INDEX "InvoiceCorrectionMapping_batchId_idx" ON "InvoiceCorrectionMapping"("batchId");
CREATE TABLE "ConsolidatedInvoiceSupersession" (
  "id" SERIAL PRIMARY KEY,
  "oldBundleId" INTEGER NOT NULL UNIQUE REFERENCES "ConsolidatedInvoice"("id") ON DELETE RESTRICT,
  "newBundleId" INTEGER NOT NULL UNIQUE REFERENCES "ConsolidatedInvoice"("id") ON DELETE RESTRICT,
  "correctionBatchId" INTEGER NOT NULL UNIQUE REFERENCES "InvoiceCorrectionBatch"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidatedInvoiceSupersession_fixed_scope" CHECK ("oldBundleId" = 1 AND "newBundleId" <> 1)
);
ALTER TABLE "InvoiceCorrectionBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceCorrectionMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsolidatedInvoiceSupersession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InvoiceCorrectionBatch", "InvoiceCorrectionMapping", "ConsolidatedInvoiceSupersession" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE "InvoiceCorrectionBatch_id_seq", "InvoiceCorrectionMapping_id_seq", "ConsolidatedInvoiceSupersession_id_seq" FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION reject_invoice_correction_audit_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Invoice correction audit rows are immutable';
END;
$$;
CREATE TRIGGER reject_invoice_correction_mapping_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON "InvoiceCorrectionMapping"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_invoice_correction_audit_mutation();
CREATE TRIGGER reject_consolidated_supersession_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON "ConsolidatedInvoiceSupersession"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_invoice_correction_audit_mutation();
