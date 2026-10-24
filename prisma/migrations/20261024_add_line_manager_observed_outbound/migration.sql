-- Server-internal history only. No Data API role is granted access.
CREATE UNIQUE INDEX "LineManagerChat_id_lineUserId_key" ON "LineManagerChat"("id", "lineUserId");

CREATE TABLE "LineManagerObservedOutbound" (
  "id" SERIAL NOT NULL,
  "lineUserId" INTEGER NOT NULL,
  "lineManagerChatId" INTEGER NOT NULL,
  "managerBotIdSnapshot" TEXT NOT NULL,
  "managerChatIdSnapshot" TEXT NOT NULL,
  "externalMessageId" TEXT NOT NULL,
  "messageType" "InquiryMessageType" NOT NULL DEFAULT 'TEXT',
  "body" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "sourceKind" TEXT NOT NULL DEFAULT 'LINE_MANAGER_HISTORY',
  "evidenceDigest" VARCHAR(64),
  "verifierVersion" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LineManagerObservedOutbound_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LineManagerObservedOutbound_text_only" CHECK ("messageType" = 'TEXT' AND length("body") > 0),
  CONSTRAINT "LineManagerObservedOutbound_source_kind" CHECK ("sourceKind" = 'LINE_MANAGER_HISTORY'),
  CONSTRAINT "LineManagerObservedOutbound_evidence_digest" CHECK ("evidenceDigest" IS NULL OR "evidenceDigest" ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX "LineManagerObservedOutbound_managerBotIdSnapshot_externalMessageId_key"
  ON "LineManagerObservedOutbound"("managerBotIdSnapshot", "externalMessageId");
CREATE INDEX "LineManagerObservedOutbound_lineUserId_sentAt_id_idx"
  ON "LineManagerObservedOutbound"("lineUserId", "sentAt", "id");
CREATE INDEX "LineManagerObservedOutbound_lineManagerChatId_idx"
  ON "LineManagerObservedOutbound"("lineManagerChatId");

ALTER TABLE "LineManagerObservedOutbound" ADD CONSTRAINT "LineManagerObservedOutbound_lineUserId_fkey"
  FOREIGN KEY ("lineUserId") REFERENCES "LineUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineManagerObservedOutbound" ADD CONSTRAINT "LineManagerObservedOutbound_lineManagerChatId_lineUserId_fkey"
  FOREIGN KEY ("lineManagerChatId", "lineUserId") REFERENCES "LineManagerChat"("id", "lineUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS is enabled as defense in depth; the Prisma server connection remains the table owner.
ALTER TABLE "LineManagerObservedOutbound" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "LineManagerObservedOutbound" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE "LineManagerObservedOutbound_id_seq" FROM PUBLIC, anon, authenticated, service_role;
