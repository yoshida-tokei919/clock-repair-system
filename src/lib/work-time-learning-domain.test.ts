import assert from "node:assert/strict";
import test from "node:test";
import type { LearningInput, LearningSession, RepairCondition } from "./work-time-learning-domain";
import { resolveWorkTimeLearning } from "./work-time-learning-domain";

const now = new Date("2026-09-27T12:00:00Z");
const schedulerSetting: NonNullable<LearningInput["schedulerSetting"]> = {
  repairLearningMode: "AUTO", repairLearningMinimumSamples: 3,
  repairFullSampleThreshold: 10, repairEarlyAggregationMethod: "MEDIAN",
  defaultAggregationMethod: "MEAN", repairLookbackMonths: 6, repairOutlierMethod: "NONE",
};
const activitySetting: NonNullable<LearningInput["activitySetting"]> = {
  activityType: "ESTIMATE", manualStandardMinutes: 20, dailyReservedMinutes: 0,
  learningMode: "AUTO", aggregationMethod: "MEAN", lookbackMonths: 3,
  fallbackLookbackMonths: 6, minimumSamples: 3,
};
const work = { lineType: "LABOR", repairType: "INTERNAL", repairWorkCategoryId: 4,
  targetPartNameId: "spring", repairWorkActionId: 8, detailLabel: "OH" };
const repairCondition: RepairCondition = {
  repairType: "INTERNAL", repairWorkCategoryId: 4, targetPartNameId: "spring",
  repairWorkActionId: 8, detailLabel: "OH",
};
const repair = { brandId: 1, modelId: 2, referenceId: 3, caseReferenceId: 4,
  movementCaliberId: 5, baseMovementCaliberId: 6, watchCaliberId: 7,
  watchBaseCaliberId: 8, driveType: "MECHANICAL" };

function session(activityType: LearningSession["activityType"], entityId: number | null, minutes: number,
  endedAt = now, overrides: Partial<LearningSession> = {}): LearningSession {
  return { activityType, repairId: activityType === "REPAIR" || activityType === "ESTIMATE" ? entityId : null,
    inquiryId: activityType === "INQUIRY" ? entityId : null,
    orderRequestId: activityType === "PARTS_ORDER" ? entityId : null,
    contextSchemaVersion: 1, contextSnapshot: { repair, work },
    startedAt: new Date(endedAt.getTime() - minutes * 60_000), endedAt, invalidatedAt: null,
    ...overrides };
}

function repairResult(sessions: LearningSession[], overrides: Partial<Extract<LearningInput, { activityType: "REPAIR" }>> = {}) {
  return resolveWorkTimeLearning({ activityType: "REPAIR", sessions, schedulerSetting, now,
    standardMinutes: 90, repairCondition, ...overrides });
}

test("repair AUTO uses the Task190A minimum and configured full threshold", () => {
  for (const count of [0, 1, 2, 3, 9, 10]) {
    const sessions = Array.from({ length: count }, (_, i) => session("REPAIR", i + 1, (i + 1) * 10));
    const result = repairResult(sessions);
    assert.equal(result.rawSampleCount, count);
    assert.equal(result.usableSampleCount, count);
    assert.equal(result.adoptedReason, count < 3 ? "STANDARD_INSUFFICIENT_SAMPLES" : count < 10 ? "ACTUAL_MEDIAN" : "ACTUAL_MEAN");
    assert.equal(result.adoptedMinutes, count < 3 ? 90 : count < 10 ? (count + 1) * 5 : 55);
  }
});

test("odd/even median and nearest-rank P80 use logical sample minutes", () => {
  const samples = [10, 20, 30, 40, 100].map((minutes, i) => session("REPAIR", i + 1, minutes));
  const odd = repairResult(samples, { schedulerSetting: { ...schedulerSetting, repairEarlyAggregationMethod: "P80" } });
  assert.equal(odd.median, 30);
  assert.equal(odd.p80, 40);
  assert.equal(odd.adoptedMinutes, 40);
  const even = repairResult(samples.slice(0, 4));
  assert.equal(even.median, 25);
  assert.equal(even.p80, 40);
});

