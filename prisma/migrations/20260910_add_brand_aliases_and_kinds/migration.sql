CREATE TYPE "BrandKind" AS ENUM ('NORMAL', 'TYPE', 'UNKNOWN');

ALTER TABLE "Brand"
  ADD COLUMN "brandKind" "BrandKind" NOT NULL DEFAULT 'NORMAL';

ALTER TABLE "Brand"
  ADD COLUMN "isWatchBrand" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isMovementMaker" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Brand" AS brand
SET "isMovementMaker" = true
WHERE EXISTS (
  SELECT 1
  FROM "Repair" AS repair
  WHERE repair."movementMakerId" = brand."id"
     OR repair."baseMovementMakerId" = brand."id"
)
OR EXISTS (
  SELECT 1
  FROM "PartsMaster" AS part
  WHERE part."movementMakerId" = brand."id"
     OR part."baseMakerId" = brand."id"
);

CREATE TABLE "BrandAlias" (
  "id" SERIAL NOT NULL,
  "brandId" INTEGER NOT NULL,
  "alias" TEXT NOT NULL,
  "normalizedAlias" TEXT NOT NULL,

  CONSTRAINT "BrandAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandAlias_normalizedAlias_key" ON "BrandAlias"("normalizedAlias");
CREATE INDEX "BrandAlias_brandId_idx" ON "BrandAlias"("brandId");

ALTER TABLE "BrandAlias"
  ADD CONSTRAINT "BrandAlias_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
