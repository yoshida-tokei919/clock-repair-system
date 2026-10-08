-- Task208D: permit one Payment to have allocations on distinct invoices.
DROP INDEX public."PaymentAllocation_paymentId_key";
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_invoiceId_key"
  ON public."PaymentAllocation"("paymentId", "invoiceId");
