import assert from "node:assert/strict";
import test from "node:test";

import { assertApprovalReturnAddress, parseReturnAddress, returnAddressData } from "./return-address";

const completeAddress = {
  recipientName: "Customer",
  postalCode: "１２３－４５６７",
  prefecture: "東京都",
  city: "千代田区",
  street: "丸の内1-1",
  building: "時計ビル",
  phone: "0312345678",
};

test("normalizes a valid return-address postal code and preserves the optional building", () => {
  const address = parseReturnAddress(completeAddress);
  assert.equal(address.postalCode, "1234567");
  assert.deepEqual(returnAddressData(address), {
    returnRecipientName: "Customer",
    returnPostalCode: "1234567",
    returnPrefecture: "東京都",
    returnCity: "千代田区",
    returnStreet: "丸の内1-1",
    returnBuilding: "時計ビル",
    returnPhone: "0312345678",
  });
});

test("rejects a return address without required fields or a valid postal code", () => {
  assert.throws(() => parseReturnAddress({ ...completeAddress, postalCode: "abc123-4567xyz" }));
  assert.throws(() => parseReturnAddress({ ...completeAddress, phone: "  " }));
});

test("requires a completed snapshot for B2C approval but does not apply that guard to B2B", () => {
  const emptySnapshot = {
    returnRecipientName: null, returnPostalCode: null, returnPrefecture: null, returnCity: null,
    returnStreet: null, returnBuilding: null, returnPhone: null,
  };
  assert.throws(() => assertApprovalReturnAddress("individual", emptySnapshot));
  assert.doesNotThrow(() => assertApprovalReturnAddress("business", emptySnapshot));
});
