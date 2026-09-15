import crypto from "crypto";

export function buildInvoicePdfStorageKey(invoiceId: number, pdfFileId: number): string {
  return `invoices/${invoiceId}/${pdfFileId}-${crypto.randomUUID()}.pdf`;
}