test("split sessions aggregate seconds before minutes and preserve matching dimensions", () => {
  const first = session("REPAIR", 1, 0.5);
  const second = session("REPAIR", 1, 0.75, now, { contextSnapshot: {
    repair: { ...repair, brandId: 9 }, work: { ...work, detailLabel: " OH  " },
  } });
  const result = repairResult([first, second], { matchingDimensions: { brandId: 9 } });
  assert.equal(result.rawSampleCount, 1);
  assert.equal(result.samples[0].sessionCount, 2);
  assert.equal(result.samples[0].seconds, 75);
  assert.equal(result.samples[0].minutes, 1.25);
  assert.equal(result.samples[0].matchingDimensions.length, 2);
  assert.equal(result.samples[0].condition?.detailLabel, "OH");
  assert.equal(result.samples[0].matchingDimensions[0].caseReferenceId, 4);
  assert.equal(result.samples[0].matchingDimensions[0].baseMovementCaliberId, 6);
  assert.equal(result.samples[0].matchingDimensions[0].driveType, "MECHANICAL");
  assert.equal(repairResult([first, second], { matchingDimensions: { brandId: 10 } }).usableSampleCount, 0);
  assert.equal(repairResult([first, second], { repairCondition: {
    repairType: "EXTERNAL", repairWorkCategoryId: 4, targetPartNameId: "spring",
    repairWorkActionId: 8, detailLabel: "OH",
  } }).usableSampleCount, 0);
});

test("REPAIR identity uses structured condition, not display names or watch dimensions", () => {
  const a = session("REPAIR", 1, 10);
  const b = session("REPAIR", 1, 20, now, { contextSnapshot: {
    repair: { ...repair, modelId: 99 }, work: { ...work, itemName: "renamed", detailLabel: " OH " },
  } });
  const c = session("REPAIR", 1, 30, now, { contextSnapshot: {
    repair, work: { ...work, repairWorkActionId: 9 },
  } });
  const result = repairResult([a, b, c]);
  assert.equal(result.rawSampleCount, 1);
  assert.equal(result.filteredOutSampleCount, 1);
  assert.equal(result.samples[0].seconds, 1800);
  assert.equal(result.samples[0].sessionCount, 2);
  assert.equal(result.adoptedReason, "STANDARD_INSUFFICIENT_SAMPLES");
});

test("REPAIR requires an explicit valid structured work condition", () => {
  const base = { activityType: "REPAIR" as const, sessions: [session("REPAIR", 1, 10)],
    schedulerSetting, now, standardMinutes: 90 };
  // @ts-expect-error REPAIR callers must supply the structured condition.
  assert.throws(() => resolveWorkTimeLearning(base), /repairCondition is required/);
  assert.throws(() => resolveWorkTimeLearning({ ...base, repairCondition: {} } as unknown as LearningInput),
    /repairCondition is required/);
});

test("lookback compares max sample end, includes older seconds, and includes the boundary", () => {
  const boundary = new Date("2026-03-27T12:00:00Z");
  const older = new Date("2026-03-20T12:00:00Z");
  const sessions = [session("REPAIR", 1, 10, older), session("REPAIR", 1, 20, boundary),
    session("REPAIR", 2, 40, older)];
  const result = repairResult(sessions);
  assert.equal(result.rawSampleCount, 2);
  assert.equal(result.usableSampleCount, 1);
  assert.equal(result.samples[0].minutes, 30);
  assert.equal(result.sampleExclusions.OUTSIDE_LOOKBACK, 1);
  assert.equal(result.excludedSampleCount, 1);
});

test("IQR excludes a logical outlier and threshold uses the remaining sample count", () => {
  const sessions = [10, 10, 10, 10].map((minutes, i) => session("REPAIR", i + 1, minutes));
  sessions.push(session("REPAIR", 5, 500), session("REPAIR", 5, 500));
  const result = repairResult(sessions, { schedulerSetting: { ...schedulerSetting,
    repairOutlierMethod: "IQR", repairLearningMinimumSamples: 5 } });
  assert.equal(result.rawSampleCount, 5);
  assert.equal(result.usableSampleCount, 4);
  assert.equal(result.excludedSampleCount, 1);
  assert.equal(result.sampleExclusions.IQR_OUTLIER, 1);
  assert.equal(result.samples.length, 4);
  assert.equal(result.adoptedReason, "STANDARD_INSUFFICIENT_SAMPLES");
  assert.equal(result.mean, 10);
});

