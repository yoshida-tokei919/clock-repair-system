-- AlterTable
ALTER TABLE "PricingRule"
ADD COLUMN "repairWorkNameId" INTEGER,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "PricingRule"
SET "updatedAt" = CURRENT_TIMESTAMP
WHERE "updatedAt" IS NULL;

ALTER TABLE "PricingRule"
ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "PricingRule_brandId_modelId_caliberId_idx" ON "PricingRule"("brandId", "modelId", "caliberId");

-- CreateIndex
CREATE INDEX "PricingRule_brandId_customerType_idx" ON "PricingRule"("brandId", "customerType");

-- CreateIndex
CREATE INDEX "PricingRule_repairWorkNameId_idx" ON "PricingRule"("repairWorkNameId");

-- CreateIndex
CREATE INDEX "PricingRule_brandId_repairWorkNameId_idx" ON "PricingRule"("brandId", "repairWorkNameId");

-- CreateIndex
CREATE INDEX "PricingRule_brandId_repairWorkCategoryId_targetPartNameId_repairWorkActionId_idx" ON "PricingRule"("brandId", "repairWorkCategoryId", "targetPartNameId", "repairWorkActionId");

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_repairWorkNameId_fkey" FOREIGN KEY ("repairWorkNameId") REFERENCES "RepairWorkName"("id") ON DELETE SET NULL ON UPDATE CASCADE;
