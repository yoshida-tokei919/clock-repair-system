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

export function canEditDeliveryShipping(hasSnapshot: boolean, hasLinkedInvoice: boolean) {
  return !hasSnapshot && !hasLinkedInvoice;
}

export function assertSingleCustomerDeliverySelection(repairs: readonly { customerId: number }[]) {
  if (new Set(repairs.map(repair => repair.customerId)).size !== 1) {
    throw new Error("納品書は取引先ごとに1件ずつ発行してください");
  }
}
