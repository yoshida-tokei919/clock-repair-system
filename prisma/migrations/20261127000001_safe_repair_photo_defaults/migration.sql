-- Existing RepairPhoto visibility is intentionally left untouched.
ALTER TABLE "RepairPhoto" ALTER COLUMN "customerVisible" SET DEFAULT false;

UPDATE "PhotoSharingDefault"
SET "customerVisible" = ("category" = 'FRONT'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "customerVisible" IS DISTINCT FROM ("category" = 'FRONT');

INSERT INTO "PhotoSharingDefault" ("category", "customerVisible", "publicCaseVisible", "snsVisible", "updatedAt") VALUES
  ('MOVEMENT_DISASSEMBLED', false, false, false, CURRENT_TIMESTAMP),
  ('FAULT_DETAIL', false, false, false, CURRENT_TIMESTAMP)
ON CONFLICT ("category") DO NOTHING;
