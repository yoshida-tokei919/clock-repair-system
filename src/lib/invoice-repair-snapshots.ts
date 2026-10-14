import { assertIntegerYen } from "./invoice-payment";

export type InvoiceRepairSnapshotInput = {
  id: number;
  inquiryNumber: string;
  deliveryNoteId: number | null;
  deliveryNote: { slipNumber: string; issuedDate: Date; shippingFee: number | null } | null;
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

export function calculateIssuedInvoiceAmounts(subtotal: number, shippingFeeAmount = 0) {
  assertIntegerYen(subtotal);
  assertIntegerYen(shippingFeeAmount);
  const taxAmount = Number(BigInt(subtotal) / BigInt(10));
  return { totalAmount: subtotal, taxAmount, shippingFeeAmount,
    grossTotalAmount: assertIntegerYen(subtotal + taxAmount + shippingFeeAmount) };
}

export function aggregateDeliveryShipping(repairs: readonly InvoiceRepairSnapshotInput[]) {
  const fees = new Map<number, number>();
  for (const repair of repairs) {
    if (repair.deliveryNoteId === null) continue;
    const fee = repair.deliveryNote?.shippingFee;
    if (fee === null || fee === undefined) {
      throw new Error("納品書の送料が未確定です。先に納品書で送料を確定してください");
    }
    assertIntegerYen(fee);
    const previous = fees.get(repair.deliveryNoteId);
    if (previous !== undefined && previous !== fee) throw new Error("同じ納品書の送料が一致しません");
    fees.set(repair.deliveryNoteId, fee);
  }
  return assertIntegerYen([...fees.values()].reduce((sum, fee) => sum + fee, 0));
}

export function hasConsistentInvoiceSnapshots(invoice: {
  totalAmount: number;
  taxAmount: number;
  shippingFeeAmount?: number;
  grossTotalAmount: number;
  repairSnapshots: { subtotalAmount: number; deliveryNoteId?: number | null; deliveryShippingFee?: number }[];
}) {
  if (!invoice.repairSnapshots.length) return false;
  try {
    assertIntegerYen(invoice.totalAmount);
    assertIntegerYen(invoice.taxAmount);
    assertIntegerYen(invoice.shippingFeeAmount ?? 0);
    assertIntegerYen(invoice.grossTotalAmount);
    const fees = new Map<number, number>();
    for (const row of invoice.repairSnapshots) {
      assertIntegerYen(row.subtotalAmount);
      const fee = row.deliveryShippingFee ?? 0;
      assertIntegerYen(fee);
      if (row.deliveryNoteId == null) { if (fee !== 0) return false; continue; }
      const previous = fees.get(row.deliveryNoteId);
      if (previous !== undefined && previous !== fee) return false;
      fees.set(row.deliveryNoteId, fee);
    }
    const shipping = [...fees.values()].reduce((sum, fee) => sum + fee, 0);
    return invoice.taxAmount === Number(BigInt(invoice.totalAmount) / BigInt(10))
      && shipping === (invoice.shippingFeeAmount ?? 0)
      && invoice.grossTotalAmount === invoice.totalAmount + invoice.taxAmount + shipping
      && invoice.repairSnapshots.reduce((sum, row) => sum + row.subtotalAmount, 0) === invoice.totalAmount;
  } catch { return false; }
}

export function buildInvoiceRepairSnapshotData(repairs: InvoiceRepairSnapshotInput[]) {
  aggregateDeliveryShipping(repairs);
  return repairs.map((repair) => ({
    repairId: repair.id,
    inquiryNumber: repair.inquiryNumber,
    deliveryNoteId: repair.deliveryNoteId,
    deliverySlipNumber: repair.deliveryNote?.slipNumber ?? null,
    deliveryIssuedDate: repair.deliveryNote?.issuedDate ?? null,
    deliveryDateActual: repair.deliveryDateActual,
    subtotalAmount: calculateInvoiceRepairSubtotal(repair),
    deliveryShippingFee: repair.deliveryNote?.shippingFee ?? 0,
  }));
}
