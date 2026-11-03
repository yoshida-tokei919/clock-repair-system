import type { InvoiceDocumentProps } from "@/components/pdf/InvoiceDocument";
import { displayIssuedDate } from "./document-issued-date";
import { renderInvoicePdfBuffer } from "./invoice-pdf-render";
import type { ConsolidatedPdfData } from "./consolidated-invoice-publication";

export function consolidatedInvoiceDocumentData(data: ConsolidatedPdfData): InvoiceDocumentProps["data"] {
  const { bundle } = data;
  const recipient = bundle.companyName.trim().replace(/\s*(御中|様)$/, "");
  if (!recipient) throw new Error("Missing group recipient");
  return {
    invoiceNumber: `CI-${String(bundle.id).padStart(6, "0")}`,
    date: displayIssuedDate(bundle.issueState!.issuedDate),
    dueDate: data.dueDate?.replaceAll("-", "/") ?? "未確定",
    customer: { name: recipient, type: "business" },
    items: data.rows.map(row => ({ slipNumber: row.slipNumber, date: row.date.replaceAll("-", "/"), description: `${row.repairCount}点`, amount: row.amount })),
    taxRate: 0.1,
    pricingTaxMode: "EXCLUSIVE",
    subtotalAmount: data.gross - data.tax,
    taxAmount: data.tax,
    shippingFeeAmount: 0,
    grossTotalAmount: data.gross,
    bankInfo: "三井住友銀行　店番411\n普通 3602468\nヨシダ シュウヘイ",
  };
}

export async function renderConsolidatedInvoicePdf(data: ConsolidatedPdfData): Promise<Buffer> {
  return renderInvoicePdfBuffer(consolidatedInvoiceDocumentData(data));
}
