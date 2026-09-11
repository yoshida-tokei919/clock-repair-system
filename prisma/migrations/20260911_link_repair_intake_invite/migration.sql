ALTER TABLE "Repair" ADD COLUMN "repairIntakeInviteId" INTEGER;

CREATE INDEX "Repair_repairIntakeInviteId_idx" ON "Repair"("repairIntakeInviteId");

ALTER TABLE "Repair"
  ADD CONSTRAINT "Repair_repairIntakeInviteId_fkey"
  FOREIGN KEY ("repairIntakeInviteId") REFERENCES "RepairIntakeInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
