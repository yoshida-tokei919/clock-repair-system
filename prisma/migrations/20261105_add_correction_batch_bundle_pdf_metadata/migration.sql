ALTER TABLE "InvoiceCorrectionBatch"
  ADD COLUMN "bundlePdfStorageKey" TEXT,
  ADD COLUMN "bundlePdfHash" TEXT,
  ADD COLUMN "bundlePdfFileSize" INTEGER;

ALTER TABLE "InvoiceCorrectionBatch"
  ADD CONSTRAINT "InvoiceCorrectionBatch_bundle_pdf_metadata_complete" CHECK (
    ("bundlePdfStorageKey" IS NULL AND "bundlePdfHash" IS NULL AND "bundlePdfFileSize" IS NULL)
    OR ("bundlePdfStorageKey" IS NOT NULL AND length("bundlePdfStorageKey") > 0
      AND "bundlePdfHash" IS NOT NULL AND "bundlePdfHash" ~ '^[0-9a-f]{64}$'
      AND "bundlePdfFileSize" IS NOT NULL AND "bundlePdfFileSize" > 0)
  ),
  ADD CONSTRAINT "InvoiceCorrectionBatch_ready_bundle_pdf_metadata" CHECK (
    "status" NOT IN ('ready', 'activated')
    OR ("bundlePdfStorageKey" IS NOT NULL AND "bundlePdfHash" IS NOT NULL AND "bundlePdfFileSize" IS NOT NULL)
  );
