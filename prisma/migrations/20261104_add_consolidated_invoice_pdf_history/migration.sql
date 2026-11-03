ALTER TABLE public."ConsolidatedInvoicePublication"
  DROP CONSTRAINT "ConsolidatedInvoicePublication_version_check";
ALTER TABLE public."ConsolidatedInvoicePublication"
  ADD CONSTRAINT "ConsolidatedInvoicePublication_version_check" CHECK ("version" >= 1);

CREATE TABLE public."ConsolidatedInvoicePdfHistory" (
  "id" SERIAL PRIMARY KEY,
  "consolidatedInvoiceId" INTEGER NOT NULL REFERENCES public."ConsolidatedInvoice"("id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL CHECK ("version" >= 1),
  "issuedDate" TIMESTAMP(3) NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL CHECK ("fileSize" > 0),
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsolidatedInvoicePdfHistory_bundle_version_key" UNIQUE ("consolidatedInvoiceId", "version")
);
ALTER TABLE public."ConsolidatedInvoicePdfHistory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ConsolidatedInvoicePdfHistory" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."ConsolidatedInvoicePdfHistory_id_seq" FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.reject_consolidated_invoice_pdf_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Consolidated invoice PDF history is immutable';
END;
$$;
CREATE TRIGGER "ConsolidatedInvoicePdfHistory_immutable"
BEFORE UPDATE OR DELETE OR TRUNCATE ON public."ConsolidatedInvoicePdfHistory"
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_consolidated_invoice_pdf_history_mutation();
