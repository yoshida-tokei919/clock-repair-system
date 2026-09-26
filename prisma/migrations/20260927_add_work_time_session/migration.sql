CREATE TYPE public."WorkTimeActivityType" AS ENUM (
  'REPAIR', 'ESTIMATE', 'INTAKE', 'INQUIRY', 'CUSTOMER_CONTACT',
  'PARTS_ORDER', 'SHIPPING', 'ADMIN', 'OTHER'
);

CREATE TABLE public."WorkTimeSession" (
  "id" SERIAL NOT NULL,
  "activityType" public."WorkTimeActivityType" NOT NULL,
  "repairId" INTEGER,
  "inquiryId" INTEGER,
  "orderRequestId" INTEGER,
  "workLabelSnapshot" TEXT,
  "contextSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  "contextSnapshot" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "originalStartedAt" TIMESTAMP(3),
  "originalEndedAt" TIMESTAMP(3),
  "adjustedAt" TIMESTAMP(3),
  "adjustmentReason" TEXT,
  "invalidatedAt" TIMESTAMP(3),
  "invalidationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkTimeSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkTimeSession_endedAt_check" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt"),
  CONSTRAINT "WorkTimeSession_invalidated_closed_check" CHECK ("invalidatedAt" IS NULL OR "endedAt" IS NOT NULL)
);

CREATE INDEX "WorkTimeSession_startedAt_idx" ON public."WorkTimeSession"("startedAt");
CREATE INDEX "WorkTimeSession_activityType_startedAt_idx" ON public."WorkTimeSession"("activityType", "startedAt");
CREATE INDEX "WorkTimeSession_repairId_startedAt_idx" ON public."WorkTimeSession"("repairId", "startedAt");
CREATE INDEX "WorkTimeSession_inquiryId_startedAt_idx" ON public."WorkTimeSession"("inquiryId", "startedAt");
CREATE INDEX "WorkTimeSession_orderRequestId_startedAt_idx" ON public."WorkTimeSession"("orderRequestId", "startedAt");
CREATE UNIQUE INDEX "WorkTimeSession_single_active_idx" ON public."WorkTimeSession" ((1))
  WHERE "endedAt" IS NULL AND "invalidatedAt" IS NULL;

ALTER TABLE public."WorkTimeSession" ADD CONSTRAINT "WorkTimeSession_repairId_fkey"
  FOREIGN KEY ("repairId") REFERENCES public."Repair"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE public."WorkTimeSession" ADD CONSTRAINT "WorkTimeSession_inquiryId_fkey"
  FOREIGN KEY ("inquiryId") REFERENCES public."Inquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE public."WorkTimeSession" ADD CONSTRAINT "WorkTimeSession_orderRequestId_fkey"
  FOREIGN KEY ("orderRequestId") REFERENCES public."OrderRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public."WorkTimeSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."WorkTimeSession" FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."WorkTimeSession_id_seq" FROM anon, authenticated, service_role;