test("active, invalidated, invalid intervals, null IDs and invalid REPAIR snapshots do not become samples", () => {
  const base = session("REPAIR", 1, 10);
  const result = repairResult([base,
    session("REPAIR", 2, 10, now, { endedAt: null }),
    session("REPAIR", 3, 10, now, { invalidatedAt: now }),
    session("REPAIR", 4, 10, now, { startedAt: new Date(now.getTime() + 1000) }),
    session("REPAIR", null, 10),
    session("REPAIR", 5, 10, now, { contextSchemaVersion: 2 }),
    session("REPAIR", 6, 10, now, { contextSnapshot: { repair, work: { ...work, repairWorkCategoryId: null } } }),
  ]);
  assert.equal(result.rawSampleCount, 1);
  assert.deepEqual(result.sessionExclusions, { ACTIVE: 1, INVALIDATED: 1,
    INVALID_INTERVAL: 1, MISSING_ENTITY_ID: 1, UNSUPPORTED_CONTEXT_VERSION: 1,
    MISSING_REPAIR_CONDITION: 1 });
});

test("ESTIMATE, INQUIRY and PARTS_ORDER group by their stable entity; null never creates a sample", () => {
  for (const activityType of ["ESTIMATE", "INQUIRY", "PARTS_ORDER"] as const) {
    const setting = { ...activitySetting, activityType, fallbackLookbackMonths: null };
    const result = resolveWorkTimeLearning({ activityType, schedulerSetting, activitySetting: setting, now,
      sessions: [session(activityType, 1, 10), session(activityType, 1, 20), session(activityType, null, 30)] });
    assert.equal(result.rawSampleCount, 1);
    assert.equal(result.samples[0].minutes, 30);
    assert.equal(result.sessionExclusions.MISSING_ENTITY_ID, 1);
  }
});

test("activity fallback lookback, manual null and INQUIRY reservation stay distinct", () => {
  const old = new Date("2026-05-01T12:00:00Z");
  const estimate = resolveWorkTimeLearning({ activityType: "ESTIMATE", schedulerSetting, activitySetting, now,
    sessions: [1, 2, 3].map(i => session("ESTIMATE", i, 30, old)) });
  assert.equal(estimate.lookback.usedMonths, 6);
  assert.equal(estimate.lookback.usedFallback, true);
  assert.equal(estimate.adoptedMinutes, 30);
  const inquiry = resolveWorkTimeLearning({ activityType: "INQUIRY", schedulerSetting,
    activitySetting: { ...activitySetting, activityType: "INQUIRY", learningMode: "MANUAL",
      manualStandardMinutes: null, dailyReservedMinutes: 60 }, now,
    sessions: [session("INQUIRY", 1, 30)] });
  assert.equal(inquiry.manualStandardMinutes, null);
  assert.equal(inquiry.adoptedMinutes, null);
  assert.equal(inquiry.dailyReservedMinutes, 60);
});

test("missing settings error explicitly; unsupported AUTO activity and non-AUTO activity stay unlearned", () => {
  assert.throws(() => repairResult([], { schedulerSetting: null }), /SchedulerSetting is missing/);
  assert.throws(() => resolveWorkTimeLearning({ activityType: "INQUIRY", sessions: [], schedulerSetting,
    activitySetting: null, now }), /SchedulerActivitySetting is missing/);
  const other = resolveWorkTimeLearning({ activityType: "OTHER", sessions: [session("OTHER", null, 10)],
    schedulerSetting, activitySetting: { ...activitySetting, activityType: "OTHER", learningMode: "AUTO",
      manualStandardMinutes: null }, now });
  assert.equal(other.adoptedReason, "UNSUPPORTED_ACTIVITY");
  assert.equal(other.usableSampleCount, 0);
  assert.equal(other.sessionExclusions.UNSUPPORTED_ACTIVITY, 1);
  const manual = repairResult([1, 2, 3].map(i => session("REPAIR", i, 10)), {
    schedulerSetting: { ...schedulerSetting, repairLearningMode: "MANUAL" }, standardMinutes: null,
  });
  assert.equal(manual.adoptedReason, "NO_STANDARD");
  assert.equal(manual.adoptedMinutes, null);
});
