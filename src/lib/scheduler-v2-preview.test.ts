import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { deadlineCapacitySnapshotRevision } from "./deadline-capacity-preview";
import { loadSchedulerV2Preview, loadSchedulerV2PreviewWithFeedback,
  schedulerV2SnapshotRevision } from "./scheduler-v2-preview";

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

test("core loader reads only Task192B inputs, planner metadata, and segments", async () => {
  const reads: string[] = [];
  const raw = { id: 1, inquiryNumber: "T-1", status: "作業待ち", scheduledDate: null,
    scheduleLocked: false, estimatedWorkMinutes: 60, deliveryDateExpected: new Date("2026-10-03"),
    partsAllocationLegacy: false, updatedAt: new Date("2026-10-01"), planningState: null,
    estimate: null, partAllocations: [], orderRequests: [] };
  const db = {
    repair: { findMany: async (args: any) => { reads.push("repair"); return args.select?.priorityScore
      ? [{ id: 1, priorityScore: 3, receptionDate: new Date("2026-09-01") }] : [raw]; } },
    repairScheduleSegment: { findMany: async () => { reads.push("segments"); return []; } },
    workCalendar: { findMany: async () => { reads.push("calendar"); return []; } },
    schedulerSetting: { findUnique: async () => { reads.push("settings"); return {
      dailyScheduleReviewMinutes: 0, runningTestDays: 0, reworkBufferDays: 0,
      shippingBufferDays: 0, updatedAt: new Date("2026-10-01"),
    }; } },
    schedulerActivitySetting: { findMany: async () => { reads.push("activity"); return []; } },
  };
  const result = await loadSchedulerV2Preview(db as never, new Date("2026-10-01T03:00:00Z"));
  assert.deepEqual(reads.sort(), ["repair", "repair", "segments", "calendar", "settings", "activity"].sort());
  assert.equal("workTimeFeedback" in result, false);
  assert.equal(result.repairs[0].workMinutes, 60);
  assert.match(result.snapshotRevision, /^[0-9a-f]{64}$/);
});

