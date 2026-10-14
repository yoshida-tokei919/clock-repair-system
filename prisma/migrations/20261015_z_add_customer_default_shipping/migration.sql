-- Task213C1: optional defaults belong to each business Customer (store).
-- Existing customers remain unconfigured; no delivery note is backfilled.
BEGIN;
ALTER TABLE public."Customer"
  ADD COLUMN "defaultShippingCarrierCode" TEXT,
  ADD COLUMN "defaultShippingServiceCode" TEXT,
  ADD COLUMN "defaultShippingSize" INTEGER,
  ADD COLUMN "defaultShippingFee" INTEGER,
  ADD CONSTRAINT "Customer_defaultShippingSize_positive" CHECK ("defaultShippingSize" IS NULL OR ("defaultShippingSize" > 0 AND "defaultShippingSize" <= 1000)),
  ADD CONSTRAINT "Customer_defaultShippingFee_nonnegative" CHECK ("defaultShippingFee" IS NULL OR "defaultShippingFee" >= 0),
  ADD CONSTRAINT "Customer_defaultShipping_complete" CHECK (
    ("defaultShippingCarrierCode" IS NULL AND "defaultShippingServiceCode" IS NULL AND "defaultShippingSize" IS NULL AND "defaultShippingFee" IS NULL)
    OR ("defaultShippingCarrierCode" IS NOT NULL AND "defaultShippingServiceCode" IS NOT NULL AND "defaultShippingSize" IS NOT NULL AND "defaultShippingFee" IS NOT NULL)
  ),
  ADD CONSTRAINT "Customer_defaultShipping_method" CHECK (
    "defaultShippingCarrierCode" IS NULL
    OR ("defaultShippingCarrierCode" = 'JAPAN_POST' AND "defaultShippingServiceCode" = 'YU_PACK')
    OR ("defaultShippingCarrierCode" = 'YAMATO' AND "defaultShippingServiceCode" = 'TA_Q_BIN')
  ),
  ADD CONSTRAINT "Customer_defaultShipping_business_only" CHECK (
    "type" = 'business' OR ("defaultShippingCarrierCode" IS NULL AND "defaultShippingServiceCode" IS NULL AND "defaultShippingSize" IS NULL AND "defaultShippingFee" IS NULL)
  );
COMMIT;
