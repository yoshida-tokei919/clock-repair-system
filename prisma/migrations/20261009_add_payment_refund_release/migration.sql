-- Task208E: append-only refund and allocation-release histories.
CREATE TYPE public."PaymentRefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

ALTER TABLE public."Payment"
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "canceledBy" INTEGER;
ALTER TABLE public."PaymentAttempt" ADD COLUMN "checkoutOrigin" TEXT;
ALTER TABLE public."Invoice"
  ADD COLUMN "lineSendRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lineSendRetryKey" TEXT,
  ADD COLUMN "lineSendStartedAt" TIMESTAMP(3),
  ADD COLUMN "lineSendPdfFileId" INTEGER,
  ADD COLUMN "lineSendTo" TEXT,
  ADD COLUMN "lineSendMessage" TEXT;
CREATE UNIQUE INDEX "Invoice_lineSendRetryKey_key" ON public."Invoice"("lineSendRetryKey");
ALTER TABLE public."Invoice" ADD CONSTRAINT "Invoice_line_send_reservation_check" CHECK (
  ("lineSendRetryKey" IS NULL AND "lineSendStartedAt" IS NULL AND "lineSendPdfFileId" IS NULL
    AND "lineSendTo" IS NULL AND "lineSendMessage" IS NULL)
  OR ("lineSendRetryKey" IS NOT NULL AND "sentAt" IS NOT NULL AND "lineSendStartedAt" IS NULL
    AND "lineSendPdfFileId" IS NULL AND "lineSendTo" IS NULL AND "lineSendMessage" IS NULL)
  OR ("lineSendRetryKey" IS NOT NULL AND "lineSendStartedAt" IS NOT NULL AND "lineSendPdfFileId" IS NOT NULL
    AND "lineSendTo" IS NOT NULL AND "lineSendMessage" IS NOT NULL)
);
ALTER TABLE public."Payment" ADD CONSTRAINT "Payment_cancellation_audit_check" CHECK (
  ("canceledAt" IS NULL AND "cancelReason" IS NULL AND "canceledBy" IS NULL)
  OR ("status" = 'CANCELED' AND "canceledAt" IS NOT NULL AND "cancelReason" ~ '[^[:space:]　]')
);

CREATE TABLE public."PaymentRefund" (
  "id" SERIAL PRIMARY KEY,
  "paymentId" INTEGER NOT NULL REFERENCES public."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" INTEGER NOT NULL CHECK ("amount" > 0),
  "provider" public."PaymentProvider" NOT NULL,
  "status" public."PaymentRefundStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL CHECK ("reason" ~ '[^[:space:]　]'),
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "externalRefundId" TEXT UNIQUE,
  "providerStatus" TEXT,
  "requestedBy" INTEGER,
  "refundedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentRefund_completed_check" CHECK ("status" <> 'SUCCEEDED' OR "refundedAt" IS NOT NULL)
);
CREATE INDEX "PaymentRefund_paymentId_status_idx" ON public."PaymentRefund"("paymentId", "status");
CREATE UNIQUE INDEX "PaymentRefund_one_pending_per_payment_key"
  ON public."PaymentRefund"("paymentId") WHERE "status" = 'PENDING';

CREATE TABLE public."PaymentAllocationRelease" (
  "id" SERIAL PRIMARY KEY,
  "allocationId" INTEGER NOT NULL REFERENCES public."PaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" INTEGER NOT NULL CHECK ("amount" > 0),
  "reason" TEXT NOT NULL CHECK ("reason" ~ '[^[:space:]　]'),
  "releasedBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PaymentAllocationRelease_allocationId_createdAt_idx"
  ON public."PaymentAllocationRelease"("allocationId", "createdAt");

-- Prisma/direct Postgres only. Never expose these histories through Supabase Data API.
ALTER TABLE public."PaymentRefund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PaymentAllocationRelease" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PaymentRefund", public."PaymentAllocationRelease" FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."PaymentRefund_id_seq", public."PaymentAllocationRelease_id_seq" FROM anon, authenticated, service_role;
