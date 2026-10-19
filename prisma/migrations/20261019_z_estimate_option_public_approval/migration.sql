ALTER TABLE "EstimatePdfFile" ADD COLUMN "optionSourceHashes" JSONB;

CREATE TABLE "EstimateOptionApproval" (
  "id" SERIAL NOT NULL,
  "repairId" INTEGER NOT NULL,
  "estimateDocumentId" INTEGER NOT NULL,
  "pdfFileId" INTEGER NOT NULL,
  "pdfVersion" INTEGER NOT NULL,
  "optionSetId" INTEGER NOT NULL,
  "optionSourceHash" TEXT NOT NULL,
  "planChoiceId" INTEGER,
  "addOnChoiceIds" JSONB NOT NULL,
  "lineSnapshot" JSONB NOT NULL,
  "approverName" TEXT NOT NULL,
  "approvalMethod" TEXT NOT NULL DEFAULT 'public-share',
  "grossAmount" INTEGER NOT NULL,
  "taxAmount" INTEGER NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EstimateOptionApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EstimateOptionApproval_repairId_key" ON "EstimateOptionApproval"("repairId");
CREATE INDEX "EstimateOptionApproval_estimateDocumentId_pdfFileId_idx" ON "EstimateOptionApproval"("estimateDocumentId", "pdfFileId");
ALTER TABLE "EstimateOptionApproval" ADD CONSTRAINT "EstimateOptionApproval_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EstimateOptionApproval" ADD CONSTRAINT "EstimateOptionApproval_estimateDocumentId_fkey" FOREIGN KEY ("estimateDocumentId") REFERENCES "EstimateDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EstimateOptionApproval" ADD CONSTRAINT "EstimateOptionApproval_pdfFileId_fkey" FOREIGN KEY ("pdfFileId") REFERENCES "EstimatePdfFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_estimate_option_approval_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EstimateOptionApproval is immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "EstimateOptionApproval_immutable"
BEFORE UPDATE OR DELETE ON "EstimateOptionApproval"
FOR EACH ROW EXECUTE FUNCTION prevent_estimate_option_approval_change();

-- Approval history is private server state; no Data API grants are added.
REVOKE ALL ON TABLE public."EstimateOptionApproval" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."EstimateOptionApproval_id_seq" FROM PUBLIC, anon, authenticated, service_role;
