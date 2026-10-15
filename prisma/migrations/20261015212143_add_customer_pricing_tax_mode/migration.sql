-- Existing rows and writers remain tax-exclusive. No table is created, so no Data API GRANT is needed.
ALTER TABLE "Customer" ADD COLUMN "pricingTaxMode" TEXT NOT NULL DEFAULT 'EXCLUSIVE';
ALTER TABLE "Estimate" ADD COLUMN "pricingTaxMode" TEXT NOT NULL DEFAULT 'EXCLUSIVE';
ALTER TABLE "EstimateDocument" ADD COLUMN "pricingTaxMode" TEXT NOT NULL DEFAULT 'EXCLUSIVE';
ALTER TABLE "DeliveryNote" ADD COLUMN "pricingTaxMode" TEXT NOT NULL DEFAULT 'EXCLUSIVE';
ALTER TABLE "Invoice" ADD COLUMN "pricingTaxMode" TEXT NOT NULL DEFAULT 'EXCLUSIVE';
ALTER TABLE "InvoiceRepairSnapshot" ADD COLUMN "grossAmount" INTEGER;

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_pricingTaxMode_check"
  CHECK ("pricingTaxMode" IN ('EXCLUSIVE', 'INCLUSIVE') AND ("type" <> 'individual' OR "pricingTaxMode" = 'EXCLUSIVE'));
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_pricingTaxMode_check" CHECK ("pricingTaxMode" IN ('EXCLUSIVE', 'INCLUSIVE'));
ALTER TABLE "EstimateDocument" ADD CONSTRAINT "EstimateDocument_pricingTaxMode_check" CHECK ("pricingTaxMode" IN ('EXCLUSIVE', 'INCLUSIVE'));
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_pricingTaxMode_check" CHECK ("pricingTaxMode" IN ('EXCLUSIVE', 'INCLUSIVE'));
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_pricingTaxMode_check" CHECK ("pricingTaxMode" IN ('EXCLUSIVE', 'INCLUSIVE'));
ALTER TABLE "InvoiceRepairSnapshot" ADD CONSTRAINT "InvoiceRepairSnapshot_grossAmount_check"
  CHECK ("grossAmount" IS NULL OR "grossAmount" >= 0);
