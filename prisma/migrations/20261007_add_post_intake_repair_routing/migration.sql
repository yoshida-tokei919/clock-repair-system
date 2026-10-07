-- Direct post-intake routing coexists with InquiryWatch-derived classification.
CREATE TABLE public."InquiryMessagePostIntakeRouting" (
  "id" SERIAL NOT NULL,
  "inquiryMessageId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "source" public."InquiryMessageClassificationSource" NOT NULL,
  "confidence" public."InquiryAiConfidence",
  "evidence" TEXT,
  "hasGeneralContent" BOOLEAN NOT NULL DEFAULT false,
  "hasUnassignedContent" BOOLEAN NOT NULL DEFAULT false,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InquiryMessagePostIntakeRouting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InquiryMessagePostIntakeRouting_source_check" CHECK (
    ("source" = 'MANUAL' AND "confirmedAt" IS NOT NULL AND "confidence" IS NULL AND "evidence" IS NULL)
    OR ("source" = 'AI' AND "confirmedAt" IS NULL)
  )
);

CREATE TABLE public."InquiryMessagePostIntakeRepairLink" (
  "routingId" INTEGER NOT NULL,
  "repairId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InquiryMessagePostIntakeRepairLink_pkey" PRIMARY KEY ("routingId", "repairId")
);

CREATE UNIQUE INDEX "InquiryMessagePostIntakeRouting_inquiryMessageId_key"
  ON public."InquiryMessagePostIntakeRouting"("inquiryMessageId");
CREATE UNIQUE INDEX "InquiryMessagePostIntakeRouting_id_customerId_key"
  ON public."InquiryMessagePostIntakeRouting"("id", "customerId");
CREATE INDEX "InquiryMessagePostIntakeRouting_customerId_idx"
  ON public."InquiryMessagePostIntakeRouting"("customerId");
CREATE UNIQUE INDEX "Repair_id_customerId_key" ON public."Repair"("id", "customerId");
CREATE INDEX "InquiryMessagePostIntakeRepairLink_repairId_customerId_idx"
  ON public."InquiryMessagePostIntakeRepairLink"("repairId", "customerId");

ALTER TABLE public."InquiryMessagePostIntakeRouting" ADD CONSTRAINT "InquiryMessagePostIntakeRouting_inquiryMessageId_fkey"
  FOREIGN KEY ("inquiryMessageId") REFERENCES public."InquiryMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."InquiryMessagePostIntakeRouting" ADD CONSTRAINT "InquiryMessagePostIntakeRouting_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES public."Customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."InquiryMessagePostIntakeRepairLink" ADD CONSTRAINT "InquiryMessagePostIntakeRepairLink_routingId_customerId_fkey"
  FOREIGN KEY ("routingId", "customerId") REFERENCES public."InquiryMessagePostIntakeRouting"("id", "customerId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."InquiryMessagePostIntakeRepairLink" ADD CONSTRAINT "InquiryMessagePostIntakeRepairLink_repairId_customerId_fkey"
  FOREIGN KEY ("repairId", "customerId") REFERENCES public."Repair"("id", "customerId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A future AI caller cannot demote a confirmed manual routing, even by mistake.
CREATE FUNCTION public."preventInquiryMessagePostIntakeManualOverwrite"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."source" = 'MANUAL' AND NEW."source" = 'AI' THEN
    RAISE EXCEPTION 'manual post-intake routing cannot be overwritten by AI';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER "InquiryMessagePostIntakeRouting_prevent_manual_ai_overwrite"
BEFORE UPDATE ON public."InquiryMessagePostIntakeRouting"
FOR EACH ROW EXECUTE FUNCTION public."preventInquiryMessagePostIntakeManualOverwrite"();

-- Prisma server connection only. No Data API policy or grant.
ALTER TABLE public."InquiryMessagePostIntakeRouting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."InquiryMessagePostIntakeRepairLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."InquiryMessagePostIntakeRouting", public."InquiryMessagePostIntakeRepairLink"
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."InquiryMessagePostIntakeRouting_id_seq"
  FROM PUBLIC, anon, authenticated, service_role;
