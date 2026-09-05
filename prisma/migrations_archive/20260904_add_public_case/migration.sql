-- CreateEnum
CREATE TYPE "PublicCaseSourceType" AS ENUM ('FMP', 'WEB_APP');

-- CreateEnum
CREATE TYPE "PublicCasePublishStatus" AS ENUM ('HIDDEN', 'READY', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PublicCaseReviewStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PublicCaseWarningSeverity" AS ENUM ('CRITICAL', 'REVIEW', 'INFO');

-- CreateTable
CREATE TABLE "PublicCase" (
    "id" SERIAL NOT NULL,
    "sourceType" "PublicCaseSourceType" NOT NULL,
    "sourceRepairId" TEXT,
    "repairId" INTEGER,
    "receivedDate" TIMESTAMP(3),
    "brandName" TEXT,
    "brandNameKana" TEXT,
    "brandDisplayName" TEXT,
    "modelName" TEXT,
    "ref" TEXT,
    "caliber" TEXT,
    "searchText" TEXT,
    "reviewStatus" "PublicCaseReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "b2bPublishStatus" "PublicCasePublishStatus" NOT NULL DEFAULT 'HIDDEN',
    "b2cPublishStatus" "PublicCasePublishStatus" NOT NULL DEFAULT 'HIDDEN',
    "b2bPublishedAt" TIMESTAMP(3),
    "b2cPublishedAt" TIMESTAMP(3),
    "b2bTitle" TEXT,
    "b2cTitle" TEXT,
    "b2bSummary" JSONB,
    "b2cSummary" JSONB,
    "publicTags" JSONB,
    "showPriceB2b" BOOLEAN NOT NULL DEFAULT true,
    "showPriceB2c" BOOLEAN NOT NULL DEFAULT false,
    "internalLaborTotal" INTEGER,
    "externalLaborTotal" INTEGER,
    "outsourcedTotal" INTEGER,
    "partsTotal" INTEGER,
    "totalAmount" INTEGER,
    "warnings" JSONB,
    "excludeReasons" JSONB,
    "sourceSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicCaseWorkItem" (
    "id" SERIAL NOT NULL,
    "publicCaseId" INTEGER NOT NULL,
    "sourceArea" TEXT NOT NULL,
    "sourceSlot" INTEGER,
    "sourceText" TEXT NOT NULL,
    "normalizedSourceText" TEXT NOT NULL,
    "isRuleMatched" BOOLEAN NOT NULL DEFAULT false,
    "isPublishable" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "PublicCaseReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "excludeReason" TEXT,
    "normalizedWorkName" TEXT,
    "b2bDisplayName" TEXT,
    "b2cDisplayName" TEXT,
    "laborPrice" INTEGER,
    "showPriceB2b" BOOLEAN NOT NULL DEFAULT true,
    "showPriceB2c" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "partName" TEXT,
    "action" TEXT,
    "actionDetail" TEXT,
    "attributes" JSONB,
    "ruleSnapshot" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicCaseWorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicCasePartItem" (
    "id" SERIAL NOT NULL,
    "publicCaseId" INTEGER NOT NULL,
    "relatedWorkItemId" INTEGER,
    "sourceArea" TEXT NOT NULL,
    "sourceSlot" INTEGER,
    "sourceText" TEXT NOT NULL,
    "normalizedSourceText" TEXT NOT NULL,
    "displayName" TEXT,
    "price" INTEGER,
    "showPriceB2b" BOOLEAN NOT NULL DEFAULT true,
    "showPriceB2c" BOOLEAN NOT NULL DEFAULT false,
    "relationStatus" TEXT NOT NULL DEFAULT 'UNLINKED',
    "reviewStatus" "PublicCaseReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "excludeReason" TEXT,
    "metadata" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicCasePartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicCaseImage" (
    "id" SERIAL NOT NULL,
    "publicCaseId" INTEGER NOT NULL,
    "storagePath" TEXT,
    "url" TEXT,
    "altText" TEXT,
    "caption" TEXT,
    "imageRole" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "PublicCaseReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicCaseImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicCaseWarning" (
    "id" SERIAL NOT NULL,
    "publicCaseId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "severity" "PublicCaseWarningSeverity" NOT NULL,
    "message" TEXT,
    "target" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicCaseWarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicCase_sourceType_sourceRepairId_key" ON "PublicCase"("sourceType", "sourceRepairId");
CREATE INDEX "PublicCase_repairId_idx" ON "PublicCase"("repairId");
CREATE INDEX "PublicCase_brandName_idx" ON "PublicCase"("brandName");
CREATE INDEX "PublicCase_brandNameKana_idx" ON "PublicCase"("brandNameKana");
CREATE INDEX "PublicCase_modelName_idx" ON "PublicCase"("modelName");
CREATE INDEX "PublicCase_ref_idx" ON "PublicCase"("ref");
CREATE INDEX "PublicCase_caliber_idx" ON "PublicCase"("caliber");
CREATE INDEX "PublicCase_b2bPublishStatus_idx" ON "PublicCase"("b2bPublishStatus");
CREATE INDEX "PublicCase_b2cPublishStatus_idx" ON "PublicCase"("b2cPublishStatus");
CREATE INDEX "PublicCase_reviewStatus_idx" ON "PublicCase"("reviewStatus");
CREATE INDEX "PublicCaseWorkItem_publicCaseId_idx" ON "PublicCaseWorkItem"("publicCaseId");
CREATE INDEX "PublicCaseWorkItem_sourceArea_idx" ON "PublicCaseWorkItem"("sourceArea");
CREATE INDEX "PublicCaseWorkItem_normalizedSourceText_idx" ON "PublicCaseWorkItem"("normalizedSourceText");
CREATE INDEX "PublicCaseWorkItem_isPublishable_idx" ON "PublicCaseWorkItem"("isPublishable");
CREATE INDEX "PublicCasePartItem_publicCaseId_idx" ON "PublicCasePartItem"("publicCaseId");
CREATE INDEX "PublicCasePartItem_relatedWorkItemId_idx" ON "PublicCasePartItem"("relatedWorkItemId");
CREATE INDEX "PublicCasePartItem_sourceArea_idx" ON "PublicCasePartItem"("sourceArea");
CREATE INDEX "PublicCaseImage_publicCaseId_idx" ON "PublicCaseImage"("publicCaseId");
CREATE INDEX "PublicCaseWarning_publicCaseId_idx" ON "PublicCaseWarning"("publicCaseId");
CREATE INDEX "PublicCaseWarning_code_idx" ON "PublicCaseWarning"("code");
CREATE INDEX "PublicCaseWarning_severity_idx" ON "PublicCaseWarning"("severity");

-- AddForeignKey
ALTER TABLE "PublicCase" ADD CONSTRAINT "PublicCase_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublicCaseWorkItem" ADD CONSTRAINT "PublicCaseWorkItem_publicCaseId_fkey" FOREIGN KEY ("publicCaseId") REFERENCES "PublicCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicCasePartItem" ADD CONSTRAINT "PublicCasePartItem_publicCaseId_fkey" FOREIGN KEY ("publicCaseId") REFERENCES "PublicCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicCasePartItem" ADD CONSTRAINT "PublicCasePartItem_relatedWorkItemId_fkey" FOREIGN KEY ("relatedWorkItemId") REFERENCES "PublicCaseWorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublicCaseImage" ADD CONSTRAINT "PublicCaseImage_publicCaseId_fkey" FOREIGN KEY ("publicCaseId") REFERENCES "PublicCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicCaseWarning" ADD CONSTRAINT "PublicCaseWarning_publicCaseId_fkey" FOREIGN KEY ("publicCaseId") REFERENCES "PublicCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
