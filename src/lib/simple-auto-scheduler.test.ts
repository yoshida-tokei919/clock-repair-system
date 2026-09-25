import assert from "node:assert/strict";
import test from "node:test";
import { assertScheduleRevision, scheduleRevision, StaleScheduleError } from "./auto-schedule-revision";
import { buildSchedulePreview, isScheduleChange, todayInJapan, workReadiness, type ScheduleRepair } from "./simple-auto-scheduler";
import { parseWorkDate } from "./work-calendar";

function repair(id: number, overrides: Partial<ScheduleRepair> = {}): ScheduleRepair {
  return {
    id, inquiryNumber: `R-${id}`, status: "作業待ち", scheduleLocked: false,
    scheduledDate: null, estimatedWorkMinutes: 240, priorityScore: 0,
    deliveryDateExpected: null, receptionDate: null, ...overrides,
  };
}

test("Japan calendar day and default 480-minute capacity", () => {
  assert.equal(todayInJapan(new Date("2026-09-24T15:01:00Z")), "2026-09-25");
  const plan = buildSchedulePreview("2026-09-25", [repair(1), repair(2), repair(3)], [], 2);
  assert.deepEqual(plan.placements.map(row => row.proposedDate), ["2026-09-25", "2026-09-25", "2026-09-26"]);
  assert.deepEqual(plan.days.map(day => day.proposedMinutes), [480, 240]);
  assert.deepEqual(plan.days[0].proposedItems.map(item => item.inquiryNumber), ["R-1", "R-2"]);
});

test("WorkCalendar exceptions, locked reservations, and overbooked days", () => {
  const plan = buildSchedulePreview("2026-09-25", [
    repair(1, { scheduleLocked: true, scheduledDate: parseWorkDate("2026-09-25"), estimatedWorkMinutes: 300 }),
    repair(2, { scheduleLocked: true, scheduledDate: parseWorkDate("2026-09-26"), estimatedWorkMinutes: 500 }),
    repair(3, { scheduledDate: parseWorkDate("2026-09-25"), estimatedWorkMinutes: 240 }),
    repair(4, { scheduleLocked: true, scheduledDate: null }),
    repair(5, { scheduleLocked: true, estimatedWorkMinutes: 0 }),
    repair(6, { scheduleLocked: true, status: "作業完了", scheduledDate: parseWorkDate("2026-09-27"), estimatedWorkMinutes: 480 }),
  ], [
    { workDate: parseWorkDate("2026-09-25"), availableMinutes: 0, note: "休み" },
    { workDate: parseWorkDate("2026-09-27"), availableMinutes: 240, note: null },
  ], 3);
  assert.deepEqual(plan.days.map(day => day.lockedMinutes), [300, 500, 0]);
  assert.deepEqual(plan.days[0].lockedItems.map(item => [item.inquiryNumber, item.minutes]), [["R-1", 300]]);
  assert.equal(plan.placements[0].proposedDate, "2026-09-27");
  assert.equal(plan.lockedWithoutDate, 1);
  assert.equal(plan.lockedWithoutEstimate, 1);
});

test("only work-waiting, unlocked positive estimates are placed in deterministic order", () => {
  const rows = [
    repair(9, { priorityScore: 5, deliveryDateExpected: parseWorkDate("2026-10-02") }),
    repair(5, { priorityScore: 5, deliveryDateExpected: parseWorkDate("2026-10-01"), receptionDate: parseWorkDate("2026-09-22") }),
    repair(4, { priorityScore: 5, deliveryDateExpected: parseWorkDate("2026-10-01"), receptionDate: parseWorkDate("2026-09-22") }),
    repair(3, { priorityScore: 5, deliveryDateExpected: parseWorkDate("2026-10-01"), receptionDate: parseWorkDate("2026-09-21") }),
    repair(2, { priorityScore: 10 }),
    repair(10, { status: "部品入荷済み" }),
    repair(11, { estimatedWorkMinutes: 0, scheduledDate: parseWorkDate("2026-09-25") }),
    repair(12, { scheduleLocked: true, scheduledDate: parseWorkDate("2026-09-25") }),
  ];
  const plan = buildSchedulePreview("2026-09-25", rows, [], 3);
  assert.deepEqual(plan.placements.map(row => row.id), [2, 3, 4, 5, 9]);
  assert.deepEqual(plan.placements.map(row => row.proposedDate), ["2026-09-25", "2026-09-26", "2026-09-26", "2026-09-27", "2026-09-27"]);
  assert.equal(rows[6].scheduledDate?.toISOString().slice(0, 10), "2026-09-25");
});

