ALTER TABLE "PricingRule" ADD COLUMN "defaultQuantityUnit" TEXT;
ALTER TABLE "PartsMaster" ADD COLUMN "defaultQuantityUnit" TEXT;
ALTER TABLE "EstimateItem" ADD COLUMN "quantityUnit" TEXT;
ALTER TABLE "EstimateOptionLine" ADD COLUMN "quantityUnit" TEXT;
ALTER TABLE "RepairLineItem" ADD COLUMN "quantityUnit" TEXT;
