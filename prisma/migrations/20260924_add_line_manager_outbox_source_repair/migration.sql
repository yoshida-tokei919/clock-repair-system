-- This existing server-internal table needs no Data API GRANT change.
ALTER TABLE "LineManagerSendOutbox" ADD COLUMN "sourceRepairId" INTEGER;

CREATE INDEX "LineManagerSendOutbox_sourceRepairId_idx"
  ON "LineManagerSendOutbox"("sourceRepairId");

ALTER TABLE "LineManagerSendOutbox"
  ADD CONSTRAINT "LineManagerSendOutbox_sourceRepairId_fkey"
  FOREIGN KEY ("sourceRepairId") REFERENCES "Repair"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
