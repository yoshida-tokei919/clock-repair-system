import { type PricingTaxMode } from "./pricing-tax";
import { invoiceAmountsWithDiscount } from "./b2b-invoice-discount";
export type B2BInvoicePreviewRow = { subtotal: number; deliveryNoteId: number | null; shippingFee: number | null; pricingTaxMode?: string };

export function summarizeB2BInvoicePreview(rows: readonly B2BInvoicePreviewRow[], rateBps = 0) {
  const subtotal = rows.reduce((sum, row) => sum + row.subtotal, 0);
  const modes = new Set(rows.map(row => row.pricingTaxMode ?? "EXCLUSIVE"));
  if (modes.size > 1) throw new Error("税表示方式が異なる見積は同じ請求書にまとめられません");
  const mode = ([...modes][0] ?? "EXCLUSIVE") as PricingTaxMode;
  const fees = new Map<number, number | null>();
  for (const row of rows) {
    if (row.deliveryNoteId === null) continue;
    if (fees.has(row.deliveryNoteId) && fees.get(row.deliveryNoteId) !== row.shippingFee) {
      throw new Error("同じ納品書の送料が一致しません。再読み込みしてください");
    }
    fees.set(row.deliveryNoteId, row.shippingFee);
  }
  const unconfirmedNoteIds = [...fees].filter(([, fee]) => fee === null).map(([id]) => id);
  const shippingFeeAmount = [...fees.values()].reduce<number>((sum, fee) => sum + (fee ?? 0), 0);
  const discounted = invoiceAmountsWithDiscount(subtotal, shippingFeeAmount, mode, rateBps);
  return { subtotal, discountBasisAmount: discounted.discountBasisAmount, discountAmount: discounted.discountAmount,
    netSubtotal: discounted.totalAmount, tax: discounted.taxAmount, shippingFeeAmount,
    total: unconfirmedNoteIds.length ? null : discounted.grossTotalAmount,
    unconfirmedNoteIds };
}
