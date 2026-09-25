-- Repair is managed by the server-side application; no Data API GRANT is needed.
-- Existing repairs remain eligible for future automatic scheduling.
ALTER TABLE "Repair" ADD COLUMN "scheduleLocked" BOOLEAN NOT NULL DEFAULT false;
