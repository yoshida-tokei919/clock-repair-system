-- Phase 2 / Task 2: immutable AI analysis snapshots and provisional candidates.
CREATE TYPE "InquiryAiAnalysisStatus" AS ENUM ('PENDING', 'COMPLETED', 'NEEDS_REVIEW', 'FAILED');
CREATE TYPE "InquiryAiConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "InquiryAiReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "InquiryAiCandidateField" AS ENUM ('BRAND', 'MODEL', 'PRODUCT_REF', 'CASE_REF', 'CALIBER', 'MOVEMENT_TYPE', 'ERA');
CREATE TYPE "InquiryAiSourceType" AS ENUM ('CUSTOMER_STATED', 'IMAGE_OBSERVED', 'WEB_INFERRED', 'AI_INFERRED', 'TECHNICIAN_CONFIRMED');

ALTER TABLE "Inquiry" ADD COLUMN "conversationSummary" TEXT;

CREATE TABLE "InquiryAiAnalysis" (
    "id" SERIAL NOT NULL,
    "inquiryId" INTEGER NOT NULL,
    "status" "InquiryAiAnalysisStatus" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "conversationSummary" TEXT,
    "watchCount" INTEGER,
    "watchCountConfidence" "InquiryAiConfidence",
    "unresolvedPoints" JSONB,
    "errorMessage" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InquiryAiAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InquiryAiWatch" (
    "id" SERIAL NOT NULL,
    "analysisId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT,
    "summary" TEXT,
    "segmentationConfidence" "InquiryAiConfidence",
    "faults" JSONB,
    "requestedWork" JSONB,
    "supplementalFacts" JSONB,
    "missingInformation" JSONB,
    "missingPhotos" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InquiryAiWatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InquiryAiCandidate" (
    "id" SERIAL NOT NULL,
    "watchId" INTEGER NOT NULL,
    "field" "InquiryAiCandidateField" NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "value" TEXT NOT NULL,
    "confidence" "InquiryAiConfidence",
    "evidence" TEXT,
    "observedText" TEXT,
    "sourceType" "InquiryAiSourceType" NOT NULL,
    "sourceMessageIds" JSONB,
    "sourceImageIds" JSONB,
    "reviewStatus" "InquiryAiReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InquiryAiCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InquiryAiAnalysis_idempotencyKey_key" ON "InquiryAiAnalysis"("idempotencyKey");
CREATE INDEX "InquiryAiAnalysis_inquiryId_createdAt_idx" ON "InquiryAiAnalysis"("inquiryId", "createdAt");
CREATE INDEX "InquiryAiAnalysis_inquiryId_inputFingerprint_idx" ON "InquiryAiAnalysis"("inquiryId", "inputFingerprint");
CREATE UNIQUE INDEX "InquiryAiWatch_analysisId_position_key" ON "InquiryAiWatch"("analysisId", "position");
CREATE INDEX "InquiryAiCandidate_watchId_field_idx" ON "InquiryAiCandidate"("watchId", "field");
CREATE INDEX "InquiryAiCandidate_reviewStatus_idx" ON "InquiryAiCandidate"("reviewStatus");

ALTER TABLE "InquiryAiAnalysis" ADD CONSTRAINT "InquiryAiAnalysis_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InquiryAiWatch" ADD CONSTRAINT "InquiryAiWatch_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "InquiryAiAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InquiryAiCandidate" ADD CONSTRAINT "InquiryAiCandidate_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "InquiryAiWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
