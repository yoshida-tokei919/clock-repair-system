-- Keep the legacy address text for existing B2B and document flows. New B2C
-- intake writes these structured fields and its compatibility address together.
ALTER TABLE "Customer"
  ADD COLUMN "prefecture" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "street" TEXT,
  ADD COLUMN "building" TEXT;
