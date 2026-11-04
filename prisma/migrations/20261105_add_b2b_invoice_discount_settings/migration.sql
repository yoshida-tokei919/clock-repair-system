ALTER TABLE "Customer" ADD COLUMN "invoiceDiscountOverrideBps" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "discountBasisAmount" INTEGER,
  ADD COLUMN "discountRateBps" INTEGER,
  ADD COLUMN "discountAmount" INTEGER;
ALTER TABLE "ConsolidatedInvoiceSource" ADD COLUMN "discountBasisAmount" INTEGER,
  ADD COLUMN "discountRateBps" INTEGER,
  ADD COLUMN "discountAmount" INTEGER;

CREATE TABLE "B2BInvoiceDiscountSetting" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "standardRateBps" INTEGER NOT NULL DEFAULT 300,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "B2BInvoiceDiscountSetting_singleton" CHECK ("id" = 1),
  CONSTRAINT "B2BInvoiceDiscountSetting_rate" CHECK ("standardRateBps" BETWEEN 0 AND 10000)
);
ALTER TABLE "B2BInvoiceDiscountSetting" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "B2BInvoiceDiscountSetting" FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO "B2BInvoiceDiscountSetting" ("id", "standardRateBps") VALUES (1, 300);

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_invoiceDiscountOverrideBps_range"
  CHECK ("invoiceDiscountOverrideBps" IS NULL OR "invoiceDiscountOverrideBps" BETWEEN 0 AND 10000);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_discount_snapshot_complete"
  CHECK (("discountBasisAmount" IS NULL AND "discountRateBps" IS NULL AND "discountAmount" IS NULL)
    OR ("discountBasisAmount" IS NOT NULL AND "discountRateBps" IS NOT NULL AND "discountAmount" IS NOT NULL
      AND "discountBasisAmount" >= 0 AND "discountRateBps" BETWEEN 0 AND 10000
      AND "discountAmount" >= 0 AND "discountAmount" <= "discountBasisAmount"
      AND "totalAmount" = "discountBasisAmount" - "discountAmount"));
ALTER TABLE "ConsolidatedInvoiceSource" ADD CONSTRAINT "ConsolidatedInvoiceSource_discount_snapshot_complete"
  CHECK (("discountBasisAmount" IS NULL AND "discountRateBps" IS NULL AND "discountAmount" IS NULL)
    OR ("discountBasisAmount" IS NOT NULL AND "discountRateBps" IS NOT NULL AND "discountAmount" IS NOT NULL
      AND "discountBasisAmount" >= 0 AND "discountRateBps" BETWEEN 0 AND 10000
      AND "discountAmount" >= 0 AND "discountAmount" <= "discountBasisAmount"
      AND "totalAmount" = "discountBasisAmount" - "discountAmount"));
