-- Derived association only. InquiryMessage remains the sole LINE source record.
CREATE TABLE "InquiryMessageRepairLink" (
  "classificationId" INTEGER NOT NULL,
  "repairId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InquiryMessageRepairLink_pkey" PRIMARY KEY ("classificationId", "repairId")
);

CREATE INDEX "InquiryMessageRepairLink_repairId_idx"
  ON "InquiryMessageRepairLink"("repairId");

ALTER TABLE "InquiryMessageRepairLink"
  ADD CONSTRAINT "InquiryMessageRepairLink_classificationId_fkey"
  FOREIGN KEY ("classificationId")
  REFERENCES "InquiryMessageClassification"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InquiryMessageRepairLink"
  ADD CONSTRAINT "InquiryMessageRepairLink_repairId_fkey"
  FOREIGN KEY ("repairId")
  REFERENCES "Repair"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Server-internal metadata: browser Data API roles must have no privileges.
REVOKE ALL PRIVILEGES ON TABLE "InquiryMessageRepairLink" FROM PUBLIC, anon, authenticated;
