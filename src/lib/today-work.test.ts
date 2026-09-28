import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TodayWorkView } from "../components/repairs/TodayWorkView";
import { resolveDeadlineCapacityPreview, type PreviewRepair } from "./deadline-capacity-preview-domain";
import { todayInJapan } from "./simple-auto-scheduler";
import { buildTodayWork } from "./today-work";
import { parseWorkDate } from "./work-calendar";

const today = "2026-10-01";
const repair = (id: number, changes: Partial<PreviewRepair> = {}): PreviewRepair => ({
  id, inquiryNumber: `T-${id}`, status: "作業待ち", scheduledDate: today,
  scheduleLocked: false, estimatedWorkMinutes: 120, remainingWorkMinutes: null,
  deliveryDateExpected: "2026-10-10", partsReadinessState: "READY", partsReadyDate: null,
  blocked: false, resumeEligibleDate: null, reviewDate: null, ...changes,
});
type Segment = { repairId: number; workDate: string; plannedMinutes: number };
function work(repairs: PreviewRepair[], options: {
  segments?: Segment[]; gross?: number; review?: number; activity?: number;
  priorities?: Record<number, number>; receptions?: Record<number, string | null>;
} = {}) {
  const base = resolveDeadlineCapacityPreview({ asOfDate: today, repairs,
    workCalendar: [{ workDate: parseWorkDate(today), availableMinutes: options.gross ?? 480, note: null }],
    settings: { dailyScheduleReviewMinutes: options.review ?? 0,
      activityReservedMinutes: options.activity ?? 0, runningTestDays: 0, reworkBufferDays: 0,
      shippingBufferDays: 0 }, horizonDays: 2 });
  return buildTodayWork({ today, day: base.days[0], repairs: base.repairs,
    segments: options.segments ?? [], metadata: repairs.map(row => ({ id: row.id,
      priorityScore: options.priorities?.[row.id] ?? 0,
      receptionDate: options.receptions?.[row.id] ?? null })) });
}

test("today segment is authoritative and contributes only today's minutes", () => {
  const result = work([repair(1, { estimatedWorkMinutes: 600, remainingWorkMinutes: 0 })], { segments: [
    { repairId: 1, workDate: today, plannedMinutes: 90 },
    { repairId: 1, workDate: "2026-10-02", plannedMinutes: 300 },
  ] });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].plannedMinutes, 90);
  assert.equal(result.rows[0].planSource, "segment");
  assert.equal(result.capacity.plannedMinutes, 90);
});

test("a segment on another date suppresses the legacy today summary", () => {
  const result = work([repair(1)], { segments: [
    { repairId: 1, workDate: "2026-10-02", plannedMinutes: 120 },
  ] });
  assert.equal(result.rows.length, 0);
  assert.equal(result.capacity.plannedMinutes, 0);
});

test("legacy plan uses canonical work minutes and zero remaining contributes no load", () => {
  const result = work([repair(1, { remainingWorkMinutes: 50, estimatedWorkMinutes: 120 })]);
  assert.deepEqual(result.rows.map(row => [row.id, row.plannedMinutes, row.planSource]), [[1, 50, "legacy"]]);
  const completed = work([repair(1, { remainingWorkMinutes: 0, estimatedWorkMinutes: 120 })]);
  assert.deepEqual(completed.rows.map(row => [row.id, row.plannedMinutes, row.planSource, row.section]),
    [[1, 0, "legacy", "status"]]);
  assert.equal(completed.capacity.plannedMinutes, 0);
  assert.equal(completed.capacity.remainingMinutes, completed.capacity.effectiveMinutes);
});

test("priority, due, reception, and id order matches Task184/193", () => {
  const result = work([
    repair(5, { deliveryDateExpected: null }), repair(4, { deliveryDateExpected: "2026-10-05" }),
    repair(3, { deliveryDateExpected: "2026-10-05" }), repair(2, { deliveryDateExpected: "2026-10-03" }),
    repair(1, { deliveryDateExpected: null }),
  ], { priorities: { 1: 1, 2: 2, 3: 2, 4: 2, 5: 2 },
    receptions: { 3: "2026-09-01T10:00:00.000Z", 4: "2026-09-01T09:00:00.000Z", 5: null } });
  assert.deepEqual(result.rows.map(row => row.id), [2, 4, 3, 5, 1]);
  assert.deepEqual(work([repair(7), repair(6)]).rows.map(row => row.id), [6, 7]);
});

test("parts waiting, blocked, and resume eligible states are mutually exclusive", () => {
  const result = work([
    repair(1), repair(2, { blocked: true, resumeEligibleDate: "2026-10-02" }),
    repair(3, { blocked: true, resumeEligibleDate: today }),
    repair(4, { partsReadinessState: "WAITING", partsReadyDate: "2026-10-04" }),
    repair(5, { blocked: true, resumeEligibleDate: today, partsReadinessState: "WAITING_UNKNOWN" }),
  ]);
  assert.deepEqual(result.rows.map(row => row.section), ["ready", "blocked", "resume", "parts", "parts"]);
  assert.equal(result.rows[4].blocked, true);
});

test("capacity uses canonical load once, reservations, floor and overbooked", () => {
  const result = work([repair(1, { estimatedWorkMinutes: 300 }), repair(2, { estimatedWorkMinutes: 100 })], {
    segments: [{ repairId: 1, workDate: today, plannedMinutes: 250 }],
    gross: 400, review: 30, activity: 50,
  });
  assert.deepEqual(result.capacity, {
    grossMinutes: 400, reservedMinutes: 80, effectiveMinutes: 320,
    overReservedMinutes: 0, plannedMinutes: 350, remainingMinutes: 0, overbookedMinutes: 30,
  });
});

test("over-reserved calendar day has zero effective capacity", () => {
  const result = work([repair(1)], { gross: 40, review: 30, activity: 20 });
  assert.equal(result.capacity.effectiveMinutes, 0);
  assert.equal(result.capacity.overReservedMinutes, 10);
  assert.equal(result.capacity.overbookedMinutes, 120);
});

test("Tokyo boundary follows the existing scheduler helper", () => {
  assert.equal(todayInJapan(new Date("2026-09-30T14:59:59Z")), "2026-09-30");
  assert.equal(todayInJapan(new Date("2026-09-30T15:00:00Z")), today);
});

test("attention flags use existing dates and each row links to its own timer", () => {
  const result = work([repair(7, { deliveryDateExpected: "2026-09-30", blocked: true,
    resumeEligibleDate: today })]);
  assert.equal(result.rows[0].overdue, true);
  assert.equal(result.rows[0].deadlineConflict, true);
  const html = renderToStaticMarkup(createElement(TodayWorkView, { work: result }));
  assert.match(html, /href="\/repairs\/7#repair-timer-heading"/);
  assert.match(html, /納期超過/);
});

test("executable row connects the common timer start to its Repair id", () => {
  const source = readFileSync("src/components/repairs/TodayWorkView.tsx", "utf8");
  assert.match(source, /row\.section === "ready" && <WorkTimerStartButton input=\{\{ activityType: "REPAIR", repairId: row\.id/);
  assert.match(source, /修理タイマー開始 \{row\.inquiryNumber\}/);
});
