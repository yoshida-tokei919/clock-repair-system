import assert from "node:assert/strict";
import test from "node:test";

import { getB2CPaymentDueDate, getNextB2CInvoiceNumber } from "./invoice-numbering";

test("B2C invoice numbers use the largest existing CI sequence", () => {
  assert.equal(getNextB2CInvoiceNumber([]), "CI-001");
  assert.equal(getNextB2CInvoiceNumber(["CI-001", "CI-010", "TI-999"]), "CI-011");
});

test("B2C invoice numbering ignores malformed CI-like values", () => {
  assert.equal(getNextB2CInvoiceNumber(["CI-002x", "CI--3", "CI-9007199254740992"]), "CI-001");
});

test("B2C payment due date is seven Japan calendar days after issuance", () => {
  assert.equal(getB2CPaymentDueDate(new Date("2026-09-15T14:59:00.000Z")).toISOString(), "2026-09-22T00:00:00.000Z");
  assert.equal(getB2CPaymentDueDate(new Date("2026-09-15T15:00:00.000Z")).toISOString(), "2026-09-23T00:00:00.000Z");
});
