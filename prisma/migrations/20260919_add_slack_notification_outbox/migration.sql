CREATE TYPE "SlackNotificationTarget" AS ENUM ('REPAIR_INBOX', 'REPAIR_ERRORS');

CREATE TYPE "SlackNotificationKind" AS ENUM (
  'NEW_INQUIRY',
  'IMAGE_ADDED',
  'INQUIRY_UPDATED',
  'NEEDS_REVIEW',
  'INBOX_PROCESSING_FAILED'
);

CREATE TYPE "SlackNotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "SlackNotificationOutbox" (
  "id" SERIAL NOT NULL,
  "target" "SlackNotificationTarget" NOT NULL,
  "kind" "SlackNotificationKind" NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" "SlackNotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "processingToken" TEXT,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "text" TEXT NOT NULL,
  "inquiryId" INTEGER,
  "inboxId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SlackNotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SlackNotificationOutbox_dedupeKey_key" ON "SlackNotificationOutbox"("dedupeKey");
CREATE INDEX "SlackNotificationOutbox_status_lastAttemptAt_idx" ON "SlackNotificationOutbox"("status", "lastAttemptAt");
CREATE INDEX "SlackNotificationOutbox_inquiryId_idx" ON "SlackNotificationOutbox"("inquiryId");
CREATE INDEX "SlackNotificationOutbox_inboxId_idx" ON "SlackNotificationOutbox"("inboxId");

ALTER TABLE "SlackNotificationOutbox"
  ADD CONSTRAINT "SlackNotificationOutbox_inquiryId_fkey"
  FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