test("capacity shortage leaves a candidate unplaced and never exceeds available minutes", () => {
  const plan = buildSchedulePreview("2026-09-25", [repair(1, { estimatedWorkMinutes: 481, scheduledDate: parseWorkDate("2026-09-30") }), repair(2, { estimatedWorkMinutes: 480 })], [], 1);
  assert.deepEqual(plan.placements.map(row => row.proposedDate), [null, "2026-09-25"]);
  assert.equal(plan.placements[0].previousDate, "2026-09-30");
  assert.equal(plan.placements[0].unplacedReason, "1日の作業可能時間に収まらないため配置できません");
  assert.equal(isScheduleChange(plan.placements[0]), false);
  assert.equal(isScheduleChange(plan.placements[1]), true);
  assert.equal(plan.days[0].proposedMinutes, 480);
});

test("remaining-capacity shortage has a distinct reason and preserves an existing date", () => {
  const plan = buildSchedulePreview("2026-09-25", [
    repair(1, { scheduleLocked: true, scheduledDate: parseWorkDate("2026-09-25"), estimatedWorkMinutes: 300 }),
    repair(2, { estimatedWorkMinutes: 240, scheduledDate: parseWorkDate("2026-09-28") }),
  ], [], 1);
  assert.equal(plan.placements[0].proposedDate, null);
  assert.equal(plan.placements[0].unplacedReason, "期間内の空き時間が足りないため配置できません");
  assert.equal(plan.placements[0].previousDate, "2026-09-28");
  assert.equal(isScheduleChange(plan.placements[0]), false);
});

test("readiness reasons use Repair status and schedule fields only", () => {
  assert.deepEqual(workReadiness(repair(1)), { kind: "ready", reason: null });
  assert.equal(workReadiness(repair(2, { scheduleLocked: true })).reason, "予定日が固定されています");
  assert.equal(workReadiness(repair(3, { estimatedWorkMinutes: 0 })).reason, "想定作業時間が未入力です");
  const reasons: Record<string, string> = {
    "送付待ち": "時計の送付待ち", "受付": "受付段階", "見積中": "見積中", "承認待ち": "承認待ち",
    "部品待ち(未注文)": "部品待ち（未注文）", "部品待ち(注文済み)": "部品待ち（注文済み）",
    "部品入荷済み": "作業待ちへの変更待ち", "作業中": "作業中", "保留": "保留中",
  };
  for (const [status, reason] of Object.entries(reasons)) {
    assert.equal(workReadiness(repair(4, { status })).reason, reason);
  }
  assert.equal(workReadiness(repair(5, { status: "独自状態" })).reason, "作業待ち以外の状態（独自状態）");
  assert.equal(workReadiness(repair(5, { status: "constructor" })).reason, "作業待ち以外の状態（constructor）");
  assert.equal(workReadiness(repair(6, { status: "作業完了" })).kind, "completed");
  const plan = buildSchedulePreview("2026-09-25", [repair(7, { status: "保留" }), repair(8, { estimatedWorkMinutes: 0 })], [], 1);
  assert.deepEqual(plan.exclusions.map(row => row.reason), ["保留中", "想定作業時間が未入力です"]);
});

test("an unlocked existing date is reconsidered while a locked date stays fixed", () => {
  const plan = buildSchedulePreview("2026-09-25", [
    repair(1, { scheduledDate: parseWorkDate("2026-09-20") }),
    repair(2, { scheduleLocked: true, scheduledDate: parseWorkDate("2026-09-25"), estimatedWorkMinutes: 300 }),
  ], [], 2);
  assert.equal(plan.placements[0].previousDate, "2026-09-20");
  assert.equal(plan.placements[0].proposedDate, "2026-09-26");
  assert.equal(plan.days[0].lockedMinutes, 300);
});

test("snapshot revision rejects stale preview when repair or calendar state changes", () => {
  const original = { startDate: "2026-09-25", repairs: [repair(1)], exceptions: [] as unknown[] };
  const revision = scheduleRevision(original);
  assertScheduleRevision(revision, scheduleRevision(original));
  assert.throws(() => assertScheduleRevision(revision, scheduleRevision({ ...original, repairs: [repair(1, { status: "保留" })] })), StaleScheduleError);
  assert.throws(() => assertScheduleRevision(revision, scheduleRevision({ ...original, exceptions: [{ date: "2026-09-25", availableMinutes: 0 }] })), StaleScheduleError);
});
