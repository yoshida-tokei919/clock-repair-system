-- Additive migration: totalAmount remains the pre-tax subtotal.
-- Apply before deploying the new client/code. Old writers remain compatible.
BEGIN;
-- No zero default: an omitted value must reach the BEFORE INSERT trigger as NULL.
ALTER TABLE "Invoice" ADD COLUMN "grossTotalAmount" INTEGER;
UPDATE "Invoice" SET "grossTotalAmount" = "totalAmount" + "taxAmount";
ALTER TABLE "Invoice" ALTER COLUMN "grossTotalAmount" SET NOT NULL;

-- Old code omits the new column on INSERT. Capture its issued payable total too.
-- INSERT only: later Estimate/metadata updates must never recalculate this snapshot.
CREATE FUNCTION "set_invoice_gross_total_on_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."grossTotalAmount" IS NULL THEN
    NEW."grossTotalAmount" := NEW."totalAmount" + NEW."taxAmount";
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Invoice_gross_total_on_insert"
BEFORE INSERT ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION "set_invoice_gross_total_on_insert"();

-- No EstimateItem backfill: editable estimates cannot reconstruct issued details.
COMMIT;
