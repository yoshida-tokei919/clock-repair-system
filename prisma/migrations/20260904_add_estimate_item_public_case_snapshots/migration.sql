-- Keep the authored PublicCase structure without introducing RepairLineItem
-- or work-master dependencies into the production release branch.
ALTER TABLE "EstimateItem"
    ADD COLUMN "sourceAreaSnapshot" TEXT,
    ADD COLUMN "categoryNameSnapshot" TEXT,
    ADD COLUMN "targetPartNameSnapshot" TEXT,
    ADD COLUMN "actionNameSnapshot" TEXT,
    ADD COLUMN "detailLabelSnapshot" TEXT,
    ADD COLUMN "b2cDisplayNameSnapshot" TEXT,
    ADD COLUMN "gradeNameSnapshot" TEXT;
