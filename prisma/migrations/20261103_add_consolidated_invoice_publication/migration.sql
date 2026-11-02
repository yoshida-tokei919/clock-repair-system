-- Delivery metadata only. Task207C audit tables remain immutable.
CREATE TABLE public."ConsolidatedInvoicePublication" (
  "id" SERIAL PRIMARY KEY,
  "consolidatedInvoiceId" INTEGER NOT NULL UNIQUE REFERENCES public."ConsolidatedInvoice"("id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'current')),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" = 1),
  "publicToken" TEXT NOT NULL UNIQUE CHECK (length("publicToken") >= 43),
  "storageKey" TEXT,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
  "fileSize" INTEGER CHECK ("fileSize" IS NULL OR "fileSize" > 0),
  "hash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "ConsolidatedInvoicePublication_ready_complete" CHECK (
    ("status" = 'draft' AND "storageKey" IS NULL AND "fileSize" IS NULL AND "hash" IS NULL AND "publishedAt" IS NULL)
    OR ("status" = 'current' AND "storageKey" IS NOT NULL AND "fileSize" IS NOT NULL AND "hash" IS NOT NULL AND "publishedAt" IS NOT NULL)
  )
);
ALTER TABLE public."ConsolidatedInvoicePublication" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ConsolidatedInvoicePublication" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."ConsolidatedInvoicePublication_id_seq" FROM PUBLIC, anon, authenticated, service_role;
