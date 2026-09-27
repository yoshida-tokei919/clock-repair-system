import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDeadlineCapacityPreview, type PreviewRepair, type PreviewSettings } from "./deadline-capacity-preview-domain";
import { parseWorkDate } from "./work-calendar";

const settings: PreviewSettings = {
  dailyScheduleReviewMinutes: 0, activityReservedMinutes: 0,
  runningTestDays: 3, reworkBufferDays: 3, shippingBufferDays: 1,
};
const repair = (id: number, changes: Partial<PreviewRepair> = {}): PreviewRepair => ({
  id, inquiryNumber: `T-${id}`, status: "作業待ち", scheduledDate: null, scheduleLocked: false,
  estimatedWorkMinutes: 60, remainingWorkMinutes: null, deliveryDateExpected: "2026-10-20",
  partsReadinessState: "NOT_REQUIRED", partsReadyDate: null, blocked: false,
  resumeEligibleDate: null, reviewDate: null, ...changes,
});
const preview = (repairs: PreviewRepair[] = [], overrides: {
  settings?: Partial<PreviewSettings>; calendar?: { date: string; minutes: number }[]; horizonDays?: number;
} = {}) => resolveDeadlineCapacityPreview({
  asOfDate: "2026-10-01", repairs, settings: { ...settings, ...overrides.settings },
  workCalendar: (overrides.calendar ?? []).map(row => ({ workDate: parseWorkDate(row.date),
    availableMinutes: row.minutes, note: null })), horizonDays: overrides.horizonDays ?? 15,
});

test("gross capacity follows WorkCalendar including zero and partial days", () => {
  const result = preview([], { calendar: [
    { date: "2026-10-02", minutes: 0 }, { date: "2026-10-03", minutes: 240 },
  ] });
  assert.deepEqual(result.days.slice(0, 3).map(day => day.grossCapacityMinutes), [480, 0, 240]);
});

test("review and activity reservations reduce capacity and report excess", () => {
  const result = preview([], { settings: { dailyScheduleReviewMinutes: 30, activityReservedMinutes: 60 },
    calendar: [{ date: "2026-10-02", minutes: 0 }] });
  assert.equal(result.days[0].totalReservedMinutes, 90);
  assert.equal(result.days[0].effectiveRepairCapacityMinutes, 390);
  assert.equal(result.days[1].effectiveRepairCapacityMinutes, 0);
  assert.equal(result.days[1].overReservedMinutes, 90);
  assert.equal(result.overReservedDayCount, 1);
});

test("fixed and provisional load include nonterminal scheduled repairs, including blocked locked repair", () => {
  const result = preview([
    repair(1, { scheduledDate: "2026-10-01", scheduleLocked: true, blocked: true, estimatedWorkMinutes: 90 }),
    repair(2, { scheduledDate: "2026-10-01", estimatedWorkMinutes: 60 }),
    repair(3, { scheduledDate: "2026-10-01", status: "納品済み", estimatedWorkMinutes: 999 }),
  ], { settings: { dailyScheduleReviewMinutes: 30, activityReservedMinutes: 20 } });
  const day = result.days[0];
  assert.equal(day.fixedLoadMinutes, 90);
  assert.equal(day.provisionalLoadMinutes, 60);
  assert.equal(day.currentPlanLoadMinutes, 150);
  assert.equal(day.fixedRemainingMinutes, 340);
  assert.equal(day.currentPlanRemainingMinutes, 280);
  assert.deepEqual(day.fixedItems.map(item => item.id), [1]);
});

test("remaining time has precedence, zero is unavailable, then estimate is fallback", () => {
  const result = preview([repair(1, { remainingWorkMinutes: 20 }),
    repair(2, { remainingWorkMinutes: 0 }), repair(3)]);
  assert.deepEqual(result.repairs.map(row => [row.workMinutes, row.workMinutesSource, row.analysisReason]), [
    [20, "REMAINING_WORK", "READY"], [null, null, "WORK_MINUTES_UNAVAILABLE"],
    [60, "ESTIMATED_WORK", "READY"],
  ]);
});

test("ready and not-required parts permit analysis; dated waiting shifts earliest date", () => {
  const result = preview([repair(1, { partsReadinessState: "READY" }),
    repair(2, { partsReadinessState: "WAITING", partsReadyDate: "2026-10-05" })]);
  assert.equal(result.repairs[0].analysisReason, "READY");
  assert.equal(result.repairs[1].projectedEarliestDate, "2026-10-05");
  assert.equal(result.repairs[1].firstAvailableDateAgainstCurrentPlan, "2026-10-05");
});

test("unknown and legacy parts readiness fail closed", () => {
  const result = preview([repair(1, { partsReadinessState: "WAITING_UNKNOWN" }),
    repair(2, { partsReadinessState: "LEGACY_UNKNOWN" })]);
  assert.deepEqual(result.repairs.map(row => [row.projectedEarliestDate, row.firstAvailableDateAgainstCurrentPlan, row.analysisReason]), [
    [null, null, "PARTS_WAITING_UNKNOWN"], [null, null, "PARTS_LEGACY_UNKNOWN"],
  ]);
});

