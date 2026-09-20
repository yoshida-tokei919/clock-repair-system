-- Phase 3 / P3-3: formal Watch records retain the separately reviewed case
-- reference and base caliber when an InquiryWatch is promoted.
ALTER TABLE "Watch" ADD COLUMN "caseReferenceId" INTEGER;
ALTER TABLE "Watch" ADD COLUMN "baseCaliberId" INTEGER;

ALTER TABLE "Watch"
  ADD CONSTRAINT "Watch_caseReferenceId_fkey"
  FOREIGN KEY ("caseReferenceId") REFERENCES "WatchReference"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Watch"
  ADD CONSTRAINT "Watch_baseCaliberId_fkey"
  FOREIGN KEY ("baseCaliberId") REFERENCES "Caliber"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
