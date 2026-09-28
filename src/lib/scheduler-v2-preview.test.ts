import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { deadlineCapacitySnapshotRevision } from "./deadline-capacity-preview";
import { loadSchedulerV2Preview, schedulerV2SnapshotRevision } from "./scheduler-v2-preview";

test("revision responds to ordering metadata, Task192B inputs, and current segments", () => {
  const base = { plannerVersion: "193B-1", deadlineCapacitySnapshotRevision:
    deadlineCapacitySnapshotRevision({ workCalendar: [480], planning: [60], parts: ["READY"] }),
    metadata: [{ id: 1, priorityScore: 1, receptionDate: null }], segments: [] as unknown[] };
  const initial = schedulerV2SnapshotRevision(base);
  assert.match(initial, /^[0-9a-f]{64}$/);
  assert.notEqual(initial, schedulerV2SnapshotRevision({ ...base,
    metadata: [{ id: 1, priorityScore: 2, receptionDate: null }] }));
  assert.notEqual(initial, schedulerV2SnapshotRevision({ ...base,
    metadata: [{ id: 1, priorityScore: 1, receptionDate: "2026-09-01T10:00:00.000Z" }] }));
  assert.notEqual(initial, schedulerV2SnapshotRevision({ ...base,
    deadlineCapacitySnapshotRevision: deadlineCapacitySnapshotRevision({ workCalendar: [240], planning: [60], parts: ["READY"] }) }));
  assert.notEqual(initial, schedulerV2SnapshotRevision({ ...base,
    deadlineCapacitySnapshotRevision: deadlineCapacitySnapshotRevision({ workCalendar: [480], planning: [20], parts: ["WAITING"] }) }));
  assert.notEqual(initial, schedulerV2SnapshotRevision({ ...base,
    segments: [{ repairId: 1, workDate: "2026-10-01", plannedMinutes: 10 }] }));
});

test("loader reuses Task192B reads, adds only planner metadata and segments, and proposes without writes", async () => {
  const reads: string[] = [];
  let repairRead = 0;
  const raw = { id: 1, inquiryNumber: "T-1", status: "作業待ち", scheduledDate: null,
    scheduleLocked: false, estimatedWorkMinutes: 60, deliveryDateExpected: new Date("2026-10-03"),
    partsAllocationLegacy: false, updatedAt: new Date("2026-10-01"), planningState: null,
    estimate: null, partAllocations: [], orderRequests: [] };
  const db = {
    repair: { findMany: async () => { reads.push("repair"); return ++repairRead === 1 ? [raw] :
      [{ id: 1, priorityScore: 3, receptionDate: new Date("2026-09-01") }]; } },
    repairScheduleSegment: { findMany: async () => { reads.push("segments"); return []; } },
    workCalendar: { findMany: async () => { reads.push("calendar"); return []; } },
    schedulerSetting: { findUnique: async () => { reads.push("settings"); return {
      dailyScheduleReviewMinutes: 0, runningTestDays: 0, reworkBufferDays: 0,
      shippingBufferDays: 0, updatedAt: new Date("2026-10-01"),
    }; } },
    schedulerActivitySetting: { findMany: async () => { reads.push("activity"); return []; } },
  };
  // The two repair reads start concurrently; distinguish them by their select shape in a real client.
  db.repair.findMany = async (args?: unknown) => { reads.push("repair");
    return (args as { select?: { priorityScore?: boolean } }).select?.priorityScore
      ? [{ id: 1, priorityScore: 3, receptionDate: new Date("2026-09-01") }] : [raw]; };
  const result = await loadSchedulerV2Preview(db as never, new Date("2026-10-01T03:00:00Z"));
  assert.deepEqual(reads.sort(), ["repair", "repair", "segments", "calendar", "settings", "activity"].sort());
  assert.equal(result.repairs[0].priorityScore, 3);
  assert.equal(result.repairs[0].proposedSummaryDate, "2026-10-01");
  assert.match(result.snapshotRevision, /^[0-9a-f]{64}$/);
});

test("route is GET-only, dynamic, RepeatableRead, and checks auth before database access", () => {
  const source = readFileSync("src/app/api/repairs/scheduler-v2-preview/route.ts", "utf8");
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /export async function GET\(/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)\(/);
  assert.ok(source.indexOf("if (!session?.user)") < source.indexOf("prisma.$transaction"));
  assert.match(source, /TransactionIsolationLevel\.RepeatableRead/);
});
