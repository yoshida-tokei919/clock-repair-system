import assert from "node:assert/strict";
import { test } from "node:test";
import { deadlineCapacitySnapshotRevision, loadDeadlineCapacityPreview } from "./deadline-capacity-preview";

test("snapshot revision changes with relevant raw and derived input", () => {
  const baseline = { asOfDate: "2026-10-01", workCalendar: [{ availableMinutes: 480 }],
    repairs: [{ estimatedWorkMinutes: 60 }], derivedRepairs: [{ partsReadinessState: "READY" }] };
  const revision = deadlineCapacitySnapshotRevision(baseline);
  assert.match(revision, /^[0-9a-f]{64}$/);
  assert.equal(revision, deadlineCapacitySnapshotRevision(baseline));
  assert.notEqual(revision, deadlineCapacitySnapshotRevision({ ...baseline,
    workCalendar: [{ availableMinutes: 240 }] }));
  assert.notEqual(revision, deadlineCapacitySnapshotRevision({ ...baseline,
    derivedRepairs: [{ partsReadinessState: "WAITING" }] }));
});

test("loader resolves canonical parts readiness and returns read-only preview", async () => {
  const repair = {
    id: 1, inquiryNumber: "T-1", status: "作業待ち", scheduledDate: null,
    scheduleLocked: false, estimatedWorkMinutes: 100, deliveryDateExpected: new Date("2026-10-20"),
    partsAllocationLegacy: false, updatedAt: new Date("2026-10-01"), planningState: null,
    estimate: { items: [{ id: 1, type: "part", partsMasterId: 5, quantity: 1 }] },
    partAllocations: [], orderRequests: [{ id: 1, repairId: 1, partsMasterId: 5, quantity: 1,
      status: "ordered", expectedArrivalDate: new Date("2026-10-05"), receivedAt: null,
      updatedAt: new Date("2026-10-01") }],
  };
  const reads: string[] = [];
  const db = {
    repair: { findMany: async () => { reads.push("repair"); return [repair]; } },
    workCalendar: { findMany: async () => { reads.push("workCalendar"); return []; } },
    schedulerSetting: { findUnique: async () => { reads.push("schedulerSetting"); return {
      dailyScheduleReviewMinutes: 30, runningTestDays: 3, reworkBufferDays: 3,
      shippingBufferDays: 1, updatedAt: new Date("2026-10-01"),
    }; } },
    schedulerActivitySetting: { findMany: async () => { reads.push("schedulerActivitySetting"); return [
      { activityType: "INQUIRY", dailyReservedMinutes: 60, updatedAt: new Date("2026-10-01") },
    ]; } },
  };
  const result = await loadDeadlineCapacityPreview(db as never, new Date("2026-10-01T03:00:00Z"));
  assert.deepEqual(reads.sort(), ["repair", "workCalendar", "schedulerSetting", "schedulerActivitySetting"].sort());
  assert.equal(result.asOfDate, "2026-10-01");
  assert.equal(result.days[0].effectiveRepairCapacityMinutes, 390);
  assert.equal(result.repairs[0].partsReadinessState, "WAITING");
  assert.equal(result.repairs[0].partsReadyDate, "2026-10-05");
  assert.equal(result.repairs[0].projectedEarliestDate, "2026-10-05");
  assert.equal(result.repairs[0].latestWorkCompletionDate, "2026-10-13");
  assert.match(result.snapshotRevision, /^[0-9a-f]{64}$/);
});
