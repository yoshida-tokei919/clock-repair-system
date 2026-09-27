import assert from "node:assert/strict";
import test from "node:test";
import { assertShippingMethodChangeAllowed, getOrderArrivalUpdate, parseOrderUpdateInput, resolveExpectedArrivalDate, shouldRecalculateOrderArrival } from "./order-expected-arrival";

const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

test("arrival date needs an order date and both configured lead times", () => {
  const orderedAt = new Date("2026-09-27T14:59:00.000Z");
  assert.equal(resolveExpectedArrivalDate(null, 2, 3), null);
  assert.equal(resolveExpectedArrivalDate(orderedAt, null, 3), null);
  assert.equal(resolveExpectedArrivalDate(orderedAt, 2, null), null);
  assert.equal(date(resolveExpectedArrivalDate(orderedAt, 0, 0)), "2026-09-27");
  assert.equal(date(resolveExpectedArrivalDate(orderedAt, 2, 3)), "2026-10-02");
});

test("Tokyo calendar date crosses midnight before adding days", () => {
  assert.equal(date(resolveExpectedArrivalDate(new Date("2026-09-27T14:59:00Z"), 0, 0)), "2026-09-27");
  assert.equal(date(resolveExpectedArrivalDate(new Date("2026-09-27T15:00:00Z"), 0, 0)), "2026-09-28");
  assert.equal(date(resolveExpectedArrivalDate(new Date("2026-12-31T15:00:00Z"), 2, 3)), "2027-01-06");
});

test("order transition preserves the first orderedAt and recalculates on method change", () => {
  const now = new Date("2026-10-01T10:00:00Z");
  const previousOrderedAt = new Date("2026-09-27T15:00:00Z");
  const first = getOrderArrivalUpdate({ previousStatus: "pending", status: "ordered", previousOrderedAt: null,
    previousMethodId: 1, methodId: 1, methodProvided: true, processingDays: 2, transitDays: 3, now });
  assert.equal(first.orderedAt, now);
  assert.equal(date(first.expectedArrivalDate ?? null), "2026-10-06");
  const changed = getOrderArrivalUpdate({ previousStatus: "ordered", status: "ordered", previousOrderedAt,
    previousMethodId: 1, methodId: 2, methodProvided: true, processingDays: 2, transitDays: 1, now });
  assert.equal(changed.orderedAt, previousOrderedAt);
  assert.equal(date(changed.expectedArrivalDate ?? null), "2026-10-01");
});

test("ordered status-only and unchanged method do not overwrite the saved arrival date", () => {
  const base = { previousStatus: "ordered", status: "ordered", previousOrderedAt: new Date("2026-09-27T15:00:00Z"),
    previousMethodId: 2, methodId: 2, processingDays: 5, transitDays: 8, now: new Date("2026-10-01T10:00:00Z") };
  assert.equal(getOrderArrivalUpdate({ ...base, methodProvided: false }).expectedArrivalDate, undefined);
  assert.equal(getOrderArrivalUpdate({ ...base, methodProvided: true }).expectedArrivalDate, undefined);
  assert.equal(shouldRecalculateOrderArrival({ ...base, methodProvided: false }), false);
  assert.equal(shouldRecalculateOrderArrival({ ...base, methodProvided: true }), false);
});

test("ordered method clear nulls the arrival date; missing orderedAt is repaired", () => {
  const base = { previousStatus: "ordered", status: "ordered", previousOrderedAt: new Date("2026-09-27T15:00:00Z"),
    previousMethodId: 2, methodId: null, methodProvided: true, processingDays: 2, transitDays: null,
    now: new Date("2026-10-01T10:00:00Z") };
  assert.equal(getOrderArrivalUpdate(base).expectedArrivalDate, null);
  const repaired = getOrderArrivalUpdate({ ...base, previousOrderedAt: null, methodId: 2, transitDays: 3, methodProvided: false });
  assert.equal(repaired.orderedAt, base.now);
  assert.equal(date(repaired.expectedArrivalDate ?? null), "2026-10-06");
});

test("pending keeps the chosen method and clears only the arrival date; received preserves the saved date", () => {
  const base = { previousStatus: "ordered", previousOrderedAt: new Date("2026-09-27T15:00:00Z"),
    previousMethodId: 2, methodId: 2, methodProvided: false, processingDays: 2, transitDays: 3, now: new Date() };
  assert.deepEqual(getOrderArrivalUpdate({ ...base, status: "pending" }), {
    procurementShippingMethodId: 2, expectedArrivalDate: null, orderedAt: undefined,
  });
  assert.equal(getOrderArrivalUpdate({ ...base, status: "received" }).expectedArrivalDate, undefined);
  assert.deepEqual(getOrderArrivalUpdate({ ...base, previousStatus: "pending", status: "pending", methodId: 3, methodProvided: true }), {
    procurementShippingMethodId: 3, expectedArrivalDate: null, orderedAt: undefined,
  });
  assert.equal(getOrderArrivalUpdate({ ...base, status: "assigned" }).expectedArrivalDate, undefined);
});

test("input accepts status-only callers and validates method IDs", () => {
  assert.deepEqual(parseOrderUpdateInput({ status: "ordered" }), { status: "ordered" });
  assert.deepEqual(parseOrderUpdateInput({ procurementShippingMethodId: null }), { procurementShippingMethodId: null });
  assert.deepEqual(parseOrderUpdateInput({ status: "ordered", procurementShippingMethodId: 1 }),
    { status: "ordered", procurementShippingMethodId: 1 });
  for (const id of [0, -1, 1.5, "1", 2147483648])
    assert.throws(() => parseOrderUpdateInput({ procurementShippingMethodId: id }));
});

test("inactive methods remain on status updates but cannot be newly selected", () => {
  assert.doesNotThrow(() => assertShippingMethodChangeAllowed("ordered", "ordered", 1, 1, false, false));
  assert.doesNotThrow(() => assertShippingMethodChangeAllowed("ordered", "ordered", 1, 1, true, false));
  assert.throws(() => assertShippingMethodChangeAllowed("ordered", "ordered", 1, 2, true, false));
  assert.throws(() => assertShippingMethodChangeAllowed("received", "received", 1, 2, true, true));
  assert.throws(() => assertShippingMethodChangeAllowed("ordered", "received", 1, 2, true, true));
});
