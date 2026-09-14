BEGIN;

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'PAYPAY', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "InvoiceRepairSnapshot" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "repairId" INTEGER NOT NULL,
    "inquiryNumber" TEXT NOT NULL,
    "deliveryNoteId" INTEGER,
    "deliverySlipNumber" TEXT,
    "deliveryIssuedDate" TIMESTAMP(3),
    "deliveryDateActual" TIMESTAMP(3),
    "subtotalAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRepairSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "provider" "PaymentProvider" NOT NULL,
    "method" "PaymentMethod",
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "allocatedAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "externalTransactionId" TEXT,
    "checkoutSessionId" TEXT,
    "paymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRepairSnapshot_invoiceId_repairId_key" ON "InvoiceRepairSnapshot"("invoiceId", "repairId");
CREATE INDEX "InvoiceRepairSnapshot_repairId_idx" ON "InvoiceRepairSnapshot"("repairId");
CREATE INDEX "InvoiceRepairSnapshot_invoiceId_deliveryNoteId_idx" ON "InvoiceRepairSnapshot"("invoiceId", "deliveryNoteId");
CREATE INDEX "Payment_customerId_status_idx" ON "Payment"("customerId", "status");
CREATE INDEX "Payment_status_paidAt_idx" ON "Payment"("status", "paidAt");
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_key" ON "PaymentAllocation"("paymentId");
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");
CREATE UNIQUE INDEX "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentAttempt_externalTransactionId_key" ON "PaymentAttempt"("externalTransactionId");
CREATE UNIQUE INDEX "PaymentAttempt_checkoutSessionId_key" ON "PaymentAttempt"("checkoutSessionId");
CREATE UNIQUE INDEX "PaymentAttempt_paymentIntentId_key" ON "PaymentAttempt"("paymentIntentId");
CREATE INDEX "PaymentAttempt_paymentId_status_idx" ON "PaymentAttempt"("paymentId", "status");

-- AddForeignKey
ALTER TABLE "InvoiceRepairSnapshot" ADD CONSTRAINT "InvoiceRepairSnapshot_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- JPY amounts are stored as integers. Reject invalid ledger values.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_currency_jpy" CHECK ("currency" = 'JPY');
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paidAt_status" CHECK (
  ("status" = 'SUCCEEDED' AND "paidAt" IS NOT NULL)
  OR ("status" <> 'SUCCEEDED' AND "paidAt" IS NULL)
);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("allocatedAmount" > 0);
COMMIT;
