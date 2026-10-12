-- Task206G1: immutable AI communication briefs for Customer / Repair communication surfaces.
CREATE TABLE public."CommunicationAiBrief" (
  "id" SERIAL PRIMARY KEY,
  "customerId" INTEGER NOT NULL,
  "repairId" INTEGER,
  "inputFingerprint" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "modelProvider" TEXT NOT NULL,
  "modelName" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "summary" TEXT,
  "unresolvedItems" JSONB,
  "customerRequirements" JSONB,
  "decisions" JSONB,
  "replyDraft" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunicationAiBrief_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES public."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CommunicationAiBrief_repair_customer_fkey"
    FOREIGN KEY ("repairId", "customerId") REFERENCES public."Repair"("id", "customerId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CommunicationAiBrief_dedupeKey_key"
  ON public."CommunicationAiBrief"("dedupeKey");
CREATE INDEX "CommunicationAiBrief_customerId_createdAt_idx"
  ON public."CommunicationAiBrief"("customerId", "createdAt");
CREATE INDEX "CommunicationAiBrief_repairId_createdAt_idx"
  ON public."CommunicationAiBrief"("repairId", "createdAt");
CREATE INDEX "CommunicationAiBrief_inputFingerprint_idx"
  ON public."CommunicationAiBrief"("inputFingerprint");

-- Server-internal only. Prisma/direct Postgres access is the application path.
ALTER TABLE public."CommunicationAiBrief" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."CommunicationAiBrief" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."CommunicationAiBrief_id_seq" FROM PUBLIC, anon, authenticated, service_role;
