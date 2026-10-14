import assert from "node:assert/strict";
import test from "node:test";
import { customerDefaultShippingInput, validateCustomerDefaultShipping } from "./customer-default-shipping";

const empty = { defaultShippingCarrierCode: null, defaultShippingServiceCode: null, defaultShippingSize: null, defaultShippingFee: null };
const configured = { defaultShippingCarrierCode: "JAPAN_POST", defaultShippingServiceCode: "YU_PACK", defaultShippingSize: 80, defaultShippingFee: 0 };

test("business customer shipping defaults permit unset and zero charge", () => {
  assert.deepEqual(validateCustomerDefaultShipping("business", empty), empty);
  assert.deepEqual(validateCustomerDefaultShipping("business", configured), configured);
  assert.equal(customerDefaultShippingInput("business", configured)?.shippingFee, 0);
  assert.equal(customerDefaultShippingInput("business", empty), null);
});

test("incomplete, mismatched, negative, and B2C defaults fail closed", () => {
  assert.throws(() => validateCustomerDefaultShipping("business", { ...configured, defaultShippingSize: null }));
  assert.throws(() => validateCustomerDefaultShipping("business", { ...configured, defaultShippingServiceCode: "TA_Q_BIN" }));
  assert.throws(() => validateCustomerDefaultShipping("business", { ...configured, defaultShippingFee: -1 }));
  assert.throws(() => validateCustomerDefaultShipping("individual", configured));
  assert.deepEqual(validateCustomerDefaultShipping("individual", empty), empty);
  assert.equal(customerDefaultShippingInput("individual", configured), null);
});

test("changing a customer default does not change an issued shipping value", () => {
  const defaults = { ...configured };
  const issued = customerDefaultShippingInput("business", defaults);
  assert.ok(issued);
  defaults.defaultShippingFee = 1800;
  assert.equal(issued.shippingFee, 0);
  assert.equal(customerDefaultShippingInput("business", defaults)?.shippingFee, 1800);
});
