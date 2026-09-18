-- Persist verified LINE events for deferred processing outside the webhook request path.
CREATE TYPE "LineWebhookInboxStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

CREATE TABLE "LineWebhookInbox" (
    "id" SERIAL NOT NULL,
    "webhookEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "rawEvent" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" "LineWebhookInboxStatus" NOT NULL DEFAULT 'RECEIVED',
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineWebhookInbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LineWebhookInbox_webhookEventId_key" ON "LineWebhookInbox"("webhookEventId");
