export type B2BInvoicePreviewRow = { subtotal: number; deliveryNoteId: number | null; shippingFee: number | null };

export function summarizeB2BInvoicePreview(rows: readonly B2BInvoicePreviewRow[]) {
  const subtotal = rows.reduce((sum, row) => sum + row.subtotal, 0);
  const tax = Math.floor(subtotal * 0.1);
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
  return { subtotal, tax, shippingFeeAmount,
    total: unconfirmedNoteIds.length ? null : subtotal + tax + shippingFeeAmount,
    unconfirmedNoteIds };
}
