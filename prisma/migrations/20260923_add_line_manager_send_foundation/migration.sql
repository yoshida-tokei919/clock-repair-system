CREATE TYPE "LineManagerSendOutboxStatus" AS ENUM (
  'APPROVED', 'CLAIMED', 'PRE_SEND_FAILED', 'POST_UNCONFIRMED', 'CONFIRMED', 'CANCELLED'
);

CREATE TABLE "LineManagerChat" (
  "id" SERIAL NOT NULL,
  "lineUserId" INTEGER NOT NULL,
  "managerBotId" TEXT NOT NULL,
  "managerChatId" TEXT NOT NULL,
  "evidenceInquiryMessageId" INTEGER NOT NULL,
  "evidenceManagerMessageId" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LineManagerChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LineManagerSendOutbox" (
  "id" SERIAL NOT NULL,
  "inquiryId" INTEGER NOT NULL,
  "lineManagerChatId" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "sendId" TEXT NOT NULL,
  "status" "LineManagerSendOutboxStatus" NOT NULL DEFAULT 'APPROVED',
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "managerBotIdSnapshot" TEXT NOT NULL,
  "managerChatIdSnapshot" TEXT NOT NULL,
  "claimToken" TEXT,
  "claimLeaseExpiresAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "sendAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "postAttemptedAt" TIMESTAMP(3),
  "reconciliationToken" TEXT,
  "reconciliationLeaseExpiresAt" TIMESTAMP(3),
  "lastHistoryCheckedAt" TIMESTAMP(3),
  "confirmedManagerMessageId" TEXT,
  "confirmedInquiryMessageId" INTEGER,
  "confirmedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LineManagerSendOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LineManagerChat_lineUserId_key" ON "LineManagerChat"("lineUserId");
CREATE UNIQUE INDEX "LineManagerChat_evidenceInquiryMessageId_key" ON "LineManagerChat"("evidenceInquiryMessageId");
CREATE UNIQUE INDEX "LineManagerChat_managerBotId_managerChatId_key" ON "LineManagerChat"("managerBotId", "managerChatId");
CREATE UNIQUE INDEX "LineManagerChat_managerBotId_evidenceManagerMessageId_key" ON "LineManagerChat"("managerBotId", "evidenceManagerMessageId");
CREATE UNIQUE INDEX "LineManagerSendOutbox_idempotencyKey_key" ON "LineManagerSendOutbox"("idempotencyKey");
CREATE UNIQUE INDEX "LineManagerSendOutbox_sendId_key" ON "LineManagerSendOutbox"("sendId");
CREATE UNIQUE INDEX "LineManagerSendOutbox_confirmedManagerMessageId_key" ON "LineManagerSendOutbox"("confirmedManagerMessageId");
CREATE UNIQUE INDEX "LineManagerSendOutbox_confirmedInquiryMessageId_key" ON "LineManagerSendOutbox"("confirmedInquiryMessageId");
CREATE INDEX "LineManagerSendOutbox_status_claimLeaseExpiresAt_idx" ON "LineManagerSendOutbox"("status", "claimLeaseExpiresAt");
CREATE INDEX "LineManagerSendOutbox_status_reconciliationLeaseExpiresAt_idx" ON "LineManagerSendOutbox"("status", "reconciliationLeaseExpiresAt");
CREATE INDEX "LineManagerSendOutbox_inquiryId_idx" ON "LineManagerSendOutbox"("inquiryId");
CREATE INDEX "LineManagerSendOutbox_lineManagerChatId_idx" ON "LineManagerSendOutbox"("lineManagerChatId");

ALTER TABLE "LineManagerChat" ADD CONSTRAINT "LineManagerChat_lineUserId_fkey" FOREIGN KEY ("lineUserId") REFERENCES "LineUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineManagerChat" ADD CONSTRAINT "LineManagerChat_evidenceInquiryMessageId_fkey" FOREIGN KEY ("evidenceInquiryMessageId") REFERENCES "InquiryMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineManagerSendOutbox" ADD CONSTRAINT "LineManagerSendOutbox_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineManagerSendOutbox" ADD CONSTRAINT "LineManagerSendOutbox_lineManagerChatId_fkey" FOREIGN KEY ("lineManagerChatId") REFERENCES "LineManagerChat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineManagerSendOutbox" ADD CONSTRAINT "LineManagerSendOutbox_confirmedInquiryMessageId_fkey" FOREIGN KEY ("confirmedInquiryMessageId") REFERENCES "InquiryMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
