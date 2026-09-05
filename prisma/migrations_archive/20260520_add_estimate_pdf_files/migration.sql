-- AlterTable
ALTER TABLE "EstimateDocument" ADD COLUMN "currentPdfFileId" INTEGER;

-- CreateTable
CREATE TABLE "EstimatePdfFile" (
    "id" SERIAL NOT NULL,
    "estimateDocumentId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
    "fileSize" INTEGER,
    "hash" TEXT,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'current',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "EstimatePdfFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EstimateDocument_currentPdfFileId_key" ON "EstimateDocument"("currentPdfFileId");

-- CreateIndex
CREATE INDEX "EstimatePdfFile_estimateDocumentId_idx" ON "EstimatePdfFile"("estimateDocumentId");

-- CreateIndex
CREATE INDEX "EstimatePdfFile_customerId_idx" ON "EstimatePdfFile"("customerId");

-- CreateIndex
CREATE INDEX "EstimatePdfFile_status_idx" ON "EstimatePdfFile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EstimatePdfFile_estimateDocumentId_version_key" ON "EstimatePdfFile"("estimateDocumentId", "version");

-- AddForeignKey
ALTER TABLE "EstimateDocument" ADD CONSTRAINT "EstimateDocument_currentPdfFileId_fkey" FOREIGN KEY ("currentPdfFileId") REFERENCES "EstimatePdfFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimatePdfFile" ADD CONSTRAINT "EstimatePdfFile_estimateDocumentId_fkey" FOREIGN KEY ("estimateDocumentId") REFERENCES "EstimateDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimatePdfFile" ADD CONSTRAINT "EstimatePdfFile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
