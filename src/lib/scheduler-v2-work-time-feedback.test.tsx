import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkTimeFeedbackCell } from "../components/repairs/SchedulerV2Preview";
import { resolveRepairWorkTimePreview } from "./repair-work-time-preview-domain";
import { loadSchedulerV2WorkTimeFeedback, resolveSchedulerV2WorkTimeFeedback } from "./scheduler-v2-work-time-feedback";

const now = new Date("2026-09-27T12:00:00Z");
const setting = { repairLearningMode: "MANUAL" as const, repairLearningMinimumSamples: 2,
  repairFullSampleThreshold: 10, repairEarlyAggregationMethod: "MEDIAN" as const,
  defaultAggregationMethod: "MEAN" as const, repairLookbackMonths: 6, repairOutlierMethod: "NONE" as const };
const standard = { id: 1, repairType: "INTERNAL" as const, categoryId: 4,
  targetPartNameId: null, actionId: null, detailLabel: null, driveType: null, standardMinutes: 90 };
const labor = { id: 20, lineType: "LABOR" as const, repairWorkCategoryId: 4,
  repairWorkCategory: { repairType: "INTERNAL" as const }, targetPartNameId: null,
  repairWorkActionId: null, detailLabelSnapshot: null };
const repair = { id: 10, estimatedWorkMinutes: 60, movementCaliberId: 5, baseMovementCaliberId: null,
  watch: { brandId: 1, modelId: null, referenceId: null, caseReferenceId: null,
    caliberId: null, baseCaliberId: null, driveType: null }, repairLineItems: [labor] };
const session = (repairId: number, minutes: number) => ({ activityType: "REPAIR" as const,
  repairId, inquiryId: null, orderRequestId: null, contextSchemaVersion: 1,
  contextSnapshot: { work: { lineType: "LABOR", repairType: "INTERNAL", repairWorkCategoryId: 4,
    targetPartNameId: null, repairWorkActionId: null, detailLabel: null },
    repair: { movementCaliberId: 5 } },
  startedAt: new Date(now.getTime() - minutes * 60_000), endedAt: now, invalidatedAt: null });
function feedback(overrides: Record<string, unknown> = {}, current = 60) {
  const preview = resolveRepairWorkTimePreview({ repair, standards: [standard],
    schedulerSetting: setting, sessions: [], now, ...overrides });
  return resolveSchedulerV2WorkTimeFeedback(preview, current);
}

test("complete recommendation and equal saved estimate have correct statuses and delta", () => {
  assert.deepEqual(feedback(), {
    currentEstimatedWorkMinutes: 60, recommendedEstimatedWorkMinutes: 90,
    deltaMinutes: 30, status: "RECOMMENDED_CHANGE", previewStatus: "COMPLETE",
    evidence: [{ adoptedReason: "MANUAL_STANDARD", adoptedTier: null, usableSampleCount: null }],
  });
  assert.equal(feedback({}, 90).status, "UP_TO_DATE");
  assert.equal(feedback({}, 90).deltaMinutes, 0);
});

test("incomplete, absent labor, and nonpositive rounded totals are unavailable", () => {
  const incomplete = feedback({ repair: { ...repair, repairLineItems: [labor,
    { ...labor, id: 21, repairWorkCategoryId: null, repairWorkCategory: null }] } });
  assert.equal(incomplete.previewStatus, "INCOMPLETE");
  assert.equal(incomplete.status, "UNAVAILABLE");
  assert.equal(incomplete.recommendedEstimatedWorkMinutes, null);
  assert.equal(incomplete.deltaMinutes, null);
  assert.equal(feedback({ repair: { ...repair, repairLineItems: [] } }).previewStatus,
    "NO_STRUCTURED_LABOR");
  assert.equal(feedback({ repair: { ...repair, repairLineItems: [] } }).status, "UNAVAILABLE");
  assert.equal(feedback({ standards: [{ ...standard, standardMinutes: 0 }] }).status, "UNAVAILABLE");
  assert.equal(feedback({ standards: [{ ...standard, standardMinutes: 0.4 }] }).status, "UNAVAILABLE");
});

test("actual adoption retains Task190 reason, tier, and successful usable sample count", () => {
  const actual = feedback({ schedulerSetting: { ...setting, repairLearningMode: "AUTO" },
    sessions: [session(30, 30), session(31, 50)] });
  assert.equal(actual.recommendedEstimatedWorkMinutes, 40);
  assert.equal(actual.deltaMinutes, -20);
  assert.deepEqual(actual.evidence, [{ adoptedReason: "ACTUAL_MEDIAN",
    adoptedTier: "MOVEMENT_CALIBER", usableSampleCount: 2 }]);
});

test("AUTO with insufficient actual samples identifies standard fallback", () => {
  const fallback = feedback({ schedulerSetting: { ...setting, repairLearningMode: "AUTO" },
    sessions: [session(30, 30)] });
  assert.equal(fallback.recommendedEstimatedWorkMinutes, 90);
  assert.deepEqual(fallback.evidence, [{ adoptedReason: "STANDARD_INSUFFICIENT_SAMPLES",
    adoptedTier: null, usableSampleCount: null }]);
});

test("feedback loader reads four sources in bulk and never writes", async () => {
  const calls: string[] = [];
  const readModel = (name: string, method: string, value: unknown) => new Proxy({}, {
    get(_target, property) {
      if (property !== method) throw new Error(`unexpected ${name}.${String(property)}`);
      return async () => { calls.push(`${name}.${method}`); return value; };
    },
  });
  const db = {
    repair: readModel("repair", "findMany", [repair, { ...repair, id: 11, estimatedWorkMinutes: 90 }]),
    schedulerSetting: readModel("settings", "findUnique", setting),
    repairWorkTimeStandard: readModel("standards", "findMany", [standard]),
    workTimeSession: readModel("sessions", "findMany", []),
  };
  const result = await loadSchedulerV2WorkTimeFeedback(db as never, [10, 11], now);
  assert.deepEqual(Object.keys(result), ["10", "11"]);
  assert.equal(result[10].status, "RECOMMENDED_CHANGE");
  assert.equal(result[11].status, "UP_TO_DATE");
  assert.deepEqual(calls.sort(), ["repair.findMany", "settings.findUnique",
    "standards.findMany", "sessions.findMany"].sort());
});

test("change feedback renders saved and recommended minutes, evidence, and Repair anchor", () => {
  const html = renderToStaticMarkup(createElement(WorkTimeFeedbackCell,
    { repairId: 10, feedback: feedback() }));
  assert.match(html, /保存 60分 → 推奨 90分（\+30分）/);
  assert.match(html, /設定した標準時間/);
  assert.match(html, /href="\/repairs\/10#repair-work-time-preview"/);
  assert.match(html, /案件詳細で確認・採用/);
  const actual = feedback({ schedulerSetting: { ...setting, repairLearningMode: "AUTO" },
    sessions: [session(30, 30), session(31, 50)] });
  assert.match(renderToStaticMarkup(createElement(WorkTimeFeedbackCell,
    { repairId: 10, feedback: actual })), /実績中央値 \/ MOVEMENT_CALIBER \/ 有効2件/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(WorkTimeFeedbackCell,
    { repairId: 10, feedback: feedback({}, 90) })), /href=/);
  assert.match(readFileSync("src/components/repairs/RepairSchedulePanel.tsx", "utf8"),
    /id="repair-work-time-preview"/);
});
