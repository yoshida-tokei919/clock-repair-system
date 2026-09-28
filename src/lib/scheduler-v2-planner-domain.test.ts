import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDeadlineCapacityPreview, type PreviewRepair } from "./deadline-capacity-preview-domain";
import { resolveSchedulerV2Planner, type CurrentSegment } from "./scheduler-v2-planner-domain";
import { parseWorkDate } from "./work-calendar";

const repair = (id: number, changes: Partial<PreviewRepair> = {}): PreviewRepair => ({
  id, inquiryNumber: `T-${id}`, status: "作業待ち", scheduledDate: null,
  scheduleLocked: false, estimatedWorkMinutes: 60, remainingWorkMinutes: null,
  deliveryDateExpected: "2026-10-03", partsReadinessState: "NOT_REQUIRED",
  partsReadyDate: null, blocked: false, resumeEligibleDate: null, reviewDate: null, ...changes,
});
const segment = (id: number, repairId: number, workDate: string, plannedMinutes: number,
  source: "AUTO" | "MANUAL" = "AUTO"): CurrentSegment =>
  ({ id, repairId, workDate, plannedMinutes, source, sortOrder: 0 });
function preview(repairs: PreviewRepair[], options: {
  capacities?: number[]; segments?: CurrentSegment[]; priorities?: Record<number, number>;
  receptions?: Record<number, string | null>; reserved?: number; horizon?: number;
  buffers?: [number | null, number | null, number | null];
} = {}) {
  const horizonDays = options.horizon ?? 3;
  const workCalendar = (options.capacities ?? []).map((availableMinutes, i) => ({
    workDate: parseWorkDate(`2026-10-0${i + 1}`), availableMinutes, note: null,
  }));
  const base = resolveDeadlineCapacityPreview({ asOfDate: "2026-10-01", repairs,
    workCalendar, settings: { dailyScheduleReviewMinutes: options.reserved ?? 0,
      activityReservedMinutes: 0, runningTestDays: options.buffers ? options.buffers[0] : 0,
      reworkBufferDays: options.buffers ? options.buffers[1] : 0,
      shippingBufferDays: options.buffers ? options.buffers[2] : 0 }, horizonDays });
  return resolveSchedulerV2Planner({ repairs: base.repairs, days: base.days,
    metadata: repairs.map(row => ({ id: row.id, priorityScore: options.priorities?.[row.id] ?? 0,
      receptionDate: options.receptions?.[row.id] ?? null })), currentSegments: options.segments ?? [] });
}

test("600 minutes split across effective 300/240/300 as 300/240/60", () => {
  const result = preview([repair(1, { estimatedWorkMinutes: 600 })], {
    capacities: [300, 240, 300],
  });
  assert.deepEqual(result.repairs[0].proposedSegments.map(row => [row.workDate, row.plannedMinutes]), [
    ["2026-10-01", 300], ["2026-10-02", 240], ["2026-10-03", 60],
  ]);
  assert.equal(result.repairs[0].proposedSummaryDate, "2026-10-01");
  assert.equal(result.repairs[0].currentPlanClass, "NONE");
  assert.deepEqual(result.days.map(day => day.remainingCapacityMinutes), [0, 0, 240]);
});

test("zero and reserved capacity are skipped, with minimum one-minute segment", () => {
  const result = preview([repair(1, { estimatedWorkMinutes: 2 })], {
    capacities: [0, 31, 31], reserved: 30,
  });
  assert.deepEqual(result.repairs[0].proposedSegments.map(row => [row.workDate, row.plannedMinutes]), [
    ["2026-10-02", 1], ["2026-10-03", 1],
  ]);
});

test("fixed segment and locked legacy fallback reserve capacity without double-counting summary", () => {
  const result = preview([
    repair(1, { scheduleLocked: true, scheduledDate: "2026-10-01", estimatedWorkMinutes: 400 }),
    repair(2, { scheduleLocked: true, scheduledDate: "2026-10-01", estimatedWorkMinutes: 400 }),
    repair(3, { estimatedWorkMinutes: 200 }),
  ], { capacities: [300, 300, 300], segments: [segment(1, 1, "2026-10-01", 100)] });
  assert.equal(result.days[0].fixedLoadMinutes, 500);
  assert.equal(result.repairs[2].proposedSummaryDate, "2026-10-02");
});

test("manual segment protects its repair, while excluded provisional load is preserved", () => {
  const result = preview([
    repair(1, { scheduledDate: "2026-10-01", estimatedWorkMinutes: 100 }),
    repair(2, { status: "作業中", scheduledDate: "2026-10-01", estimatedWorkMinutes: 120 }),
    repair(3, { estimatedWorkMinutes: 200 }),
  ], { capacities: [300, 300, 300], segments: [segment(1, 1, "2026-10-01", 100, "MANUAL")] });
  assert.equal(result.days[0].fixedLoadMinutes, 100);
  assert.equal(result.days[0].preservedProvisionalLoadMinutes, 120);
  assert.equal(result.repairs[0].unplacedReason, "MANUAL_SEGMENT_PROTECTED");
  assert.deepEqual(result.repairs[2].proposedSegments.map(row => row.plannedMinutes), [80, 120]);
});

