import crypto from "crypto";

export function buildEstimatePdfStorageKey(params: {
  estimateDocumentId: number;
  pdfFileId: number;
}) {
  return `estimates/${params.estimateDocumentId}/${params.pdfFileId}-${crypto.randomUUID()}.pdf`;
}
