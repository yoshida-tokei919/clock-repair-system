import assert from "node:assert/strict";
import test from "node:test";
import { resolveRepairPartsReadiness } from "./repair-parts-readiness";

const part = (partsMasterId: number, quantity: number | null = 1) => ({ type: "part", partsMasterId, quantity });
const order = (partsMasterId: number, status: string, quantity: number, date: string | null = null) => ({
  repairId: 7, partsMasterId, status, quantity,
  expectedArrivalDate: status === "ordered" ? date : null,
  receivedAt: status === "received" ? date : null,
});
const input = (overrides: Partial<Parameters<typeof resolveRepairPartsReadiness>[0]> = {}) => ({
  repairId: 7, partsAllocationLegacy: false, estimateItems: [part(1)], allocations: [], orders: [], ...overrides,
});

test("legacy and no required parts are distinct", () => {
  assert.deepEqual(resolveRepairPartsReadiness(input({ partsAllocationLegacy: true })).state, "LEGACY_UNKNOWN");
  assert.equal(resolveRepairPartsReadiness(input({ partsAllocationLegacy: true })).isReady, null);
  assert.deepEqual(resolveRepairPartsReadiness(input({ estimateItems: [
    { type: "labor", partsMasterId: 1, quantity: 1 }, { type: "part", partsMasterId: null, quantity: 2 },
  ] })).state, "NOT_REQUIRED");
});

test("requirements aggregate per part; only RESERVED and CONSUMED count", () => {
  const result = resolveRepairPartsReadiness(input({
    estimateItems: [part(1, 2), part(1, null), part(2, 1)],
    allocations: [
      { partsMasterId: 1, quantity: 2, state: "RESERVED" },
      { partsMasterId: 1, quantity: 1, state: "CONSUMED" },
      { partsMasterId: 2, quantity: 1, state: "CONSUMED" },
      { partsMasterId: 2, quantity: 9, state: "RELEASED" },
    ],
  }));
  assert.equal(result.state, "READY");
  assert.equal(result.requiredPartCount, 2);
  assert.equal(result.requiredQuantity, 4);
  assert.equal(result.allocatedQuantity, 4);
});

test("dated ordered supply covers shortage cumulatively; slowest part wins", () => {
  const result = resolveRepairPartsReadiness(input({
    estimateItems: [part(1, 3), part(2, 1)],
    allocations: [{ partsMasterId: 1, quantity: 1, state: "RESERVED" }],
    orders: [order(1, "ordered", 1, "2026-10-01"), order(1, "ordered", 1, "2026-10-04"),
      order(2, "ordered", 1, "2026-10-03")],
  }));
  assert.equal(result.state, "WAITING");
  assert.equal(result.partsReadyDate, "2026-10-04");
  assert.equal(result.shortagePartCount, 2);
  assert.equal(result.isReady, false);
});

test("Tokyo received date forecasts but receipt alone is not allocation", () => {
  const result = resolveRepairPartsReadiness(input({ orders: [{
    ...order(1, "received", 1), receivedAt: new Date("2026-09-27T15:30:00Z"),
  }] }));
  assert.equal(result.state, "WAITING");
  assert.equal(result.partsReadyDate, "2026-09-28");
  assert.equal(result.isReady, false);
});

test("date-only Prisma value keeps its calendar date", () => {
  const result = resolveRepairPartsReadiness(input({ orders: [{
    ...order(1, "ordered", 1), expectedArrivalDate: new Date("2026-10-01T00:00:00.000Z"),
  }] }));
  assert.equal(result.partsReadyDate, "2026-10-01");
});

test("undated, pending, cancelled, assigned and unrelated supply cannot establish a date", () => {
  for (const orders of [
    [order(1, "ordered", 1)], [order(1, "pending", 1, "2026-10-01")],
    [order(1, "cancelled", 1, "2026-10-01")], [order(1, "assigned", 1, "2026-10-01")],
    [{ ...order(1, "ordered", 1, "2026-10-01"), repairId: 8 }],
  ]) {
    const result = resolveRepairPartsReadiness(input({ orders }));
    assert.equal(result.state, "WAITING_UNKNOWN");
    assert.equal(result.partsReadyDate, null);
  }
});

test("extra pending and undated orders do not hide adequate dated supply", () => {
  const result = resolveRepairPartsReadiness(input({ orders: [
    order(1, "pending", 4), order(1, "ordered", 4), order(1, "ordered", 1, "2026-10-02"),
  ] }));
  assert.equal(result.state, "WAITING");
  assert.equal(result.partsReadyDate, "2026-10-02");
});
