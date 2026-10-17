import assert from "node:assert/strict";
import test from "node:test";
import { assertNoDuplicateReturnShipping, assertSingleCustomerDeliverySelection, canEditDeliveryShipping, validateDeliveryShipping } from "./delivery-shipping";

test("shipping requires explicit method, size and customer charge", () => {
  assert.deepEqual(validateDeliveryShipping({ mode: "SHIPPING", carrierCode: "JAPAN_POST", serviceCode: "YU_PACK", size: 80, shippingFee: 0 }),
    { shippingCarrierCode: "JAPAN_POST", shippingServiceCode: "YU_PACK", shippingSize: 80, shippingCalculatedFee: null, shippingFee: 0 });
  assert.equal(validateDeliveryShipping({ mode: "SHIPPING", carrierCode: "YAMATO", serviceCode: "TA_Q_BIN", size: 100, shippingFee: 900 }).shippingFee, 900);
  assert.deepEqual(validateDeliveryShipping({ mode: "NO_SHIPPING", shippingFee: 0 }),
    { shippingCarrierCode: null, shippingServiceCode: null, shippingSize: null, shippingCalculatedFee: null, shippingFee: 0 });
  for (const input of [
    { mode: "SHIPPING" as const, carrierCode: "JAPAN_POST", serviceCode: "YU_PACK", size: 80 },
    { mode: "SHIPPING" as const, carrierCode: "JAPAN_POST", serviceCode: "TA_Q_BIN", size: 80, shippingFee: 0 },
    { mode: "SHIPPING" as const, carrierCode: "YAMATO", serviceCode: "TA_Q_BIN", size: 0, shippingFee: 0 },
    { mode: "SHIPPING" as const, carrierCode: "YAMATO", serviceCode: "TA_Q_BIN", size: 80, shippingFee: -1 },
    { mode: "NO_SHIPPING" as const, shippingFee: 10 },
    { mode: "NO_SHIPPING" as const, carrierCode: "YAMATO", shippingFee: 0 },
  ]) assert.throws(() => validateDeliveryShipping(input));
});

test("historical or linked invoice blocks shipping edits", () => {
  assert.equal(canEditDeliveryShipping(false, false), true);
  assert.equal(canEditDeliveryShipping(true, false), false);
  assert.equal(canEditDeliveryShipping(false, true), false);
});

test("delivery issue requires one customer group for one shipping decision", () => {
  assert.doesNotThrow(() => assertSingleCustomerDeliverySelection([{ customerId: 1 }, { customerId: 1 }]));
  assert.throws(() => assertSingleCustomerDeliverySelection([{ customerId: 1 }, { customerId: 2 }]), /取引先ごと/);
});


test("embedded return shipping cannot be charged again on the delivery note", () => {
  for (const status of ["修理不可返却", "キャンセル返却"]) {
    const returned = [{ status, estimate: { items: [{ itemName: "返送料", unitPrice: 800, quantity: 1 }] } }];
    assert.doesNotThrow(() => assertNoDuplicateReturnShipping(returned, 0));
    assert.throws(() => assertNoDuplicateReturnShipping(returned, 800), /納品書の送料は0円/);
  }
  assert.doesNotThrow(() => assertNoDuplicateReturnShipping([{ status: "作業完了", estimate: { items: [{ itemName: "返送料", unitPrice: 800, quantity: 1 }] } }], 800));
});
