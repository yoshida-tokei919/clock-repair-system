-- Phase 3 / P3-1: mutable human-review drafts derived from immutable AI snapshots.
CREATE TYPE "InquiryWatchField" AS ENUM ('BRAND', 'MODEL', 'PRODUCT_REF', 'CASE_REF', 'CALIBER', 'MOVEMENT_TYPE', 'ERA');
CREATE TYPE "InquiryWatchFieldValueSource" AS ENUM ('AI_CANDIDATE', 'MANUAL');
CREATE TYPE "InquiryWatchFieldConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED');

CREATE TABLE "InquiryWatch" (
    "id" SERIAL NOT NULL,
    "inquiryId" INTEGER NOT NULL,
    "sourceAiWatchId" INTEGER,
    "position" INTEGER NOT NULL,
    "label" TEXT,
    "summary" TEXT,
    "faults" JSONB,
    "requestedWork" JSONB,
    "supplementalFacts" JSONB,
    "missingInformation" JSONB,
    "missingPhotos" JSONB,
    "brandId" INTEGER,
    "modelId" INTEGER,
    "referenceId" INTEGER,
    "caseReferenceId" INTEGER,
    "caliberId" INTEGER,
    "promotedWatchId" INTEGER,
    "promotedRepairId" INTEGER,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InquiryWatch_promotion_complete_check" CHECK (
        ("promotedWatchId" IS NULL AND "promotedRepairId" IS NULL AND "promotedAt" IS NULL)
        OR
        ("promotedWatchId" IS NOT NULL AND "promotedRepairId" IS NOT NULL AND "promotedAt" IS NOT NULL)
    ),
    CONSTRAINT "InquiryWatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InquiryWatchFieldValue" (
    "id" SERIAL NOT NULL,
    "inquiryWatchId" INTEGER NOT NULL,
    "field" "InquiryWatchField" NOT NULL,
    "value" TEXT NOT NULL,
    "source" "InquiryWatchFieldValueSource" NOT NULL,
    "confirmationStatus" "InquiryWatchFieldConfirmationStatus" NOT NULL DEFAULT 'PENDING',
    "sourceAiCandidateId" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InquiryWatchFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InquiryWatch_inquiryId_position_key" ON "InquiryWatch"("inquiryId", "position");
CREATE UNIQUE INDEX "InquiryWatch_promotedWatchId_key" ON "InquiryWatch"("promotedWatchId");
CREATE UNIQUE INDEX "InquiryWatch_promotedRepairId_key" ON "InquiryWatch"("promotedRepairId");
CREATE INDEX "InquiryWatch_inquiryId_createdAt_idx" ON "InquiryWatch"("inquiryId", "createdAt");
CREATE INDEX "InquiryWatch_inquiryId_position_idx" ON "InquiryWatch"("inquiryId", "position");
CREATE INDEX "InquiryWatch_promotedAt_idx" ON "InquiryWatch"("promotedAt");
CREATE UNIQUE INDEX "InquiryWatchFieldValue_inquiryWatchId_field_key" ON "InquiryWatchFieldValue"("inquiryWatchId", "field");
CREATE UNIQUE INDEX "InquiryWatchFieldValue_sourceAiCandidateId_key" ON "InquiryWatchFieldValue"("sourceAiCandidateId");
CREATE INDEX "InquiryWatchFieldValue_confirmationStatus_idx" ON "InquiryWatchFieldValue"("confirmationStatus");

ALTER TABLE "InquiryWatch" ADD CONSTRAINT "InquiryWatch_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InquiryWatch" ADD CONSTRAINT "InquiryWatch_sourceAiWatchId_fkey" FOREIGN KEY ("sourceAiWatchId") REFERENCES "InquiryAiWatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InquiryWatch" ADD CONSTRAINT "InquiryWatch_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InquiryWatch" ADD CONSTRAINT "InquiryWatch_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InquiryWatch" ADD CONSTRAINT "InquiryWatch_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "WatchReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InquiryWatch" ADD CONSTRAINT "InquiryWatch_caseReferenceId_fkey" FOREIGN KEY ("caseReferenceId") REFERENCES "WatchReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InquiryWatch" ADD CONSTRAINT "InquiryWatch_caliberId_fkey" FOREIGN KEY ("caliberId") REFERENCES "Caliber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InquiryWatch" ADD CONSTRAINT "InquiryWatch_promotedWatchId_fkey" FOREIGN KEY ("promotedWatchId") REFERENCES "Watch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InquiryWatch" ADD CONSTRAINT "InquiryWatch_promotedRepairId_fkey" FOREIGN KEY ("promotedRepairId") REFERENCES "Repair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InquiryWatchFieldValue" ADD CONSTRAINT "InquiryWatchFieldValue_inquiryWatchId_fkey" FOREIGN KEY ("inquiryWatchId") REFERENCES "InquiryWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InquiryWatchFieldValue" ADD CONSTRAINT "InquiryWatchFieldValue_sourceAiCandidateId_fkey" FOREIGN KEY ("sourceAiCandidateId") REFERENCES "InquiryAiCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
