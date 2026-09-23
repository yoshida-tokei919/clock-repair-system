-- LINE message classification is derived metadata. InquiryMessage remains the immutable source record.
CREATE TYPE "InquiryMessageClassificationScope" AS ENUM ('WATCHES', 'COMMON', 'UNASSIGNED');
CREATE TYPE "InquiryMessageClassificationSource" AS ENUM ('AI', 'MANUAL');

-- Composite unique keys allow the database to prove that message/watch links
-- stay inside the same Inquiry, not only the application layer.
CREATE UNIQUE INDEX "InquiryMessage_id_inquiryId_key"
  ON "InquiryMessage"("id", "inquiryId");
CREATE UNIQUE INDEX "InquiryWatch_id_inquiryId_key"
  ON "InquiryWatch"("id", "inquiryId");

CREATE TABLE "InquiryMessageClassification" (
  "id" SERIAL NOT NULL,
  "inquiryMessageId" INTEGER NOT NULL,
  "inquiryId" INTEGER NOT NULL,
  "scope" "InquiryMessageClassificationScope" NOT NULL,
  "source" "InquiryMessageClassificationSource" NOT NULL,
  "confidence" "InquiryAiConfidence",
  "evidence" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InquiryMessageClassification_manual_confirmation_check" CHECK (
    ("source" = 'MANUAL' AND "confirmedAt" IS NOT NULL)
    OR
    ("source" = 'AI' AND "confirmedAt" IS NULL)
  ),
  CONSTRAINT "InquiryMessageClassification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InquiryMessageWatchLink" (
  "classificationId" INTEGER NOT NULL,
  "inquiryWatchId" INTEGER NOT NULL,
  "inquiryId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InquiryMessageWatchLink_pkey" PRIMARY KEY ("classificationId", "inquiryWatchId")
);

CREATE UNIQUE INDEX "InquiryMessageClassification_inquiryMessageId_key"
  ON "InquiryMessageClassification"("inquiryMessageId");
CREATE UNIQUE INDEX "InquiryMessageClassification_id_inquiryId_key"
  ON "InquiryMessageClassification"("id", "inquiryId");
CREATE UNIQUE INDEX "InquiryMessageClassification_inquiryMessageId_inquiryId_key"
  ON "InquiryMessageClassification"("inquiryMessageId", "inquiryId");
CREATE INDEX "InquiryMessageClassification_scope_source_idx"
  ON "InquiryMessageClassification"("scope", "source");
CREATE INDEX "InquiryMessageWatchLink_inquiryWatchId_idx"
  ON "InquiryMessageWatchLink"("inquiryWatchId");

ALTER TABLE "InquiryMessageClassification"
  ADD CONSTRAINT "InquiryMessageClassification_message_inquiry_fkey"
  FOREIGN KEY ("inquiryMessageId", "inquiryId")
  REFERENCES "InquiryMessage"("id", "inquiryId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InquiryMessageWatchLink"
  ADD CONSTRAINT "InquiryMessageWatchLink_classification_inquiry_fkey"
  FOREIGN KEY ("classificationId", "inquiryId")
  REFERENCES "InquiryMessageClassification"("id", "inquiryId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InquiryMessageWatchLink"
  ADD CONSTRAINT "InquiryMessageWatchLink_watch_inquiry_fkey"
  FOREIGN KEY ("inquiryWatchId", "inquiryId")
  REFERENCES "InquiryWatch"("id", "inquiryId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Human-confirmed classification is authoritative. Even future AI code cannot
-- replace MANUAL with AI at the database layer.
CREATE FUNCTION "preventInquiryMessageClassificationManualOverwrite"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."source" = 'MANUAL' AND NEW."source" = 'AI' THEN
    RAISE EXCEPTION 'manual Inquiry message classification cannot be overwritten by AI';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InquiryMessageClassification_prevent_manual_ai_overwrite"
BEFORE UPDATE ON "InquiryMessageClassification"
FOR EACH ROW
EXECUTE FUNCTION "preventInquiryMessageClassificationManualOverwrite"();

-- These tables are server-internal derived metadata and are not exposed through
-- the Supabase Data API to browser roles.
REVOKE ALL PRIVILEGES ON TABLE "InquiryMessageClassification" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE "InquiryMessageWatchLink" FROM anon, authenticated;
