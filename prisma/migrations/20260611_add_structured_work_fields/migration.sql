-- AlterTable
ALTER TABLE "PricingRule"
ADD COLUMN "repairWorkCategoryId" INTEGER,
ADD COLUMN "repairWorkActionId" INTEGER,
ADD COLUMN "targetPartNameId" TEXT,
ADD COLUMN "detailLabel" TEXT;

-- AlterTable
ALTER TABLE "RepairLineItem"
ADD COLUMN "repairWorkCategoryId" INTEGER,
ADD COLUMN "repairWorkActionId" INTEGER,
ADD COLUMN "targetPartNameId" TEXT,
ADD COLUMN "detailLabelSnapshot" TEXT,
ADD COLUMN "categoryNameSnapshot" TEXT,
ADD COLUMN "targetPartNameSnapshot" TEXT,
ADD COLUMN "actionNameSnapshot" TEXT;

-- CreateIndex
CREATE INDEX "PricingRule_repairWorkCategoryId_idx" ON "PricingRule"("repairWorkCategoryId");

-- CreateIndex
CREATE INDEX "PricingRule_repairWorkActionId_idx" ON "PricingRule"("repairWorkActionId");

-- CreateIndex
CREATE INDEX "PricingRule_targetPartNameId_idx" ON "PricingRule"("targetPartNameId");

-- CreateIndex
CREATE INDEX "PricingRule_repairWorkCategoryId_repairWorkActionId_targetPartNameId_idx" ON "PricingRule"("repairWorkCategoryId", "repairWorkActionId", "targetPartNameId");

-- CreateIndex
CREATE INDEX "RepairLineItem_repairWorkCategoryId_idx" ON "RepairLineItem"("repairWorkCategoryId");

-- CreateIndex
CREATE INDEX "RepairLineItem_repairWorkActionId_idx" ON "RepairLineItem"("repairWorkActionId");

-- CreateIndex
CREATE INDEX "RepairLineItem_targetPartNameId_idx" ON "RepairLineItem"("targetPartNameId");

-- CreateIndex
CREATE INDEX "RepairLineItem_repairWorkCategoryId_repairWorkActionId_targetPartNameId_idx" ON "RepairLineItem"("repairWorkCategoryId", "repairWorkActionId", "targetPartNameId");

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_repairWorkCategoryId_fkey" FOREIGN KEY ("repairWorkCategoryId") REFERENCES "RepairWorkCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_repairWorkActionId_fkey" FOREIGN KEY ("repairWorkActionId") REFERENCES "RepairWorkAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_targetPartNameId_fkey" FOREIGN KEY ("targetPartNameId") REFERENCES "PartNameMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairLineItem" ADD CONSTRAINT "RepairLineItem_repairWorkCategoryId_fkey" FOREIGN KEY ("repairWorkCategoryId") REFERENCES "RepairWorkCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairLineItem" ADD CONSTRAINT "RepairLineItem_repairWorkActionId_fkey" FOREIGN KEY ("repairWorkActionId") REFERENCES "RepairWorkAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairLineItem" ADD CONSTRAINT "RepairLineItem_targetPartNameId_fkey" FOREIGN KEY ("targetPartNameId") REFERENCES "PartNameMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
