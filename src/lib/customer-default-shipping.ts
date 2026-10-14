import { validateDeliveryShipping } from "./delivery-shipping";

export type CustomerDefaultShipping = {
  defaultShippingCarrierCode: string | null;
  defaultShippingServiceCode: string | null;
  defaultShippingSize: number | null;
  defaultShippingFee: number | null;
};

export function validateCustomerDefaultShipping(type: string, input: CustomerDefaultShipping): CustomerDefaultShipping {
  const empty = Object.values(input).every(value => value == null);
  if (type !== "business") {
    if (!empty) throw new Error("送料の既定値は業者顧客にのみ設定できます");
    return input;
  }
  if (empty) return input;
  const shipping = validateDeliveryShipping({ mode: "SHIPPING", carrierCode: input.defaultShippingCarrierCode,
    serviceCode: input.defaultShippingServiceCode, size: input.defaultShippingSize, shippingFee: input.defaultShippingFee });
  return { defaultShippingCarrierCode: shipping.shippingCarrierCode, defaultShippingServiceCode: shipping.shippingServiceCode,
    defaultShippingSize: shipping.shippingSize, defaultShippingFee: shipping.shippingFee };
}

export function customerDefaultShippingInput(type: string, input: CustomerDefaultShipping | null | undefined) {
  if (type !== "business" || !input || Object.values(input).every(value => value == null)) return null;
  return validateDeliveryShipping({ mode: "SHIPPING", carrierCode: input.defaultShippingCarrierCode,
    serviceCode: input.defaultShippingServiceCode, size: input.defaultShippingSize, shippingFee: input.defaultShippingFee });
}
