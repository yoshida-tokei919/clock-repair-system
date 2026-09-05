-- AlterTable
ALTER TABLE "Invoice"
ADD COLUMN "billingMonth" TEXT,
ADD COLUMN "publicToken" TEXT,
ADD COLUMN "publicTokenCreatedAt" TIMESTAMP(3),
ADD COLUMN "currentPdfFileId" INTEGER,
ADD COLUMN "sentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InvoicePdfFile" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
    "fileSize" INTEGER,
    "hash" TEXT,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoicePdfFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_publicToken_key" ON "Invoice"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_currentPdfFileId_key" ON "Invoice"("currentPdfFileId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePdfFile_invoiceId_version_key" ON "InvoicePdfFile"("invoiceId", "version");

-- CreateIndex
CREATE INDEX "InvoicePdfFile_invoiceId_idx" ON "InvoicePdfFile"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoicePdfFile_customerId_idx" ON "InvoicePdfFile"("customerId");

-- CreateIndex
CREATE INDEX "InvoicePdfFile_status_idx" ON "InvoicePdfFile"("status");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_currentPdfFileId_fkey" FOREIGN KEY ("currentPdfFileId") REFERENCES "InvoicePdfFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePdfFile" ADD CONSTRAINT "InvoicePdfFile_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePdfFile" ADD CONSTRAINT "InvoicePdfFile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
