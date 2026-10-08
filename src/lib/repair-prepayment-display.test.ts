import assert from "node:assert/strict";
import test from "node:test";

import { PREPAYMENT_STATUS_LABELS, summarizeRepairPrepayments } from "./repair-prepayment-display";

test("sums multiple received prepayments and shows pending separately", () => {
  assert.deepEqual(summarizeRepairPrepayments([
    { amount: 1200, status: "SUCCEEDED" },
    { amount: 3400, status: "SUCCEEDED" },
    { amount: 800, status: "PENDING" },
    { amount: 900, status: "FAILED" },
  ]), { succeededTotal: 4600, pendingAmount: 800 });
});

test("every prepayment status has a Japanese label", () => {
  assert.deepEqual(Object.keys(PREPAYMENT_STATUS_LABELS).sort(),
    ["PENDING", "SUCCEEDED", "FAILED", "CANCELED"].sort());
});
