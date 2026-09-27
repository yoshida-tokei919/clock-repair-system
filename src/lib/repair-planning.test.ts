import assert from "node:assert/strict";
import test from "node:test";
import { parseRepairPlanningAction, planningStateView } from "./repair-planning";

test("block validates enum, exact keys, trims note, keeps zero and dates", () => {
  assert.deepEqual(parseRepairPlanningAction({
    action: "block", blockReason: "WAITING_PARTS", blockReasonNote: "  確認中  ",
    remainingWorkMinutes: 0, resumeEligibleDate: "2026-09-28", reviewDate: null,
  }), {
    action: "block", blockReason: "WAITING_PARTS", blockReasonNote: "確認中",
    remainingWorkMinutes: 0, resumeEligibleDate: new Date("2026-09-28T00:00:00Z"), reviewDate: null,
  });
  const blankNote = parseRepairPlanningAction({ action: "block", blockReason: "OTHER", blockReasonNote: " " });
  assert.equal(blankNote.action === "block" && blankNote.blockReasonNote, null);
  for (const value of [
    { action: "block", blockReason: "INVALID" },
    { action: "block" },
    { action: "block", blockReason: "OTHER", extra: 1 },
    { action: "block", blockReason: "OTHER", remainingWorkMinutes: -1 },
    { action: "block", blockReason: "OTHER", remainingWorkMinutes: 0.5 },
    { action: "block", blockReason: "OTHER", resumeEligibleDate: "2026-02-30" },
    { action: "block", blockReason: "OTHER", reviewDate: "2026-9-1" },
    { action: "resume", blockReason: "OTHER" },
  ]) assert.throws(() => parseRepairPlanningAction(value));
});

test("resume has no extra fields and view preserves remaining minutes", () => {
  assert.deepEqual(parseRepairPlanningAction({ action: "resume" }), { action: "resume" });
  assert.deepEqual(planningStateView(null), {
    blocked: false, blockReason: null, blockReasonNote: null, remainingWorkMinutes: null,
    resumeEligibleDate: null, reviewDate: null,
  });
  assert.equal(planningStateView({ blocked: false, blockReason: null, blockReasonNote: null,
    remainingWorkMinutes: 0, resumeEligibleDate: null, reviewDate: null }).remainingWorkMinutes, 0);
});
