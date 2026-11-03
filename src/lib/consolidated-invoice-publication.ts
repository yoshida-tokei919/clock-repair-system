import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { calculateInvoicePaymentSummary } from "./invoice-payment";
import { formatIssuedDate } from "./document-issued-date";

export const consolidatedBundleInclude = {
  issueState: true,
  sources: { include: { deliveryNotes: true }, orderBy: { id: "asc" } },
} satisfies Prisma.ConsolidatedInvoiceInclude;

export type ConsolidatedBundle = Prisma.ConsolidatedInvoiceGetPayload<{ include: typeof consolidatedBundleInclude }>;

export const consolidatedDeliveryNotePdfFileName = (id: number) => `consolidated_invoice_${id}_delivery_notes.pdf`;
export const isConsolidatedDeliveryNotePdf = (id: number, fileName: string) =>
  fileName === consolidatedDeliveryNotePdfFileName(id);

type NoteSource = { totalAmount: number; taxAmount: number; shippingFeeAmount: number; grossTotalAmount: number;
  deliveryNotes: { slipNumber: string | null; issuedDate: Date | null; repairCount: number; subtotalAmount: number | null }[] };

export function consolidatedDeliveryNoteRows(bundle: { grossTotalAmount: number; sources: readonly NoteSource[] }) {
  if (bundle.sources.length < 2) throw new Error("Incomplete consolidated invoice");
  const rows: { slipNumber: string; date: string; repairCount: number; amount: number }[] = [];
  for (const source of bundle.sources) {
    const { totalAmount: net, taxAmount: tax, shippingFeeAmount: shipping, grossTotalAmount: gross } = source;
    if (![net, tax, shipping, gross].every(value => Number.isSafeInteger(value) && value >= 0) || gross !== net + tax + shipping ||
        source.deliveryNotes.length === 0) throw new Error("Invalid source invoice snapshot");
    const notes = source.deliveryNotes;
    if (notes.some(note => !note.slipNumber?.trim() || !note.issuedDate || !Number.isFinite(note.issuedDate.getTime()) ||
      !Number.isSafeInteger(note.repairCount) || note.repairCount <= 0 ||
      !Number.isSafeInteger(note.subtotalAmount) || (note.subtotalAmount ?? -1) < 0) ||
      notes.reduce((sum, note) => sum + note.subtotalAmount!, 0) !== net) throw new Error("Incomplete delivery note snapshot");
    // Cumulative allocation gives deterministic rounding and assigns every sourced yen.
    let cumulativeNet = 0, allocated = 0;
    for (const [index, note] of notes.entries()) {
      cumulativeNet += note.subtotalAmount!;
      const cumulativeGross = net === 0
        ? Number(BigInt(gross) * BigInt(index + 1) / BigInt(notes.length))
        : Number(BigInt(gross) * BigInt(cumulativeNet) / BigInt(net));
      const amount = cumulativeGross - allocated;
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid delivery note allocation");
      allocated = cumulativeGross;
      rows.push({ slipNumber: note.slipNumber!.trim(), date: formatIssuedDate(note.issuedDate!), repairCount: note.repairCount, amount });
    }
    if (allocated !== gross) throw new Error("Delivery note total mismatch");
  }
  if (rows.reduce((sum, row) => sum + row.amount, 0) !== bundle.grossTotalAmount) throw new Error("Consolidated total mismatch");
  return rows;
}

type SnapshotSource = {
  invoiceId: number; invoiceNumber: string; sourceCustomerId: number; issuedDate: Date;
  totalAmount: number; taxAmount: number; shippingFeeAmount: number; grossTotalAmount: number;
  invoice: { id: number; invoiceNumber: string; customerId: number; issuedDate: Date;
    totalAmount: number; taxAmount: number; shippingFeeAmount: number; grossTotalAmount: number };
};

export function hasConsolidatedSourceSnapshotIntegrity(bundle: { grossTotalAmount: number; sources: SnapshotSource[] }) {
  return bundle.sources.length >= 2 &&
    bundle.sources.reduce((sum, source) => sum + source.grossTotalAmount, 0) === bundle.grossTotalAmount &&
    bundle.sources.every(source => source.invoice.id === source.invoiceId &&
      source.invoice.invoiceNumber === source.invoiceNumber &&
      source.invoice.customerId === source.sourceCustomerId &&
      source.invoice.issuedDate.getTime() === source.issuedDate.getTime() &&
      source.invoice.totalAmount === source.totalAmount && source.invoice.taxAmount === source.taxAmount &&
      source.invoice.shippingFeeAmount === source.shippingFeeAmount &&
      source.invoice.grossTotalAmount === source.grossTotalAmount &&
      source.grossTotalAmount > 0 && source.grossTotalAmount === source.totalAmount + source.taxAmount + source.shippingFeeAmount);
}

export function buildConsolidatedPdfData(bundle: ConsolidatedBundle, dueDates: (Date | null)[]) {
  if (!bundle.issueState || bundle.sources.length < 2 || dueDates.length !== bundle.sources.length) throw new Error("Incomplete consolidated invoice");
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
  const rows = consolidatedDeliveryNoteRows(bundle);
  return { bundle, subtotal, tax, shipping, gross, dueDate, rows };
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
