import assert from "node:assert/strict";
import test from "node:test";
import { b2bPaymentDueDate, billingMonthBounds, billingMonthFromDate, isB2BBillingRepairEligible, parseBillingMonth } from "./b2b-billing-month";

test("billing month accepts only canonical YYYY-MM", () => {
  assert.deepEqual(parseBillingMonth("2026-10"), { year: 2026, month: 10 });
  for (const value of [undefined, "2026-1", "2026-00", "2026-13", "2026-10-extra", "0099-01", "9999-12"]) {
    assert.equal(parseBillingMonth(value), null);
  }
});

test("Tokyo month bounds include local midnight and exclude next month", () => {
  const bounds = billingMonthBounds("2026-12");
  assert.equal(bounds.from.toISOString(), "2026-11-30T15:00:00.000Z");
  assert.equal(bounds.to.toISOString(), "2026-12-31T15:00:00.000Z");
  assert.equal(billingMonthFromDate(new Date("2026-11-30T14:59:59.999Z")), "2026-11");
  assert.equal(billingMonthFromDate(bounds.from), "2026-12");
});

test("B2B payment is due at following calendar month end", () => {
  assert.equal(b2bPaymentDueDate("2026-12").toISOString(), "2027-01-31T00:00:00.000Z");
  assert.equal(b2bPaymentDueDate("2024-01").toISOString(), "2024-02-29T00:00:00.000Z");
  assert.equal(b2bPaymentDueDate("2025-01").toISOString(), "2025-02-28T00:00:00.000Z");
});

test("B2B selected repair must belong to customer, be uninvoiced, and have a delivery note in month", () => {
  const bounds = billingMonthBounds("2026-10");
  const eligible = { customerId: 3, invoiceId: null, deliveryNote: { customerId: 3, issuedDate: bounds.from } };
  assert.equal(isB2BBillingRepairEligible(eligible, 3, bounds), true);
  assert.equal(isB2BBillingRepairEligible({ ...eligible, customerId: 4 }, 3, bounds), false);
  assert.equal(isB2BBillingRepairEligible({ ...eligible, invoiceId: 9 }, 3, bounds), false);
  assert.equal(isB2BBillingRepairEligible({ ...eligible, deliveryNote: null }, 3, bounds), false);
  assert.equal(isB2BBillingRepairEligible({ ...eligible, deliveryNote: { customerId: 4, issuedDate: bounds.from } }, 3, bounds), false);
  assert.equal(isB2BBillingRepairEligible({ ...eligible, deliveryNote: { customerId: 3, issuedDate: bounds.to } }, 3, bounds), false);
});
