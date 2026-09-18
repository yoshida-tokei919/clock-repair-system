-- CreateEnum
CREATE TYPE "InquiryFileStatus" AS ENUM ('PENDING', 'STORED', 'FAILED');

-- AlterEnum
ALTER TYPE "LineWebhookInboxStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "LineWebhookInbox" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InquiryFile" (
    "id" SERIAL NOT NULL,
    "inquiryId" INTEGER NOT NULL,
    "inquiryMessageId" INTEGER,
    "provider" TEXT NOT NULL DEFAULT 'LINE',
    "providerFileId" TEXT,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "uploadStatus" "InquiryFileStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InquiryFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InquiryFile_inquiryMessageId_key" ON "InquiryFile"("inquiryMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "InquiryFile_objectKey_key" ON "InquiryFile"("objectKey");

-- CreateIndex
CREATE INDEX "InquiryFile_inquiryId_createdAt_idx" ON "InquiryFile"("inquiryId", "createdAt");

-- CreateIndex
CREATE INDEX "InquiryFile_uploadStatus_idx" ON "InquiryFile"("uploadStatus");

-- CreateIndex
CREATE UNIQUE INDEX "InquiryFile_provider_providerFileId_key" ON "InquiryFile"("provider", "providerFileId");

-- CreateIndex
CREATE INDEX "LineWebhookInbox_status_lastAttemptAt_idx" ON "LineWebhookInbox"("status", "lastAttemptAt");

-- AddForeignKey
ALTER TABLE "InquiryFile" ADD CONSTRAINT "InquiryFile_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InquiryFile" ADD CONSTRAINT "InquiryFile_inquiryMessageId_fkey" FOREIGN KEY ("inquiryMessageId") REFERENCES "InquiryMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
