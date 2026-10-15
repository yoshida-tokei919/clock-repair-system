-- No new table is created. Existing Prisma server access needs no new Data API GRANT.
ALTER TABLE "Customer" ADD COLUMN "invoiceRecipientCustomerId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "billingCustomerId" INTEGER;

CREATE INDEX "Customer_invoiceRecipientCustomerId_idx" ON "Customer"("invoiceRecipientCustomerId");
CREATE INDEX "Invoice_billingCustomerId_idx" ON "Invoice"("billingCustomerId");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_invoiceRecipientCustomerId_fkey"
  FOREIGN KEY ("invoiceRecipientCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billingCustomerId_fkey"
  FOREIGN KEY ("billingCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
