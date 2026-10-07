-- Task208A: distinguish existing invoice payments from future Repair prepayments.
-- The default classifies every existing Payment as INVOICE without rewriting rows.
CREATE TYPE public."PaymentKind" AS ENUM ('INVOICE', 'REPAIR_PREPAYMENT');

ALTER TABLE public."Payment"
  ADD COLUMN "kind" public."PaymentKind" NOT NULL DEFAULT 'INVOICE',
  ADD COLUMN "repairId" INTEGER,
  ADD COLUMN "purpose" TEXT;

ALTER TABLE public."Payment" ADD CONSTRAINT "Payment_kind_repair_purpose_check" CHECK (
  ("kind" = 'INVOICE' AND "repairId" IS NULL AND "purpose" IS NULL)
  OR ("kind" = 'REPAIR_PREPAYMENT' AND "repairId" IS NOT NULL
      AND "purpose" IS NOT NULL AND "purpose" ~ '[^[:space:]　]')
);

-- The composite key also ensures Payment.customerId matches Repair.customerId.
ALTER TABLE public."Payment" ADD CONSTRAINT "Payment_repairId_customerId_fkey"
  FOREIGN KEY ("repairId", "customerId") REFERENCES public."Repair"("id", "customerId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "Payment_repairId_kind_status_idx"
  ON public."Payment"("repairId", "kind", "status");

-- One active request per Repair; successful, failed, or canceled payments remain as history.
-- Prisma 5.7 does not model partial indexes, so this is migration-only.
CREATE UNIQUE INDEX "Payment_one_pending_repair_prepayment_idx"
  ON public."Payment"("repairId")
  WHERE "kind" = 'REPAIR_PREPAYMENT' AND "status" = 'PENDING';

-- No new table or Data API grant is introduced; existing Payment access control is unchanged.
