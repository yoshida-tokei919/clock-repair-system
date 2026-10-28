ALTER TYPE "SlackNotificationKind" ADD VALUE 'CUSTOMER_COMMENT';

CREATE INDEX "RepairCustomerMessage_unread_partner_id_idx"
  ON "RepairCustomerMessage" ("id" DESC)
  WHERE "senderType" = 'partner' AND "readAt" IS NULL;
