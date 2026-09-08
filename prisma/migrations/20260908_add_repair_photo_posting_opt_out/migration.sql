-- A customer may decline case-study and SNS use while retaining the customer
-- sharing page. Enabling this flag clears only those two destinations.
ALTER TABLE "Repair"
  ADD COLUMN "photoPostingOptOut" BOOLEAN NOT NULL DEFAULT false;
