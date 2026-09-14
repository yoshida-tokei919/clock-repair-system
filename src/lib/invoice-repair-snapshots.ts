import { assertIntegerYen } from "./invoice-payment";

export type InvoiceRepairSnapshotInput = {
  id: number;
  inquiryNumber: string;
  deliveryNoteId: number | null;
  deliveryNote: { slipNumber: string; issuedDate: Date } | null;
  deliveryDateActual: Date | null;
  estimate: { items: Array<{ unitPrice: number; quantity: number }> } | null;
};

export function calculateInvoiceRepairSubtotal(repair: InvoiceRepairSnapshotInput) {
  return assertIntegerYen((repair.estimate?.items ?? []).reduce((sum, item) => {
    if (!Number.isSafeInteger(item.unitPrice) || !Number.isSafeInteger(item.quantity)) {
      throw new Error("請求明細には整数の単価と数量が必要です");
    }
    const amount = item.unitPrice * item.quantity;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(sum + amount)) {
      throw new Error("請求明細の金額が整数の安全範囲を超えています");
    }
    return sum + amount;
  }, 0));
}

export function calculateIssuedInvoiceAmounts(subtotal: number) {
  assertIntegerYen(subtotal);
  const taxAmount = Number(BigInt(subtotal) / BigInt(10));
  return { totalAmount: subtotal, taxAmount, grossTotalAmount: assertIntegerYen(subtotal + taxAmount) };
}

export function hasConsistentInvoiceSnapshots(invoice: {
  totalAmount: number;
  taxAmount: number;
  grossTotalAmount: number;
  repairSnapshots: { subtotalAmount: number }[];
}) {
  return invoice.repairSnapshots.length > 0
    && invoice.grossTotalAmount === invoice.totalAmount + invoice.taxAmount
    && invoice.repairSnapshots.reduce((sum, row) => sum + row.subtotalAmount, 0)
      === invoice.totalAmount;
}

export function buildInvoiceRepairSnapshotData(repairs: InvoiceRepairSnapshotInput[]) {
  return repairs.map((repair) => ({
    repairId: repair.id,
    inquiryNumber: repair.inquiryNumber,
    deliveryNoteId: repair.deliveryNoteId,
    deliverySlipNumber: repair.deliveryNote?.slipNumber ?? null,
    deliveryIssuedDate: repair.deliveryNote?.issuedDate ?? null,
    deliveryDateActual: repair.deliveryDateActual,
    subtotalAmount: calculateInvoiceRepairSubtotal(repair),
  }));
}
