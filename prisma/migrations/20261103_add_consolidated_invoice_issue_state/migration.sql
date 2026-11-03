-- Issue date is mutable; Task207C ConsolidatedInvoice audit rows are immutable.
CREATE TABLE public."ConsolidatedInvoiceIssueState" (
  "consolidatedInvoiceId" INTEGER NOT NULL PRIMARY KEY
    REFERENCES public."ConsolidatedInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "issuedDate" TIMESTAMP(3) NOT NULL
);

-- Preserve the date shown by already-issued PDFs, including historical bundles.
INSERT INTO public."ConsolidatedInvoiceIssueState" ("consolidatedInvoiceId", "issuedDate")
SELECT "id", "createdAt" FROM public."ConsolidatedInvoice";

-- Server-only Prisma access. The Data API roles receive no table privileges.
ALTER TABLE public."ConsolidatedInvoiceIssueState" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ConsolidatedInvoiceIssueState" FROM PUBLIC, anon, authenticated, service_role;
