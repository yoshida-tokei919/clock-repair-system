ALTER TABLE "Repair"
  ADD COLUMN "movementMakerId" INTEGER,
  ADD COLUMN "movementCaliberId" INTEGER,
  ADD COLUMN "baseMovementMakerId" INTEGER,
  ADD COLUMN "baseMovementCaliberId" INTEGER;

ALTER TABLE "Repair"
  ADD CONSTRAINT "Repair_movementMakerId_fkey"
    FOREIGN KEY ("movementMakerId") REFERENCES "Brand"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Repair"
  ADD CONSTRAINT "Repair_movementCaliberId_fkey"
    FOREIGN KEY ("movementCaliberId") REFERENCES "Caliber"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Repair"
  ADD CONSTRAINT "Repair_baseMovementMakerId_fkey"
    FOREIGN KEY ("baseMovementMakerId") REFERENCES "Brand"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Repair"
  ADD CONSTRAINT "Repair_baseMovementCaliberId_fkey"
    FOREIGN KEY ("baseMovementCaliberId") REFERENCES "Caliber"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