test("blocked repairs show only potential date and require manual resume", () => {
  const result = preview([repair(1, { blocked: true, resumeEligibleDate: "2026-10-04",
    reviewDate: "2026-10-02", partsReadinessState: "WAITING", partsReadyDate: "2026-10-03" }),
    repair(2, { blocked: true })]);
  assert.equal(result.repairs[0].potentialEarliestDate, "2026-10-04");
  assert.equal(result.repairs[0].projectedEarliestDate, null);
  assert.equal(result.repairs[0].firstAvailableDateAgainstCurrentPlan, null);
  assert.equal(result.repairs[0].analysisReason, "BLOCKED_REQUIRES_MANUAL_RESUME");
  assert.equal(result.repairs[1].potentialEarliestDate, "2026-10-01");
  assert.equal(result.repairs[1].analysisReason, "BLOCKED_REQUIRES_MANUAL_RESUME");
});

test("calendar-day process buffers reverse deadline; explicit zero is configured", () => {
  const result = preview([repair(1)], { settings: {
    runningTestDays: 3, reworkBufferDays: 3, shippingBufferDays: 1,
  } });
  assert.equal(result.repairs[0].latestWorkCompletionDate, "2026-10-13");
  assert.equal(result.repairs[0].slackDays, 12);
  const zero = preview([repair(1)], { settings: {
    runningTestDays: 0, reworkBufferDays: 0, shippingBufferDays: 0,
  } });
  assert.equal(zero.processBufferSettings.configured, true);
  assert.equal(zero.repairs[0].latestWorkCompletionDate, "2026-10-20");
});

test("null process buffers fail closed without 3/3/1 fallback", () => {
  const result = preview([repair(1)], { settings: { reworkBufferDays: null } });
  assert.equal(result.processBufferSettings.configured, false);
  assert.equal(result.repairs[0].latestWorkCompletionDate, null);
  assert.equal(result.repairs[0].analysisReason, "PROCESS_BUFFER_UNSET");
});

test("deadline unset and passed window are explicit", () => {
  const result = preview([repair(1, { deliveryDateExpected: null }),
    repair(2, { deliveryDateExpected: "2026-10-05" })]);
  assert.equal(result.repairs[0].analysisReason, "DEADLINE_UNSET");
  assert.equal(result.repairs[1].analysisReason, "DEADLINE_WINDOW_PASSED");
});

test("self load is excluded when evaluating a current planned repair", () => {
  const result = preview([repair(1, { scheduledDate: "2026-10-01", estimatedWorkMinutes: 400 }),
    repair(2, { scheduledDate: "2026-10-01", estimatedWorkMinutes: 80 })]);
  assert.equal(result.repairs[0].firstAvailableDateAgainstCurrentPlan, "2026-10-01");
  assert.equal(result.repairs[1].firstAvailableDateAgainstCurrentPlan, "2026-10-01");
});

test("locked date remains fixed and conflicts are shown", () => {
  const result = preview([repair(1, { scheduledDate: "2026-10-01", scheduleLocked: true,
    partsReadinessState: "WAITING", partsReadyDate: "2026-10-03" })]);
  assert.equal(result.days[0].fixedLoadMinutes, 60);
  assert.equal(result.repairs[0].analysisReason, "LOCKED_DATE_CONFLICT");
  assert.equal(result.repairs[0].currentPlanConstraintConflict, true);
});

test("scheduled blocked and unknown-parts repairs retain load and expose constraint conflicts", () => {
  const result = preview([repair(1, { scheduledDate: "2026-10-01", blocked: true }),
    repair(2, { scheduledDate: "2026-10-01", partsReadinessState: "WAITING_UNKNOWN" })]);
  assert.equal(result.days[0].provisionalLoadMinutes, 120);
  assert.deepEqual(result.repairs.map(row => [row.analysisReason, row.analysisStatus, row.currentPlanConstraintConflict]), [
    ["BLOCKED_REQUIRES_MANUAL_RESUME", "CONFLICT", true],
    ["PARTS_WAITING_UNKNOWN", "CONFLICT", true],
  ]);
});

test("one-day absolute limit differs from current-plan congestion", () => {
  const result = preview([
    repair(1, { estimatedWorkMinutes: 500, deliveryDateExpected: "2026-10-08" }),
    repair(2, { estimatedWorkMinutes: 300, scheduledDate: "2026-10-01", scheduleLocked: true }),
    repair(3, { estimatedWorkMinutes: 250, deliveryDateExpected: "2026-10-08" }),
  ], { horizonDays: 2, calendar: [{ date: "2026-10-02", minutes: 0 }] });
  assert.equal(result.repairs[0].analysisReason, "REQUIRES_SPLIT_SCHEDULER");
  assert.equal(result.repairs[2].analysisReason, "NO_CAPACITY_IN_WINDOW");
});

