-- Store the delivery destination accepted by an individual customer at approval time.
-- Existing repairs intentionally remain untouched; only future B2C approvals create snapshots.
ALTER TABLE "Repair"
  ADD COLUMN "returnRecipientName" TEXT,
  ADD COLUMN "returnPostalCode" TEXT,
  ADD COLUMN "returnPrefecture" TEXT,
  ADD COLUMN "returnCity" TEXT,
  ADD COLUMN "returnStreet" TEXT,
  ADD COLUMN "returnBuilding" TEXT,
  ADD COLUMN "returnPhone" TEXT;
