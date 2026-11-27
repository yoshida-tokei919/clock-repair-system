import { isIssuedOptionPdfCurrent, issuedOptionSourceHash } from "./estimate-options";

// Old PDFs may be opened, but only a matching issuance hash publishes live HTML.
export function hasIssuedPdf(repair: any): boolean {
  const document = repair.estimateDocument;
  const pdf = document?.currentPdfFile;
  return Boolean(document && repair.customerId === document.customerId && pdf &&
    pdf.estimateDocumentId === document.id && pdf.status === "current" && pdf.storageKey && pdf.hash && pdf.fileSize);
}

export function hasCurrentPublishedEstimate(repair: any): boolean {
  const document = repair.estimateDocument;
  const pdf = document?.currentPdfFile;
  return Boolean(hasIssuedPdf(repair) && repair.estimate &&
    isIssuedOptionPdfCurrent(pdf, document.id, repair.id, pdf.id, issuedOptionSourceHash(document, repair)));
}

export type PublishedApprovedLine = {
  name: string;
  lineType: "LABOR" | "PART" | null;
  quantity: number;
  quantityUnit: string | null;
  unitPrice: number;
};

export type PublishedApprovedEstimate = {
  lines: PublishedApprovedLine[];
  grossAmount: number;
  taxAmount: number;
};

// Approval rewrites the editable Estimate, so its current source hash no longer
// matches the issued PDF. Read the immutable approval snapshot, not draft lines.
export function publishedApprovedEstimate(repair: any): PublishedApprovedEstimate | null {
  const approval = repair.estimateOptionApproval;
  const document = repair.estimateDocument;
  const pdf = document?.currentPdfFile;
  if (!approval || repair.approvalStatus !== "approved" || !hasIssuedPdf(repair) ||
      approval.repairId !== repair.id || approval.estimateDocumentId !== document.id ||
      approval.pdfFileId !== pdf.id ||
      typeof approval.optionSourceHash !== "string" || !approval.optionSourceHash ||
      !pdf.optionSourceHashes || typeof pdf.optionSourceHashes !== "object" ||
      Array.isArray(pdf.optionSourceHashes) ||
      pdf.optionSourceHashes[String(repair.id)] !== approval.optionSourceHash ||
      !Number.isSafeInteger(approval.grossAmount) || approval.grossAmount < 0 ||
      !Number.isSafeInteger(approval.taxAmount) || approval.taxAmount < 0) return null;

  const snapshot = approval.lineSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
      !Array.isArray(snapshot.commonLines) || !Array.isArray(snapshot.selectedLines) ||
      snapshot.commonLines.length + snapshot.selectedLines.length > 100) return null;

  const parseLine = (line: any, selected: boolean): PublishedApprovedLine | null => {
    if (!line || typeof line !== "object") return null;
    const rawName = selected ? (line.displayNameSnapshot || line.itemNameSnapshot) :
      (repair.customer.type === "individual" ? line.b2cDisplayNameSnapshot || line.itemName : line.itemName);
    const name = typeof rawName === "string" ? rawName.trim() : "";
    const rawType = selected ? line.lineType : line.type === "labor" ? "LABOR" : line.type === "part" ? "PART" : null;
    if (!name || !Number.isSafeInteger(line.quantity) || line.quantity < 1 ||
        !Number.isSafeInteger(line.unitPrice) || line.unitPrice < 0 ||
        !Number.isSafeInteger(line.quantity * line.unitPrice)) return null;
    return { name, lineType: rawType === "LABOR" || rawType === "PART" ? rawType : null,
      quantity: line.quantity, quantityUnit: typeof line.quantityUnit === "string" ? line.quantityUnit : null,
      unitPrice: line.unitPrice };
  };
  const lines = [
    ...snapshot.commonLines.map((line: unknown) => parseLine(line, false)),
    ...snapshot.selectedLines.map((line: unknown) => parseLine(line, true)),
  ];
  if (!lines.length || lines.some(line => line === null)) return null;
  return { lines: lines as PublishedApprovedLine[],
    grossAmount: approval.grossAmount, taxAmount: approval.taxAmount };
}
