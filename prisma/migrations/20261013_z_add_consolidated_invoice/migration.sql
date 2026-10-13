-- Task207C. Historical, server-only bundles of existing store invoices.
CREATE TABLE public."ConsolidatedInvoice" (
  "id" SERIAL PRIMARY KEY,
  -- Historical ID snapshot: the live B2BCompany may later be dissolved.
  "companyId" INTEGER NOT NULL,
  "billingCustomerId" INTEGER NOT NULL REFERENCES public."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "companyName" TEXT NOT NULL,
  "billingName" TEXT NOT NULL,
  "billingCompanyName" TEXT,
  "billingZipCode" TEXT,
  "billingPrefecture" TEXT,
  "billingCity" TEXT,
  "billingStreet" TEXT,
  "billingBuilding" TEXT,
  "billingAddress" TEXT,
  "billingPhone" TEXT,
  "billingEmail" TEXT,
  "grossTotalAmount" INTEGER NOT NULL CHECK ("grossTotalAmount" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ConsolidatedInvoice_companyId_createdAt_idx" ON public."ConsolidatedInvoice"("companyId", "createdAt");

CREATE TABLE public."ConsolidatedInvoiceSource" (
  "id" SERIAL PRIMARY KEY,
  "consolidatedInvoiceId" INTEGER NOT NULL REFERENCES public."ConsolidatedInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoiceId" INTEGER NOT NULL UNIQUE REFERENCES public."Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoiceNumber" TEXT NOT NULL,
  "sourceCustomerId" INTEGER NOT NULL,
  "sourceCustomerName" TEXT NOT NULL,
  "sourceCompanyName" TEXT,
  "totalAmount" INTEGER NOT NULL CHECK ("totalAmount" >= 0),
  "taxAmount" INTEGER NOT NULL CHECK ("taxAmount" >= 0),
  "grossTotalAmount" INTEGER NOT NULL CHECK ("grossTotalAmount" >= 0),
  CONSTRAINT "ConsolidatedInvoiceSource_gross_matches_parts" CHECK (
    "grossTotalAmount"::bigint = "totalAmount"::bigint + "taxAmount"::bigint
  ),
  "issuedDate" TIMESTAMP(3) NOT NULL
);

CREATE TABLE public."ConsolidatedInvoiceDeliveryNote" (
  "id" SERIAL PRIMARY KEY,
  "sourceId" INTEGER NOT NULL REFERENCES public."ConsolidatedInvoiceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "deliveryNoteId" INTEGER,
  "slipNumber" TEXT,
  "issuedDate" TIMESTAMP(3),
  "repairCount" INTEGER NOT NULL CHECK ("repairCount" > 0),
  "subtotalAmount" INTEGER CHECK ("subtotalAmount" IS NULL OR "subtotalAmount" >= 0)
);
CREATE INDEX "ConsolidatedInvoiceDeliveryNote_sourceId_idx" ON public."ConsolidatedInvoiceDeliveryNote"("sourceId");

-- Creation-time audit rows cannot be changed or removed after insertion.
CREATE FUNCTION public."reject_consolidated_invoice_mutation"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Consolidated invoice audit rows are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "ConsolidatedInvoice_immutable"
BEFORE UPDATE OR DELETE OR TRUNCATE ON public."ConsolidatedInvoice"
FOR EACH STATEMENT EXECUTE FUNCTION public."reject_consolidated_invoice_mutation"();
CREATE TRIGGER "ConsolidatedInvoiceSource_immutable"
BEFORE UPDATE OR DELETE OR TRUNCATE ON public."ConsolidatedInvoiceSource"
FOR EACH STATEMENT EXECUTE FUNCTION public."reject_consolidated_invoice_mutation"();
CREATE TRIGGER "ConsolidatedInvoiceDeliveryNote_immutable"
BEFORE UPDATE OR DELETE OR TRUNCATE ON public."ConsolidatedInvoiceDeliveryNote"
FOR EACH STATEMENT EXECUTE FUNCTION public."reject_consolidated_invoice_mutation"();

-- Both parent and child INSERTs queue this check. Deferred execution sees the
-- final nested-create state and rejects incomplete bundles from direct SQL too.
CREATE FUNCTION public."validate_consolidated_invoice_total"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  bundle_id integer;
  source_count bigint;
  source_total bigint;
  bundle_total integer;
BEGIN
  IF TG_TABLE_NAME = 'ConsolidatedInvoice' THEN
    bundle_id := NEW."id";
  ELSE
    bundle_id := NEW."consolidatedInvoiceId";
  END IF;

  SELECT "grossTotalAmount" INTO STRICT bundle_total
  FROM public."ConsolidatedInvoice" WHERE "id" = bundle_id;
  SELECT count(*), COALESCE(sum("grossTotalAmount"::bigint), 0)
    INTO source_count, source_total
  FROM public."ConsolidatedInvoiceSource" WHERE "consolidatedInvoiceId" = bundle_id;
  IF source_count < 2 OR source_total <> bundle_total::bigint THEN
    RAISE EXCEPTION 'Consolidated invoice % requires at least two sources with matching gross total', bundle_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "ConsolidatedInvoice_validate_total"
AFTER INSERT ON public."ConsolidatedInvoice"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public."validate_consolidated_invoice_total"();
CREATE CONSTRAINT TRIGGER "ConsolidatedInvoiceSource_validate_total"
AFTER INSERT ON public."ConsolidatedInvoiceSource"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public."validate_consolidated_invoice_total"();
REVOKE ALL ON FUNCTION public."reject_consolidated_invoice_mutation"(), public."validate_consolidated_invoice_total"()
  FROM PUBLIC, anon, authenticated, service_role;

-- Access is through authenticated Next.js/Prisma only; Data API roles receive no grants.
ALTER TABLE public."ConsolidatedInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ConsolidatedInvoiceSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ConsolidatedInvoiceDeliveryNote" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ConsolidatedInvoice", public."ConsolidatedInvoiceSource", public."ConsolidatedInvoiceDeliveryNote" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."ConsolidatedInvoice_id_seq", public."ConsolidatedInvoiceSource_id_seq", public."ConsolidatedInvoiceDeliveryNote_id_seq" FROM PUBLIC, anon, authenticated, service_role;
