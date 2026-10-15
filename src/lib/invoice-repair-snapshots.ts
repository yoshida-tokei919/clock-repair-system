import { assertIntegerYen } from "./invoice-payment";
import { calculateTaxableAmounts, sumCustomerLines, type PricingTaxMode } from "./pricing-tax";

export type InvoiceRepairSnapshotInput = {
  id: number;
  inquiryNumber: string;
  deliveryNoteId: number | null;
  deliveryNote: { slipNumber: string; issuedDate: Date; shippingFee: number | null } | null;
  deliveryDateActual: Date | null;
  estimate: { pricingTaxMode?: string; items: Array<{ unitPrice: number; quantity: number }> } | null;
};

// Sum of saved customer-facing line amounts: net in EXCLUSIVE, final gross in INCLUSIVE.
export function calculateInvoiceRepairSubtotal(repair: InvoiceRepairSnapshotInput) {
  return sumCustomerLines(repair.estimate?.items ?? []);
}

export function calculateIssuedInvoiceAmounts(lineSum: number, shippingFeeAmount = 0, mode: PricingTaxMode = "EXCLUSIVE") {
  assertIntegerYen(shippingFeeAmount);
  const { totalAmount, taxAmount, grossAmount } = calculateTaxableAmounts(lineSum, mode);
  return { totalAmount, taxAmount, shippingFeeAmount,
    grossTotalAmount: assertIntegerYen(grossAmount + shippingFeeAmount) };
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
  pricingTaxMode?: string;
  shippingFeeAmount?: number;
  grossTotalAmount: number;
  repairSnapshots: { subtotalAmount: number; grossAmount?: number | null; deliveryNoteId?: number | null; deliveryShippingFee?: number }[];
}) {
  if (!invoice.repairSnapshots.length) return false;
  try {
    assertIntegerYen(invoice.totalAmount);
    assertIntegerYen(invoice.taxAmount);
    assertIntegerYen(invoice.shippingFeeAmount ?? 0);
    assertIntegerYen(invoice.grossTotalAmount);
    const fees = new Map<number, number>();
    const mode = invoice.pricingTaxMode ?? "EXCLUSIVE";
    if (mode !== "EXCLUSIVE" && mode !== "INCLUSIVE") return false;
    for (const row of invoice.repairSnapshots) {
      assertIntegerYen(row.subtotalAmount);
      if (row.grossAmount != null) assertIntegerYen(row.grossAmount);
      if (mode === "INCLUSIVE" && row.grossAmount == null) return false;
      if (mode === "EXCLUSIVE" && row.grossAmount != null && row.grossAmount !== row.subtotalAmount) return false;
      const fee = row.deliveryShippingFee ?? 0;
      assertIntegerYen(fee);
      if (row.deliveryNoteId == null) { if (fee !== 0) return false; continue; }
      const previous = fees.get(row.deliveryNoteId);
      if (previous !== undefined && previous !== fee) return false;
      fees.set(row.deliveryNoteId, fee);
    }
    const shipping = [...fees.values()].reduce((sum, fee) => sum + fee, 0);
    const taxableGross = invoice.totalAmount + invoice.taxAmount;
    const expectedTax = mode === "INCLUSIVE"
      ? Number(BigInt(taxableGross) * BigInt(10) / BigInt(110))
      : Number(BigInt(invoice.totalAmount) / BigInt(10));
    return invoice.taxAmount === expectedTax
      && shipping === (invoice.shippingFeeAmount ?? 0)
      && invoice.grossTotalAmount === invoice.totalAmount + invoice.taxAmount + shipping
      && invoice.repairSnapshots.reduce((sum, row) => sum + row.subtotalAmount, 0) === invoice.totalAmount
      && (mode === "EXCLUSIVE" || invoice.repairSnapshots.reduce((sum, row) => sum + (row.grossAmount ?? 0), 0) === taxableGross);
  } catch { return false; }
}

export function invoicePdfRepairAmount(row: { subtotalAmount: number; grossAmount?: number | null }, mode: PricingTaxMode): number {
  if (mode === "INCLUSIVE") {
    if (row.grossAmount == null) throw new Error("税込の発行時明細額がありません");
    return assertIntegerYen(row.grossAmount);
  }
  return assertIntegerYen(row.subtotalAmount);
}

export function buildInvoiceRepairSnapshotData(repairs: InvoiceRepairSnapshotInput[], mode: PricingTaxMode = "EXCLUSIVE") {
  aggregateDeliveryShipping(repairs);
  if (repairs.some(repair => (repair.estimate?.pricingTaxMode ?? "EXCLUSIVE") !== mode)) {
    throw new Error("見積の税表示方式が請求書と一致しません");
  }
  let allocatedGross = 0;
  let allocatedTax = 0;
  return [...repairs].sort((a, b) => a.id - b.id).map((repair) => {
    const lineSum = calculateInvoiceRepairSubtotal(repair);
    let subtotalAmount = lineSum;
    if (mode === "INCLUSIVE") {
      allocatedGross = assertIntegerYen(allocatedGross + lineSum);
      const nextTax = Number(BigInt(allocatedGross) * BigInt(10) / BigInt(110));
      subtotalAmount = lineSum - (nextTax - allocatedTax);
      allocatedTax = nextTax;
    }
    return {
      repairId: repair.id,
      inquiryNumber: repair.inquiryNumber,
      deliveryNoteId: repair.deliveryNoteId,
      deliverySlipNumber: repair.deliveryNote?.slipNumber ?? null,
      deliveryIssuedDate: repair.deliveryNote?.issuedDate ?? null,
      deliveryDateActual: repair.deliveryDateActual,
      subtotalAmount,
      ...(mode === "INCLUSIVE" ? { grossAmount: lineSum } : {}),
      deliveryShippingFee: repair.deliveryNote?.shippingFee ?? 0,
    };
  });
}
