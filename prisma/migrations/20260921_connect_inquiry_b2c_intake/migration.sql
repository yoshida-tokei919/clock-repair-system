CREATE TYPE "InquiryWatchDecision" AS ENUM ('PENDING', 'REQUESTED', 'DECLINED');

ALTER TABLE "InquiryWatch"
  ADD COLUMN "decision" "InquiryWatchDecision" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "RepairIntakeInvite"
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "inquiryId" INTEGER;

ALTER TABLE "RepairIntakeInvite"
  ADD CONSTRAINT "RepairIntakeInvite_inquiryId_fkey"
  FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RepairIntakeInviteWatch" (
  "repairIntakeInviteId" INTEGER NOT NULL,
  "inquiryWatchId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepairIntakeInviteWatch_pkey" PRIMARY KEY ("repairIntakeInviteId", "inquiryWatchId")
);

ALTER TABLE "RepairIntakeInviteWatch"
  ADD CONSTRAINT "RepairIntakeInviteWatch_repairIntakeInviteId_fkey"
  FOREIGN KEY ("repairIntakeInviteId") REFERENCES "RepairIntakeInvite"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepairIntakeInviteWatch"
  ADD CONSTRAINT "RepairIntakeInviteWatch_inquiryWatchId_fkey"
  FOREIGN KEY ("inquiryWatchId") REFERENCES "InquiryWatch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "InquiryWatch_inquiryId_decision_promotedAt_idx"
  ON "InquiryWatch"("inquiryId", "decision", "promotedAt");
CREATE INDEX "RepairIntakeInvite_inquiryId_revokedAt_idx"
  ON "RepairIntakeInvite"("inquiryId", "revokedAt");
CREATE INDEX "RepairIntakeInviteWatch_inquiryWatchId_idx"
  ON "RepairIntakeInviteWatch"("inquiryWatchId");
