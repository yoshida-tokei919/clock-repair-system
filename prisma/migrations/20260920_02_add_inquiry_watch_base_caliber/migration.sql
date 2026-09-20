-- Phase 3 / P3-2: Base Cal is a first-class, reviewable InquiryWatch field.
ALTER TYPE "InquiryAiCandidateField" ADD VALUE 'BASE_CALIBER';
ALTER TYPE "InquiryWatchField" ADD VALUE 'BASE_CALIBER';

ALTER TABLE "InquiryWatch" ADD COLUMN "baseCaliberId" INTEGER;

ALTER TABLE "InquiryWatch"
  ADD CONSTRAINT "InquiryWatch_baseCaliberId_fkey"
  FOREIGN KEY ("baseCaliberId") REFERENCES "Caliber"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
