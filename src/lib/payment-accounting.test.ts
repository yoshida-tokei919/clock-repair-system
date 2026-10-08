import assert from "node:assert/strict";
import test from "node:test";
import { effectiveAllocation, refundableAmount, refundTotals } from "./payment-accounting";
import { calculateInvoicePaymentSummary } from "./invoice-payment";

test("multiple partial refunds and pending reservations constrain capacity", () => {
  const payment = { amount: 10000, kind: "INVOICE", status: "SUCCEEDED", allocations: [], refunds: [
    { amount: 2000, status: "SUCCEEDED" }, { amount: 1000, status: "SUCCEEDED" },
    { amount: 3000, status: "PENDING" }, { amount: 500, status: "FAILED" }, { amount: 500, status: "CANCELED" },
  ] };
  assert.deepEqual(refundTotals(payment.refunds), { succeeded: 3000, pending: 3000 });
  assert.equal(refundableAmount(payment), 4000);
  assert.throws(() => refundableAmount({ ...payment, refunds: [...payment.refunds, { amount: 4001, status: "PENDING" }] }), /不整合/);
});

test("allocated prepayment cannot be refunded; split release restores only unused credit", () => {
  const payment = { amount: 50000, kind: "REPAIR_PREPAYMENT", status: "SUCCEEDED", refunds: [{ amount: 5000, status: "SUCCEEDED" }],
    allocations: [{ allocatedAmount: 20000, releases: [{ amount: 5000 }] },
      { allocatedAmount: 10000, releases: [] }] };
  assert.equal(refundableAmount(payment), 20000);
  assert.equal(effectiveAllocation(payment.allocations[0]), 15000);
  assert.throws(() => effectiveAllocation({ allocatedAmount: 1000, releases: [{ amount: 600 }, { amount: 401 }] }), /超え/);
});

test("invoice net paid includes effective prepayment and succeeded invoice refunds only", () => {
  const summary = calculateInvoicePaymentSummary({ grossTotalAmount: 30000 }, [
    { allocatedAmount: 10000, releases: [{ amount: 4000 }], payment: { kind: "REPAIR_PREPAYMENT", status: "SUCCEEDED" } },
    { allocatedAmount: 20000, payment: { kind: "INVOICE", status: "SUCCEEDED", refunds: [
      { amount: 5000, status: "SUCCEEDED" }, { amount: 1000, status: "PENDING" }] } },
  ]);
  assert.deepEqual(summary, { invoiceTotal: 30000, paidAmount: 21000, prepaymentAppliedAmount: 6000,
    invoiceRefundedAmount: 5000, invoiceRefundPendingAmount: 1000, outstandingBalance: 9000 });
});

test("fully refunded invoice allocation can be released on void without double subtraction", () => {
  const summary = calculateInvoicePaymentSummary({ grossTotalAmount: 10000 }, [
    { allocatedAmount: 10000, releases: [{ amount: 10000 }], payment: { kind: "INVOICE", status: "SUCCEEDED",
      refunds: [{ amount: 10000, status: "SUCCEEDED" }] } },
  ]);
  assert.equal(summary.paidAmount, 0);
  assert.equal(summary.outstandingBalance, 10000);
});
