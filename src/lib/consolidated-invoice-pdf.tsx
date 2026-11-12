import type { InvoiceDocumentProps } from "@/components/pdf/InvoiceDocument";
import { displayIssuedDate } from "./document-issued-date";
import { renderInvoicePdfBuffer } from "./invoice-pdf-render";
import type { ConsolidatedPdfData } from "./consolidated-invoice-publication";

export function consolidatedInvoiceDocumentData(data: ConsolidatedPdfData): InvoiceDocumentProps["data"] {
  const { bundle } = data;
  const recipient = bundle.companyName.trim().replace(/\s*(御中|様)$/, "");
  if (!recipient) throw new Error("Missing group recipient");
  const hasDiscountSnapshots = bundle.sources.some(source => source.discountBasisAmount != null);
  return {
    invoiceNumber: `CI-${String(bundle.id).padStart(6, "0")}`,
    date: displayIssuedDate(bundle.issueState!.issuedDate),
    dueDate: data.dueDate?.replaceAll("-", "/") ?? "未確定",
    customer: { name: recipient, type: "business" },
    items: data.rows.map(row => ({ slipNumber: row.slipNumber, date: row.date.replaceAll("-", "/"), description: `${row.repairCount}点${hasDiscountSnapshots && row.discountRateBps != null ? ` / 割引${row.discountRateBps / 100}%` : ""}`, amount: hasDiscountSnapshots ? row.originalAmount : row.amount })),
    taxRate: 0.1,
    pricingTaxMode: "EXCLUSIVE",
    subtotalAmount: hasDiscountSnapshots ? data.subtotal : data.gross - data.tax,
    discountBasisAmount: hasDiscountSnapshots ? data.originalSubtotal : null,
    discountAmount: hasDiscountSnapshots ? data.discount : null,
    taxAmount: data.tax,
    shippingFeeAmount: hasDiscountSnapshots ? data.shipping : 0,
    grossTotalAmount: data.gross,
    historicalRefundCredits: (data.offsetCredits ?? []).map(row => ({ amount: row.amount,
      reference: `${row.sourceCustomerName} / ${row.reference}` })),
    bankInfo: "三井住友銀行　店番411\n普通 3602468\nヨシダ シュウヘイ",
  };
}

export async function renderConsolidatedInvoicePdf(data: ConsolidatedPdfData): Promise<Buffer> {
  return renderInvoicePdfBuffer(consolidatedInvoiceDocumentData(data));
}
