-- The safe default protects every existing repair and any repair inserted
-- before Task166F-aware application code is deployed.
ALTER TABLE "Repair" ADD COLUMN "partsAllocationLegacy" BOOLEAN NOT NULL DEFAULT true;