test("replaceable current AUTO load is removed from proposed baseline and sortOrder follows priority", () => {
  const result = preview([
    repair(1, { scheduledDate: "2026-10-01", estimatedWorkMinutes: 100 }),
    repair(2, { estimatedWorkMinutes: 100 }),
  ], { capacities: [300, 300, 300], priorities: { 2: 10 },
    segments: [segment(1, 1, "2026-10-01", 200)] });
  assert.equal(result.days[0].replaceableCurrentLoadMinutes, 200);
  assert.equal(result.days[0].currentPlanLoadMinutes, 200);
  assert.equal(result.days[0].proposedLoadMinutes, 200);
  assert.deepEqual(result.repairs.map(row => row.proposedSegments[0].sortOrder), [1, 0]);
});

test("failed candidate rolls back every tentative minute before next candidate", () => {
  const result = preview([
    repair(1, { estimatedWorkMinutes: 700 }), repair(2, { estimatedWorkMinutes: 100 }),
  ], { capacities: [300, 0, 300], priorities: { 1: 10 } });
  assert.equal(result.repairs[0].unplacedReason, "NO_CAPACITY_IN_WINDOW");
  assert.deepEqual(result.repairs[0].proposedSegments, []);
  assert.equal(result.repairs[1].proposedSummaryDate, "2026-10-01");
  assert.equal(result.days[0].proposedLoadMinutes, 100);
});

test("remaining work overrides estimate; zero is unavailable", () => {
  const result = preview([repair(1, { estimatedWorkMinutes: 600, remainingWorkMinutes: 40 }),
    repair(2, { remainingWorkMinutes: 0 })]);
  assert.equal(result.repairs[0].proposedSegments[0].plannedMinutes, 40);
  assert.equal(result.repairs[1].unplacedReason, "WORK_MINUTES_UNAVAILABLE");
});

test("dated parts shift start; blocked, unknown parts and expired deadline fail closed", () => {
  const result = preview([
    repair(1, { partsReadinessState: "WAITING", partsReadyDate: "2026-10-02", reviewDate: "2026-10-03" }),
    repair(2, { blocked: true, resumeEligibleDate: "2026-10-02" }),
    repair(3, { partsReadinessState: "WAITING_UNKNOWN" }),
    repair(4, { partsReadinessState: "LEGACY_UNKNOWN" }),
    repair(5, { deliveryDateExpected: "2026-09-30" }),
  ]);
  assert.equal(result.repairs[0].proposedSummaryDate, "2026-10-02");
  assert.deepEqual(result.repairs.slice(1).map(row => row.unplacedReason), [
    "BLOCKED_REQUIRES_MANUAL_RESUME", "PARTS_WAITING_UNKNOWN", "PARTS_LEGACY_UNKNOWN", "DEADLINE_WINDOW_PASSED",
  ]);
});

test("locked repair with no date is warned and is never proposed", () => {
  const result = preview([repair(1, { scheduleLocked: true })]);
  assert.equal(result.repairs[0].unplacedReason, "LOCKED_WITHOUT_DATE");
  assert.deepEqual(result.repairs[0].proposedSegments, []);
});

test("Task184 ordering uses priority, delivery date, exact reception time, then ID", () => {
  const result = preview([
    repair(1, { estimatedWorkMinutes: 100 }), repair(2, { estimatedWorkMinutes: 100 }),
    repair(3, { estimatedWorkMinutes: 100, deliveryDateExpected: "2026-10-02" }),
    repair(4, { estimatedWorkMinutes: 100 }), repair(5, { estimatedWorkMinutes: 100 }),
  ], { horizon: 1, capacities: [500], priorities: { 3: 1 }, receptions: {
    1: "2026-09-01T12:00:00.000Z", 2: "2026-09-01T09:00:00.000Z",
    4: "2026-09-01T09:00:00.000Z", 5: null,
  } });
  assert.deepEqual(result.repairs.map(row => [row.id, row.proposedSegments[0].sortOrder]), [
    [1, 3], [2, 1], [3, 0], [4, 2], [5, 4],
  ]);
});

test("process buffer closes the deadline window and prevents partial allocation", () => {
  const result = preview([repair(1, { estimatedWorkMinutes: 500 })], {
    capacities: [300, 300, 300], buffers: [0, 0, 1],
  });
  assert.equal(result.repairs[0].latestWorkCompletionDate, "2026-10-02");
  assert.deepEqual(result.repairs[0].proposedSegments.map(row => row.plannedMinutes), [300, 200]);
  const tooLarge = preview([repair(1, { estimatedWorkMinutes: 700 })], {
    capacities: [300, 300, 300], buffers: [0, 0, 1],
  });
  assert.equal(tooLarge.repairs[0].unplacedReason, "NO_CAPACITY_IN_WINDOW");
  assert.equal(tooLarge.days[0].proposedLoadMinutes, 0);
  const unconfigured = preview([repair(1)], { buffers: [null, 0, 0] });
  assert.equal(unconfigured.repairs[0].unplacedReason, "PROCESS_BUFFER_UNSET");
});
