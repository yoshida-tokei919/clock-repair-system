-- Preserve existing Watches while allowing a B2C intake to omit a canonical Model.
CREATE TYPE "TimepieceType" AS ENUM ('WRISTWATCH', 'POCKET_WATCH', 'WALL_CLOCK', 'TABLE_CLOCK', 'OTHER');
CREATE TYPE "WatchDriveType" AS ENUM ('QUARTZ', 'MECHANICAL', 'UNKNOWN');

ALTER TABLE "Watch" DROP CONSTRAINT "Watch_modelId_fkey";

ALTER TABLE "Watch"
  ALTER COLUMN "modelId" DROP NOT NULL,
  ADD COLUMN "modelNameInput" TEXT,
  ADD COLUMN "timepieceType" "TimepieceType",
  ADD COLUMN "driveType" "WatchDriveType";

ALTER TABLE "Watch"
  ADD CONSTRAINT "Watch_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RepairIntakeInvite" (
  "id" SERIAL NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "customerId" INTEGER,
  "lineUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RepairIntakeInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepairIntakeInvite_token_key" ON "RepairIntakeInvite"("token");
CREATE INDEX "RepairIntakeInvite_customerId_idx" ON "RepairIntakeInvite"("customerId");
CREATE INDEX "RepairIntakeInvite_lineUserId_idx" ON "RepairIntakeInvite"("lineUserId");
CREATE INDEX "RepairIntakeInvite_expiresAt_idx" ON "RepairIntakeInvite"("expiresAt");

ALTER TABLE "RepairIntakeInvite"
  ADD CONSTRAINT "RepairIntakeInvite_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RepairIntakeInvite"
  ADD CONSTRAINT "RepairIntakeInvite_lineUserId_fkey"
  FOREIGN KEY ("lineUserId") REFERENCES "LineUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