test("overbooking is reported without moving current plans", () => {
  const result = preview([repair(1, { scheduledDate: "2026-10-01", estimatedWorkMinutes: 390 }),
    repair(2, { scheduledDate: "2026-10-01", estimatedWorkMinutes: 210 })]);
  assert.equal(result.days[0].overbookedMinutes, 120);
  assert.equal(result.overbookedDayCount, 1);
  assert.equal(result.repairs[0].analysisReason, "CURRENT_PLAN_CONFLICT");
});

test("horizon is explicit when the feasible window starts later", () => {
  const result = preview([repair(1, { partsReadinessState: "WAITING", partsReadyDate: "2026-10-10" })],
    { horizonDays: 2 });
  assert.equal(result.repairs[0].analysisReason, "BEYOND_PREVIEW_HORIZON");
});

test("future capacity beyond the horizon is not classified as an absolute shortage", () => {
  const result = preview([repair(1, { estimatedWorkMinutes: 500 })], { horizonDays: 2 });
  assert.equal(result.repairs[0].analysisReason, "BEYOND_PREVIEW_HORIZON");
  assert.equal(result.repairs[0].analysisStatus, "INFORMATIONAL");
});

test("unlocked and locked plans beyond the horizon remain informational when constraints are met", () => {
  const result = preview([
    repair(1, { scheduledDate: "2026-10-10", partsReadinessState: "WAITING", partsReadyDate: "2026-10-05" }),
    repair(2, { scheduledDate: "2026-10-10", scheduleLocked: true, partsReadinessState: "WAITING", partsReadyDate: "2026-10-05" }),
  ], { horizonDays: 2 });
  assert.deepEqual(result.repairs.map(row => [row.analysisReason, row.analysisStatus, row.currentPlanConstraintConflict]), [
    ["BEYOND_PREVIEW_HORIZON", "INFORMATIONAL", false],
    ["BEYOND_PREVIEW_HORIZON", "INFORMATIONAL", false],
  ]);
});

test("a planned date after the deadline conflicts even beyond the preview horizon", () => {
  const result = preview([
    repair(1, { scheduledDate: "2026-10-14" }),
    repair(2, { scheduledDate: "2026-10-14", scheduleLocked: true }),
  ], { horizonDays: 2 });
  assert.deepEqual(result.repairs.map(row => [row.analysisReason, row.analysisStatus, row.currentPlanConstraintConflict]), [
    ["CURRENT_PLAN_CONFLICT", "CONFLICT", true],
    ["LOCKED_DATE_CONFLICT", "CONFLICT", true],
  ]);
});

test("a planned date before parts readiness conflicts even beyond the preview horizon", () => {
  const result = preview([
    repair(1, { scheduledDate: "2026-10-10", partsReadinessState: "WAITING", partsReadyDate: "2026-10-11" }),
    repair(2, { scheduledDate: "2026-10-10", scheduleLocked: true,
      partsReadinessState: "WAITING", partsReadyDate: "2026-10-11" }),
  ], { horizonDays: 2 });
  assert.deepEqual(result.repairs.map(row => [row.analysisReason, row.currentPlanConstraintConflict]), [
    ["CURRENT_PLAN_CONFLICT", true], ["LOCKED_DATE_CONFLICT", true],
  ]);
});

test("zero effective capacity throughout the deadline window is a capacity shortage", () => {
  const result = preview([repair(1, { deliveryDateExpected: "2026-10-09" })], {
    horizonDays: 2,
    calendar: [{ date: "2026-10-01", minutes: 0 }, { date: "2026-10-02", minutes: 0 }],
  });
  assert.equal(result.repairs[0].analysisReason, "NO_CAPACITY_IN_WINDOW");
  assert.equal(result.repairs[0].analysisStatus, "UNAVAILABLE");
});

test("work exceeding positive daily capacity requires a split scheduler", () => {
  const result = preview([repair(1, { estimatedWorkMinutes: 600, deliveryDateExpected: "2026-10-09" })], {
    horizonDays: 2, settings: { dailyScheduleReviewMinutes: 90 },
  });
  assert.equal(result.days[0].effectiveRepairCapacityMinutes, 390);
  assert.equal(result.repairs[0].analysisReason, "REQUIRES_SPLIT_SCHEDULER");
});

test("work fitting daily capacity but blocked by current load has no capacity in the window", () => {
  const result = preview([
    repair(1, { estimatedWorkMinutes: 250, deliveryDateExpected: "2026-10-08" }),
    repair(2, { estimatedWorkMinutes: 300, scheduledDate: "2026-10-01", scheduleLocked: true }),
  ], { horizonDays: 2, calendar: [{ date: "2026-10-02", minutes: 0 }] });
  assert.equal(result.repairs[0].analysisReason, "NO_CAPACITY_IN_WINDOW");
});
