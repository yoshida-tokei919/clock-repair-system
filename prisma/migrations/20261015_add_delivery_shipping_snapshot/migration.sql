-- Task213B: existing delivery charges are unknown; never infer them from Estimate.
BEGIN;
ALTER TABLE public."DeliveryNote"
  ADD COLUMN "shippingCarrierCode" TEXT,
  ADD COLUMN "shippingServiceCode" TEXT,
  ADD COLUMN "shippingSize" INTEGER,
  ADD COLUMN "shippingCalculatedFee" INTEGER,
  ADD COLUMN "shippingFee" INTEGER,
  ADD CONSTRAINT "DeliveryNote_shippingSize_positive" CHECK ("shippingSize" IS NULL OR "shippingSize" > 0),
  ADD CONSTRAINT "DeliveryNote_shippingCalculatedFee_nonnegative" CHECK ("shippingCalculatedFee" IS NULL OR "shippingCalculatedFee" >= 0),
  ADD CONSTRAINT "DeliveryNote_shippingFee_nonnegative" CHECK ("shippingFee" IS NULL OR "shippingFee" >= 0);

ALTER TABLE public."Invoice"
  ADD COLUMN "shippingFeeAmount" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Invoice_shippingFeeAmount_nonnegative" CHECK ("shippingFeeAmount" >= 0);

ALTER TABLE public."InvoiceRepairSnapshot"
  ADD COLUMN "deliveryShippingFee" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "InvoiceRepairSnapshot_deliveryShippingFee_nonnegative" CHECK ("deliveryShippingFee" >= 0);

-- Existing consolidated sources remain valid with zero shipping. The original
-- constraint predates shipping-bearing invoice gross totals.
ALTER TABLE public."ConsolidatedInvoiceSource"
  ADD COLUMN "shippingFeeAmount" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "ConsolidatedInvoiceSource_shippingFeeAmount_nonnegative" CHECK ("shippingFeeAmount" >= 0);
ALTER TABLE public."ConsolidatedInvoiceSource"
  DROP CONSTRAINT "ConsolidatedInvoiceSource_gross_matches_parts",
  ADD CONSTRAINT "ConsolidatedInvoiceSource_gross_matches_parts" CHECK (
    "grossTotalAmount"::bigint = "totalAmount"::bigint + "taxAmount"::bigint + "shippingFeeAmount"::bigint
  );
COMMIT;