test("with-feedback loader bulk-loads recommendations outside planner work and revision", async () => {
  const reads: string[] = [];
  const raw = { id: 1, inquiryNumber: "T-1", status: "作業待ち", scheduledDate: null,
    scheduleLocked: false, estimatedWorkMinutes: 60, deliveryDateExpected: new Date("2026-10-03"),
    partsAllocationLegacy: false, updatedAt: new Date("2026-10-01"), planningState: null,
    estimate: null, partAllocations: [], orderRequests: [] };
  const feedbackRepair = { id: 1, estimatedWorkMinutes: 60, movementCaliberId: 5,
    baseMovementCaliberId: null, watch: { brandId: 1, modelId: null, referenceId: null,
      caseReferenceId: null, caliberId: null, baseCaliberId: null, driveType: null },
    repairLineItems: [{ id: 2, lineType: "LABOR", repairWorkCategoryId: 4,
      repairWorkCategory: { repairType: "INTERNAL" }, targetPartNameId: null,
      repairWorkActionId: null, detailLabelSnapshot: null }] };
  let standardMinutes = 120;
  let persistedMinutes = 60;
  let learningMode = "MANUAL";
  let sessions: unknown[] = [];
  const db = {
    repair: { findMany: async (args?: unknown): Promise<unknown> => { reads.push("repair");
      const select = (args as { select?: { priorityScore?: boolean; movementCaliberId?: boolean } }).select;
      return select?.priorityScore ? [{ id: 1, priorityScore: 3, receptionDate: new Date("2026-09-01") }] :
        select?.movementCaliberId ? [{ ...feedbackRepair, estimatedWorkMinutes: persistedMinutes }] :
          [{ ...raw, estimatedWorkMinutes: persistedMinutes }]; } },
    repairScheduleSegment: { findMany: async () => { reads.push("segments"); return []; } },
    workCalendar: { findMany: async () => { reads.push("calendar"); return []; } },
    schedulerSetting: { findUnique: async (args?: unknown): Promise<unknown> => { reads.push("settings");
      return (args as { select?: { repairLearningMode?: boolean } }).select?.repairLearningMode
        ? { repairLearningMode: learningMode, repairLearningMinimumSamples: 2,
          repairFullSampleThreshold: 10, repairEarlyAggregationMethod: "MEDIAN",
          defaultAggregationMethod: "MEAN", repairLookbackMonths: 6, repairOutlierMethod: "NONE" }
        : { dailyScheduleReviewMinutes: 0, runningTestDays: 0, reworkBufferDays: 0,
          shippingBufferDays: 0, updatedAt: new Date("2026-10-01") }; } },
    schedulerActivitySetting: { findMany: async () => { reads.push("activity"); return []; } },
    repairWorkTimeStandard: { findMany: async () => { reads.push("standards"); return [
      { id: 1, repairType: "INTERNAL", categoryId: 4, targetPartNameId: null,
        actionId: null, detailLabel: null, driveType: null, standardMinutes },
    ]; } },
    workTimeSession: { findMany: async () => { reads.push("sessions"); return sessions; } },
  };
  const result = await loadSchedulerV2PreviewWithFeedback(db as never, new Date("2026-10-01T03:00:00Z"));
  assert.deepEqual(reads.sort(), ["repair", "repair", "repair", "segments", "calendar",
    "settings", "settings", "activity", "standards", "sessions"].sort());
  assert.equal(result.repairs[0].priorityScore, 3);
  assert.equal(result.repairs[0].workMinutes, 60);
  assert.equal(result.repairs[0].proposedSegments.reduce((sum, segment) => sum + segment.plannedMinutes, 0), 60);
  assert.equal(result.repairs[0].proposedSummaryDate, "2026-10-01");
  assert.equal(result.workTimeFeedback[1].recommendedEstimatedWorkMinutes, 120);
  assert.equal(result.workTimeFeedback[1].status, "RECOMMENDED_CHANGE");
  assert.match(result.snapshotRevision, /^[0-9a-f]{64}$/);
  standardMinutes = 150;
  const changedFeedback = await loadSchedulerV2PreviewWithFeedback(db as never, new Date("2026-10-01T03:00:00Z"));
  assert.equal(changedFeedback.workTimeFeedback[1].recommendedEstimatedWorkMinutes, 150);
  assert.equal(changedFeedback.snapshotRevision, result.snapshotRevision);
  assert.deepEqual(changedFeedback.repairs, result.repairs);
  learningMode = "AUTO";
  sessions = [30, 50].map((minutes, index) => ({ activityType: "REPAIR",
    repairId: index + 10, inquiryId: null, orderRequestId: null, contextSchemaVersion: 1,
    contextSnapshot: { work: { lineType: "LABOR", repairType: "INTERNAL", repairWorkCategoryId: 4,
      targetPartNameId: null, repairWorkActionId: null, detailLabel: null },
      repair: { movementCaliberId: 5 } },
    startedAt: new Date(Date.UTC(2026, 8, 30, 12) - minutes * 60_000),
    endedAt: new Date(Date.UTC(2026, 8, 30, 12)), invalidatedAt: null }));
  const changedHistory = await loadSchedulerV2PreviewWithFeedback(db as never, new Date("2026-10-01T03:00:00Z"));
  assert.equal(changedHistory.workTimeFeedback[1].recommendedEstimatedWorkMinutes, 40);
  assert.equal(changedHistory.snapshotRevision, result.snapshotRevision);
  assert.deepEqual(changedHistory.repairs, result.repairs);
  learningMode = "MANUAL";
  persistedMinutes = 150;
  const adopted = await loadSchedulerV2PreviewWithFeedback(db as never, new Date("2026-10-01T03:00:00Z"));
  assert.equal(adopted.workTimeFeedback[1].status, "UP_TO_DATE");
  assert.equal(adopted.workTimeFeedback[1].currentEstimatedWorkMinutes, 150);
  assert.equal(adopted.repairs[0].workMinutes, 150);
  assert.notEqual(adopted.snapshotRevision, result.snapshotRevision);
});

test("route is GET-only, dynamic, RepeatableRead, and checks auth before database access", () => {
  const source = readFileSync("src/app/api/repairs/scheduler-v2-preview/route.ts", "utf8");
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /export async function GET\(/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)\(/);
  assert.ok(source.indexOf("if (!session?.user)") < source.indexOf("prisma.$transaction"));
  assert.match(source, /prisma\.\$transaction\(tx => loadSchedulerV2PreviewWithFeedback\(tx\)/);
  assert.match(source, /TransactionIsolationLevel\.RepeatableRead/);
});
