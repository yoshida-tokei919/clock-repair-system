-- Classify RepairPhoto rows by shooting stage/area and retain explicit
-- per-destination sharing consent. Existing general photos cannot be
-- classified reliably, so they become OTHER with customer sharing preserved.
CREATE TYPE "RepairPhotoStage" AS ENUM ('RECEPTION', 'WORK', 'COMPLETION');
CREATE TYPE "RepairPhotoCategory" AS ENUM ('FRONT', 'CROWN_SIDE', 'BACK', 'BRACELET', 'MOVEMENT_OPEN', 'REPAIR_DETAIL', 'OTHER');

ALTER TABLE "RepairPhoto"
  ADD COLUMN "stage" "RepairPhotoStage",
  ADD COLUMN "customerVisible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "publicCaseVisible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "snsVisible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "RepairPhoto"
  ALTER COLUMN "category" DROP DEFAULT,
  ALTER COLUMN "category" TYPE "RepairPhotoCategory"
    USING CASE
      WHEN "category" IN ('FRONT', 'CROWN_SIDE', 'BACK', 'BRACELET', 'MOVEMENT_OPEN', 'REPAIR_DETAIL', 'OTHER')
        THEN "category"::"RepairPhotoCategory"
      ELSE 'OTHER'::"RepairPhotoCategory"
    END,
  ALTER COLUMN "category" SET DEFAULT 'OTHER';

CREATE TABLE "PhotoSharingDefault" (
  "category" "RepairPhotoCategory" NOT NULL,
  "customerVisible" BOOLEAN NOT NULL,
  "publicCaseVisible" BOOLEAN NOT NULL,
  "snsVisible" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhotoSharingDefault_pkey" PRIMARY KEY ("category")
);

INSERT INTO "PhotoSharingDefault" ("category", "customerVisible", "publicCaseVisible", "snsVisible", "updatedAt") VALUES
  ('FRONT', true, true, true, CURRENT_TIMESTAMP),
  ('BACK', true, true, false, CURRENT_TIMESTAMP),
  ('CROWN_SIDE', false, false, false, CURRENT_TIMESTAMP),
  ('BRACELET', false, false, false, CURRENT_TIMESTAMP),
  ('MOVEMENT_OPEN', true, true, true, CURRENT_TIMESTAMP),
  ('REPAIR_DETAIL', true, true, true, CURRENT_TIMESTAMP),
  ('OTHER', false, false, false, CURRENT_TIMESTAMP);

CREATE INDEX "RepairPhoto_repairId_customerVisible_idx" ON "RepairPhoto"("repairId", "customerVisible");
CREATE INDEX "RepairPhoto_repairId_publicCaseVisible_idx" ON "RepairPhoto"("repairId", "publicCaseVisible");
