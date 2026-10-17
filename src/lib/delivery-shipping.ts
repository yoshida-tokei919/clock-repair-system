export type DeliveryShippingInput = {
  mode: "SHIPPING" | "NO_SHIPPING";
  carrierCode?: string | null;
  serviceCode?: string | null;
  size?: number | null;
  shippingFee?: number | null;
};

export function validateDeliveryShipping(input: DeliveryShippingInput) {
  if (!input || (input.mode !== "SHIPPING" && input.mode !== "NO_SHIPPING")) {
    throw new Error("配送方法を選択してください");
  }
  const fee = input.shippingFee;
  if (!Number.isSafeInteger(fee) || fee! < 0 || fee! > 2147483647) {
    throw new Error("お客様への送料を0円以上の整数で確定してください");
  }
  if (input.mode === "NO_SHIPPING") {
    if (fee !== 0 || input.carrierCode != null || input.serviceCode != null || input.size != null) {
      throw new Error("発送なしの場合は送料0円、配送会社・サイズなしにしてください");
    }
    return { shippingCarrierCode: null, shippingServiceCode: null, shippingSize: null,
      shippingCalculatedFee: null, shippingFee: 0 };
  }
  const approved = (input.carrierCode === "JAPAN_POST" && input.serviceCode === "YU_PACK")
    || (input.carrierCode === "YAMATO" && input.serviceCode === "TA_Q_BIN");
  if (!approved || !Number.isSafeInteger(input.size) || input.size! <= 0 || input.size! > 1000) {
    throw new Error("配送会社・サービス・正のサイズを指定してください");
  }
  return { shippingCarrierCode: input.carrierCode!, shippingServiceCode: input.serviceCode!,
    shippingSize: input.size!, shippingCalculatedFee: null, shippingFee: fee! };
}

export function assertNoDuplicateReturnShipping(
  repairs: readonly { status: string; estimate?: { items?: readonly { itemName: string; unitPrice: number; quantity?: number }[] } | null }[],
  deliveryShippingFee: number,
) {
  if (deliveryShippingFee <= 0) return;
  const hasEmbeddedReturnShipping = repairs.some(repair =>
    ["修理不可返却", "キャンセル返却"].includes(repair.status)
    && repair.estimate?.items?.some(item => item.itemName === "返送料" && item.unitPrice * (item.quantity ?? 1) > 0),
  );
  if (hasEmbeddedReturnShipping) {
    throw new Error("返却明細に返送料が含まれているため、納品書の送料は0円にしてください。");
  }
}

export function canEditDeliveryShipping(hasSnapshot: boolean, hasLinkedInvoice: boolean) {
  return !hasSnapshot && !hasLinkedInvoice;
}

export function assertSingleCustomerDeliverySelection(repairs: readonly { customerId: number }[]) {
  if (new Set(repairs.map(repair => repair.customerId)).size !== 1) {
    throw new Error("納品書は取引先ごとに1件ずつ発行してください");
  }
}
