BEGIN;
CREATE TYPE "B2BHistoricalRefundMethod" AS ENUM ('OFFSET', 'BANK');
CREATE TYPE "B2BHistoricalRefundSaleSource" AS ENUM ('LEGACY', 'CURRENT');
CREATE TYPE "B2BHistoricalRefundStatus" AS ENUM ('PLANNED', 'AWAITING_OFFSET', 'OFFSET_SETTLED', 'BANK_SETTLED', 'CANCELLED');
CREATE TYPE "B2BHistoricalRefundTaxStatus" AS ENUM ('PENDING', 'CONFIRMED');

CREATE TABLE public."B2BHistoricalRefund" (
  "id" SERIAL PRIMARY KEY,
  "customerId" INTEGER NOT NULL REFERENCES public."Customer"("id") ON DELETE RESTRICT,
  "deliveryNoteId" INTEGER NOT NULL REFERENCES public."DeliveryNote"("id") ON DELETE RESTRICT,
  "repairId" INTEGER NOT NULL UNIQUE REFERENCES public."Repair"("id") ON DELETE RESTRICT,
  "originalSaleReference" TEXT NOT NULL,
  "originalSaleSource" "B2BHistoricalRefundSaleSource" NOT NULL,
  "originalSaleDate" TIMESTAMP(3),
  "originalSaleGrossAmount" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "method" "B2BHistoricalRefundMethod" NOT NULL,
  "status" "B2BHistoricalRefundStatus" NOT NULL DEFAULT 'PLANNED',
  "taxStatus" "B2BHistoricalRefundTaxStatus" NOT NULL DEFAULT 'PENDING',
  "internalNotes" TEXT,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "B2BHistoricalRefund_positive_amounts" CHECK ("originalSaleGrossAmount" > 0 AND "amount" > 0 AND "amount" <= "originalSaleGrossAmount"),
  CONSTRAINT "B2BHistoricalRefund_nonempty_details" CHECK (length(btrim("originalSaleReference")) > 0 AND length(btrim("reason")) > 0)
);
CREATE INDEX "B2BHistoricalRefund_deliveryNoteId_status_idx" ON public."B2BHistoricalRefund"("deliveryNoteId", "status");
ALTER TABLE public."B2BHistoricalRefund" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."B2BHistoricalRefund" FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."B2BHistoricalRefund_id_seq" FROM anon, authenticated, service_role;
COMMIT;
