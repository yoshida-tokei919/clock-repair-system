import assert from "node:assert/strict";
import test from "node:test";
import { recommendZoneForRepair } from "./storage-zone-repair";

type RepairInput = Parameters<typeof recommendZoneForRepair>[0];
function repair(changes: Partial<RepairInput> = {}): RepairInput {
  return {
    id: 42, status: "作業待ち", approvalStatus: "approved", partsAllocationLegacy: false,
    customer: { type: "individual" }, planningState: null,
    estimate: { items: [{ type: "part", partsMasterId: 7, quantity: 2 }] },
    partAllocations: [], orderRequests: [], ...changes,
  };
}

test("repair adapter uses canonical readiness including allocation, not received orders alone", () => {
  assert.equal(recommendZoneForRepair(repair()).recommendedZone, "部品待ち");
  assert.equal(recommendZoneForRepair(repair({
    orderRequests: [{ repairId: 42, partsMasterId: 7, quantity: 2, status: "received", expectedArrivalDate: null, receivedAt: new Date("2026-10-01T00:00:00Z") }],
  })).recommendedZone, "部品待ち");
  assert.equal(recommendZoneForRepair(repair({
    partAllocations: [{ partsMasterId: 7, quantity: 2, state: "RESERVED" }],
  })).recommendedZone, "作業待ち");
  const legacy = recommendZoneForRepair(repair({ partsAllocationLegacy: true }));
  assert.deepEqual(legacy.allowedZones, ["作業待ち", "要確認"]);
  assert.ok(legacy.attention.length > 0);
});
