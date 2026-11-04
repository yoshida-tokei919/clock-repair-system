import assert from "node:assert/strict";
import test from "node:test";
import { consolidatedShareRevoked, publicInvoicePdfAllowed } from "./issued-invoice-public-access";

test("customer PDF access is revoked as soon as the original invoice is void", () => {
  assert.equal(publicInvoicePdfAllowed("issued"), true);
  assert.equal(publicInvoicePdfAllowed("paid"), true);
  for (const status of ["void", "canceled", "correction_preparing", "draft"]) {
    assert.equal(publicInvoicePdfAllowed(status), false);
  }
});

test("a supersession revokes the original consolidated share and PDF", () => {
  assert.equal(consolidatedShareRevoked(null), false);
  assert.equal(consolidatedShareRevoked({ id: 1 }), true);
});
