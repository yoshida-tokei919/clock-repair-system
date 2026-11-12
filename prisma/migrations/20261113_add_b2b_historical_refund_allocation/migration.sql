BEGIN;
CREATE TABLE public."B2BHistoricalRefundAllocation" (
  "id" SERIAL PRIMARY KEY,
  "refundId" INTEGER NOT NULL REFERENCES public."B2BHistoricalRefund"("id") ON DELETE RESTRICT,
  "invoiceId" INTEGER NOT NULL REFERENCES public."Invoice"("id") ON DELETE RESTRICT,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT,
  CONSTRAINT "B2BHistoricalRefundAllocation_positive" CHECK ("amount" > 0),
  CONSTRAINT "B2BHistoricalRefundAllocation_status" CHECK (
    ("status" = 'ACTIVE' AND "voidedAt" IS NULL AND "voidReason" IS NULL) OR
    ("status" = 'VOID' AND "voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL AND length(btrim("voidReason")) > 0)
  ),
  CONSTRAINT "B2BHistoricalRefundAllocation_refund_invoice_key" UNIQUE ("refundId", "invoiceId")
);
CREATE INDEX "B2BHistoricalRefundAllocation_invoiceId_status_idx" ON public."B2BHistoricalRefundAllocation"("invoiceId", "status");
CREATE INDEX "B2BHistoricalRefundAllocation_refundId_status_idx" ON public."B2BHistoricalRefundAllocation"("refundId", "status");
ALTER TABLE public."ConsolidatedInvoiceSource"
  ADD COLUMN "offsetCreditAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "offsetCreditReference" TEXT;
ALTER TABLE public."ConsolidatedInvoiceSource"
  ADD CONSTRAINT "ConsolidatedInvoiceSource_offset_credit" CHECK ("offsetCreditAmount" >= 0 AND "offsetCreditAmount" <= "grossTotalAmount");
CREATE FUNCTION public."check_b2b_historical_refund_allocation"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  refund_row RECORD;
  invoice_row RECORD;
  already_refunded BIGINT;
  already_invoiced BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."refundId" <> OLD."refundId" OR NEW."invoiceId" <> OLD."invoiceId" OR NEW."amount" <> OLD."amount"
       OR OLD."status" <> 'ACTIVE' OR NEW."status" <> 'VOID' THEN
      RAISE EXCEPTION 'historical refund allocation is immutable';
    END IF;
    SELECT "currentPdfFileId", "sentAt" INTO invoice_row FROM public."Invoice"
      WHERE "id" = NEW."invoiceId" FOR UPDATE;
    IF invoice_row."currentPdfFileId" IS NOT NULL OR invoice_row."sentAt" IS NOT NULL OR
       EXISTS (SELECT 1 FROM public."ConsolidatedInvoiceSource" WHERE "invoiceId" = NEW."invoiceId") OR
       EXISTS (SELECT 1 FROM public."PaymentAllocation" WHERE "invoiceId" = NEW."invoiceId") THEN
      RAISE EXCEPTION 'published or paid credit cannot be voided';
    END IF;
    RETURN NEW;
  END IF;
  SELECT r."customerId", r."amount", r."method", r."originalSaleSource", r."status", c."type" AS "customerType"
    INTO refund_row FROM public."B2BHistoricalRefund" r
    JOIN public."Customer" c ON c."id" = r."customerId"
    WHERE r."id" = NEW."refundId" FOR UPDATE OF r;
  SELECT "customerId", "grossTotalAmount", "status", "currentPdfFileId", "sentAt",
         "lineSendRetryKey", "lineSendStartedAt" INTO invoice_row FROM public."Invoice"
    WHERE "id" = NEW."invoiceId" FOR UPDATE;
  IF refund_row."customerId" IS NULL OR invoice_row."customerId" IS NULL OR
     refund_row."customerId" <> invoice_row."customerId" OR refund_row."customerType" <> 'business' OR
     refund_row."method" <> 'OFFSET' OR refund_row."originalSaleSource" <> 'LEGACY' OR
     refund_row."status" <> 'AWAITING_OFFSET' OR invoice_row."status" <> 'issued' OR
     invoice_row."currentPdfFileId" IS NOT NULL OR invoice_row."sentAt" IS NOT NULL OR
     invoice_row."lineSendRetryKey" IS NOT NULL OR invoice_row."lineSendStartedAt" IS NOT NULL OR
     EXISTS (SELECT 1 FROM public."InvoicePdfFile" WHERE "invoiceId" = NEW."invoiceId") OR
     EXISTS (SELECT 1 FROM public."PaymentAllocation" WHERE "invoiceId" = NEW."invoiceId") OR
     EXISTS (SELECT 1 FROM public."ConsolidatedInvoiceSource" WHERE "invoiceId" = NEW."invoiceId") THEN
    RAISE EXCEPTION 'historical refund is ineligible for this invoice';
  END IF;
  SELECT COALESCE(SUM("amount"), 0) INTO already_refunded
    FROM public."B2BHistoricalRefundAllocation" WHERE "refundId" = NEW."refundId" AND "status" = 'ACTIVE';
  SELECT COALESCE(SUM("amount"), 0) INTO already_invoiced
    FROM public."B2BHistoricalRefundAllocation" WHERE "invoiceId" = NEW."invoiceId" AND "status" = 'ACTIVE';
  IF already_refunded + NEW."amount" > refund_row."amount" OR
     already_invoiced + NEW."amount" > invoice_row."grossTotalAmount" THEN
    RAISE EXCEPTION 'historical refund allocation exceeds available amount';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "B2BHistoricalRefundAllocation_guard"
  BEFORE INSERT OR UPDATE ON public."B2BHistoricalRefundAllocation"
  FOR EACH ROW EXECUTE FUNCTION public."check_b2b_historical_refund_allocation"();
CREATE FUNCTION public."prevent_b2b_historical_refund_allocation_delete"() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'historical refund allocation cannot be deleted'; END $$;
CREATE TRIGGER "B2BHistoricalRefundAllocation_no_delete"
  BEFORE DELETE ON public."B2BHistoricalRefundAllocation"
  FOR EACH ROW EXECUTE FUNCTION public."prevent_b2b_historical_refund_allocation_delete"();
CREATE FUNCTION public."guard_allocated_historical_refund"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE active_amount BIGINT;
BEGIN
  SELECT COALESCE(SUM("amount"), 0) INTO active_amount
    FROM public."B2BHistoricalRefundAllocation" WHERE "refundId" = OLD."id" AND "status" = 'ACTIVE';
  IF active_amount > 0 AND (NEW."customerId" <> OLD."customerId" OR NEW."method" <> 'OFFSET' OR
     NEW."originalSaleSource" <> 'LEGACY' OR NEW."status" NOT IN ('AWAITING_OFFSET', 'OFFSET_SETTLED') OR
     NEW."amount" < active_amount OR (NEW."status" = 'OFFSET_SETTLED' AND NEW."amount" <> active_amount)) THEN
    RAISE EXCEPTION 'allocated historical refund cannot be invalidated';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "B2BHistoricalRefund_allocation_guard"
  BEFORE UPDATE ON public."B2BHistoricalRefund"
  FOR EACH ROW EXECUTE FUNCTION public."guard_allocated_historical_refund"();
REVOKE ALL ON FUNCTION public."check_b2b_historical_refund_allocation"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."prevent_b2b_historical_refund_allocation_delete"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public."guard_allocated_historical_refund"() FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public."B2BHistoricalRefundAllocation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."B2BHistoricalRefundAllocation" FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."B2BHistoricalRefundAllocation_id_seq" FROM anon, authenticated, service_role;
COMMIT;
