import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { calculateInvoicePaymentSummary } from "./invoice-payment";

export const consolidatedBundleInclude = {
  sources: { include: { deliveryNotes: true }, orderBy: { id: "asc" } },
} satisfies Prisma.ConsolidatedInvoiceInclude;

export type ConsolidatedBundle = Prisma.ConsolidatedInvoiceGetPayload<{ include: typeof consolidatedBundleInclude }>;

export function buildConsolidatedPdfData(bundle: ConsolidatedBundle, dueDates: (Date | null)[]) {
  if (bundle.sources.length < 2 || dueDates.length !== bundle.sources.length) throw new Error("Incomplete consolidated invoice");
  let subtotal = 0, tax = 0, shipping = 0, gross = 0;
  for (const source of bundle.sources) {
    if (source.totalAmount < 0 || source.taxAmount < 0 || source.shippingFeeAmount < 0 ||
        source.grossTotalAmount !== source.totalAmount + source.taxAmount + source.shippingFeeAmount) {
      throw new Error("Invalid source invoice snapshot");
    }
    subtotal += source.totalAmount;
    tax += source.taxAmount;
    shipping += source.shippingFeeAmount;
    gross += source.grossTotalAmount;
  }
  if (!Number.isSafeInteger(gross) || gross !== bundle.grossTotalAmount) throw new Error("Consolidated total mismatch");
  const dateValues = dueDates.map(date => date?.toISOString().slice(0, 10) ?? null);
  const dueDate = dateValues[0] && dateValues.every(date => date === dateValues[0]) ? dateValues[0] : null;
  return { bundle, subtotal, tax, shipping, gross, dueDate };
}

export type ConsolidatedPdfData = ReturnType<typeof buildConsolidatedPdfData>;

type PaymentCheckInvoice = {
  id: number; invoiceNumber: string; customerId: number; grossTotalAmount: number; status: string;
  paymentAllocations: (Parameters<typeof calculateInvoicePaymentSummary>[1][number] &
    { payment: { customerId: number } })[];
};

export function assertConsolidatedSourceUnpaid(
  source: { invoiceId: number; invoiceNumber: string; sourceCustomerId: number; grossTotalAmount: number },
  invoice: PaymentCheckInvoice | undefined,
) {
  if (!invoice || invoice.id !== source.invoiceId || invoice.invoiceNumber !== source.invoiceNumber ||
      invoice.customerId !== source.sourceCustomerId || invoice.grossTotalAmount !== source.grossTotalAmount ||
      invoice.status !== "issued" || invoice.paymentAllocations.some(allocation =>
        allocation.payment.customerId !== invoice.customerId || ["PENDING", "SUCCEEDED"].includes(allocation.payment.status) ||
        allocation.payment.refunds?.some(refund => refund.status === "PENDING"))) {
    throw new Error("元請求書の入金・状態を確認できません");
  }
  const summary = calculateInvoicePaymentSummary(invoice, invoice.paymentAllocations);
  if (summary.outstandingBalance !== source.grossTotalAmount || summary.invoiceRefundPendingAmount !== 0) {
    throw new Error("元請求書に入金または返金があります");
  }
}

export function newConsolidatedShareToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function validConsolidatedShareToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function isCurrentConsolidatedPdf(row: {
  status: string; storageKey: string | null; hash: string | null; fileSize: number | null;
} | null): row is { status: string; storageKey: string; hash: string; fileSize: number } {
  return !!row && row.status === "current" && !!row.storageKey && !!row.hash && !!row.fileSize && row.fileSize > 0;
}
