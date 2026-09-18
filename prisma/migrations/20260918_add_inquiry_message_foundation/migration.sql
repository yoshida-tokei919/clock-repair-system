-- Phase 1 / Task 1: retain LINE inquiries and their message history before
-- any Customer, Watch, or Repair is created.
CREATE TYPE "InquiryStatus" AS ENUM (
  'OPEN',
  'AI_PENDING',
  'AI_PROCESSED',
  'NEEDS_REVIEW',
  'WAITING_CUSTOMER',
  'READY_FOR_INTAKE',
  'CLOSED'
);

CREATE TYPE "InquiryMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "InquiryMessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'OTHER');

CREATE TABLE "Inquiry" (
  "id" SERIAL NOT NULL,
  "lineUserId" INTEGER NOT NULL,
  "status" "InquiryStatus" NOT NULL DEFAULT 'OPEN',
  "firstReceivedAt" TIMESTAMP(3) NOT NULL,
  "lastReceivedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InquiryMessage" (
  "id" SERIAL NOT NULL,
  "inquiryId" INTEGER NOT NULL,
  "lineUserId" INTEGER NOT NULL,
  "externalMessageId" TEXT NOT NULL,
  "direction" "InquiryMessageDirection" NOT NULL,
  "messageType" "InquiryMessageType" NOT NULL,
  "body" TEXT,
  "receivedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'received',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InquiryMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InquiryMessage_externalMessageId_key" ON "InquiryMessage"("externalMessageId");
CREATE INDEX "Inquiry_lineUserId_status_idx" ON "Inquiry"("lineUserId", "status");
CREATE INDEX "Inquiry_lineUserId_lastReceivedAt_idx" ON "Inquiry"("lineUserId", "lastReceivedAt");
CREATE INDEX "InquiryMessage_inquiryId_createdAt_idx" ON "InquiryMessage"("inquiryId", "createdAt");
CREATE INDEX "InquiryMessage_lineUserId_createdAt_idx" ON "InquiryMessage"("lineUserId", "createdAt");

-- Deleting a LINE identity is not an existing product feature. Restricting it
-- prevents the inquiry/message audit trail from being removed accidentally.
ALTER TABLE "Inquiry"
  ADD CONSTRAINT "Inquiry_lineUserId_fkey"
  FOREIGN KEY ("lineUserId") REFERENCES "LineUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InquiryMessage"
  ADD CONSTRAINT "InquiryMessage_inquiryId_fkey"
  FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InquiryMessage"
  ADD CONSTRAINT "InquiryMessage_lineUserId_fkey"
  FOREIGN KEY ("lineUserId") REFERENCES "LineUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
