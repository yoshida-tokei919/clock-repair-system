import assert from "node:assert/strict";
import test from "node:test";
import type { LearningSession } from "./work-time-learning-domain";
import { resolveRepairWorkTimePreview, selectWorkTimeStandard } from "./repair-work-time-preview-domain";

const now = new Date("2026-09-27T12:00:00Z");
const setting = { repairLearningMode: "AUTO" as const, repairLearningMinimumSamples: 2,
  repairFullSampleThreshold: 10, repairEarlyAggregationMethod: "MEDIAN" as const,
  defaultAggregationMethod: "MEAN" as const, repairLookbackMonths: 6, repairOutlierMethod: "NONE" as const };
const condition = { repairType: "INTERNAL" as const, repairWorkCategoryId: 4,
  targetPartNameId: "spring", repairWorkActionId: 8, detailLabel: "OH" };
const general = { id: 1, repairType: "INTERNAL" as const, categoryId: 4,
  targetPartNameId: null, actionId: null, detailLabel: null, driveType: null, standardMinutes: 90 };
const line = { id: 100, lineType: "LABOR" as const, repairWorkCategoryId: 4,
  repairWorkCategory: { repairType: "INTERNAL" as const }, targetPartNameId: "spring",
  repairWorkActionId: 8, detailLabelSnapshot: " OH " };
const repair = { id: 10, movementCaliberId: 5, baseMovementCaliberId: 6,
  watch: { brandId: 1, modelId: 2, referenceId: 3, caseReferenceId: 4,
    caliberId: 7, baseCaliberId: 8, driveType: "MECHANICAL" as const }, repairLineItems: [line] };

function session(entityId: number, minutes: number, work = { lineType: "LABOR", repairType: "INTERNAL",
  repairWorkCategoryId: 4, targetPartNameId: "spring", repairWorkActionId: 8, detailLabel: "OH" },
  dimensions: Record<string, unknown> = {}): LearningSession {
  return { activityType: "REPAIR", repairId: entityId, inquiryId: null, orderRequestId: null,
    contextSchemaVersion: 1, contextSnapshot: { work, repair: dimensions },
    startedAt: new Date(now.getTime() - minutes * 60_000), endedAt: now, invalidatedAt: null };
}
function preview(sessions: LearningSession[] = [], overrides: Record<string, unknown> = {}) {
  return resolveRepairWorkTimePreview({ repair, standards: [general], schedulerSetting: setting, sessions, now, ...overrides });
}

test("standard selects a strict superset, normalizes detail, and matches INTERNAL drive", () => {
  const part = { ...general, id: 2, targetPartNameId: "spring", standardMinutes: 80 };
  const detailDrive = { ...part, id: 3, detailLabel: "OH", driveType: "MECHANICAL" as const, standardMinutes: 70 };
  const selection = selectWorkTimeStandard([general, part, detailDrive], { ...condition, detailLabel: " OH  " }, "MECHANICAL");
  assert.deepEqual(selection, { status: "SELECTED", id: 3, minutes: 70, candidateIds: [3] });
  assert.equal(selectWorkTimeStandard([detailDrive], condition, "QUARTZ").status, "NONE");
});

test("incomparable standard rows stay ambiguous, including EXTERNAL without drive matching", () => {
  const byPart = { ...general, id: 2, targetPartNameId: "spring" };
  const byAction = { ...general, id: 3, actionId: 8 };
  assert.deepEqual(selectWorkTimeStandard([general, byPart, byAction], condition, "MECHANICAL"),
    { status: "AMBIGUOUS_STANDARD", id: null, minutes: null, candidateIds: [2, 3] });
  const external = { ...general, id: 4, repairType: "EXTERNAL" as const, driveType: null };
  const externalCondition = { ...condition, repairType: "EXTERNAL" as const };
  assert.equal(selectWorkTimeStandard([external], externalCondition, "QUARTZ").status, "SELECTED");
  assert.equal(selectWorkTimeStandard([{ ...external, driveType: "QUARTZ" as const }], externalCondition, "QUARTZ").status, "NONE");
});

test("INTERNAL continues past insufficient stronger tier and adopts weaker actual", () => {
  const sessions = [session(1, 20, undefined, { movementCaliberId: 5 }),
    session(2, 40, undefined, { baseMovementCaliberId: 6 }),
    session(3, 60, undefined, { baseMovementCaliberId: 6 })];
  const result = preview(sessions);
  const selected = result.workUnits[0];
  assert.equal(selected.status, "RESOLVED");
  assert.equal("adoptedTier" in selected && selected.adoptedTier, "BASE_MOVEMENT_CALIBER");
  assert.equal("adoptedMinutes" in selected && selected.adoptedMinutes, 50);
  assert.equal("attempts" in selected && selected.attempts?.[0].adoptedReason, "NO_STANDARD");
  assert.equal(result.estimatedTotalMinutes, 50);
});

test("EXTERNAL Ref uses OR across both ref dimensions and deduplicates logical samples", () => {
  const externalWork = { lineType: "LABOR", repairType: "EXTERNAL", repairWorkCategoryId: 4,
    targetPartNameId: "spring", repairWorkActionId: 8, detailLabel: " OH " };
  const externalRepair = { ...repair, repairLineItems: [{ ...line,
    repairWorkCategory: { repairType: "EXTERNAL" as const } }] };
  const samples = [session(1, 10, externalWork, { referenceId: 3 }),
    session(1, 5, externalWork, { caseReferenceId: 4 }),
    session(2, 30, externalWork, { caseReferenceId: 3 }),
    session(3, 80, externalWork, { modelId: 2 }),
    session(4, 90, externalWork, { modelId: 2 }),
    session(5, 100, externalWork, { brandId: 1 }),
    session(6, 110, externalWork, { brandId: 1 })];
  const result = preview(samples, { repair: externalRepair, standards: [] });
  const selected = result.workUnits[0];
  assert.equal("adoptedTier" in selected && selected.adoptedTier, "REF");
  assert.equal("adoptedMinutes" in selected && selected.adoptedMinutes, 22.5);
  assert.equal("attempts" in selected && selected.attempts?.[0].rawSampleCount, 2);
  assert.equal("attempts" in selected && selected.attempts?.length, 1);
});

test("EXTERNAL falls through Ref then Model then Brand", () => {
  const work = { lineType: "LABOR", repairType: "EXTERNAL", repairWorkCategoryId: 4,
    targetPartNameId: "spring", repairWorkActionId: 8, detailLabel: "OH" };
  const externalRepair = { ...repair, repairLineItems: [{ ...line, repairWorkCategory: { repairType: "EXTERNAL" as const } }] };
  const samples = [session(1, 10, work, { referenceId: 3 }),
    session(2, 20, work, { modelId: 2 }), session(3, 30, work, { modelId: 2 }),
    session(4, 100, work, { brandId: 1 }), session(5, 110, work, { brandId: 1 })];
  const result = preview(samples, { repair: externalRepair, standards: [] });
  const selected = result.workUnits[0];
  assert.equal("adoptedTier" in selected && selected.adoptedTier, "MODEL");
  assert.equal("attempts" in selected && selected.attempts?.length, 2);
  assert.equal("adoptedMinutes" in selected && selected.adoptedMinutes, 25);
});

test("MANUAL bypasses actual; unstructured and unresolved LABOR prevent a complete total", () => {
  const manual = preview([session(1, 10, undefined, { movementCaliberId: 5 }),
    session(2, 20, undefined, { movementCaliberId: 5 })],
  { schedulerSetting: { ...setting, repairLearningMode: "MANUAL" }, repair: { ...repair, repairLineItems: [
    line, { ...line, id: 101, lineType: "PART" },
    { ...line, id: 102, repairWorkCategoryId: null, repairWorkCategory: null },
    { ...line, id: 103, repairWorkCategoryId: 5 },
  ] } });
  assert.equal(manual.workUnits[0].status, "RESOLVED");
  assert.equal(manual.workUnits[0].adoptedReason, "MANUAL_STANDARD");
  assert.equal(manual.workUnits[0].attempts.length, 0);
  assert.deepEqual(manual.lines[1], { lineItemId: 101, status: "IGNORED", reason: "PART" });
  assert.deepEqual(manual.lines[2], { lineItemId: 102, status: "UNRESOLVED",
    reason: "UNSTRUCTURED_LABOR", adoptedMinutes: null });
  assert.equal(manual.lines[3].status, "WORK_UNIT");
  assert.equal(manual.workUnits[1].status, "UNRESOLVED");
  assert.equal(manual.structuredLaborLineCount, 2);
  assert.equal(manual.logicalWorkUnitCount, 2);
  assert.equal(manual.unresolvedWorkUnitCount, 1);
  assert.equal(manual.unstructuredLaborLineCount, 1);
  assert.equal(manual.resolvedMinutes, 90);
  assert.equal(manual.previewStatus, "INCOMPLETE");
  assert.equal(manual.complete, false);
  assert.equal(manual.estimatedTotalMinutes, null);
});

test("same INTERNAL caliber ID still tries each distinct matching dimension tier", () => {
  const result = preview([], { repair: { ...repair, baseMovementCaliberId: 5,
    watch: { ...repair.watch, caliberId: 5, baseCaliberId: 5 } } });
  assert.deepEqual(result.workUnits[0].attempts.map(attempt => attempt.tier),
    ["MOVEMENT_CALIBER", "BASE_MOVEMENT_CALIBER", "WATCH_CALIBER", "WATCH_BASE_CALIBER"]);
});

test("AUTO actual adoption beats an ambiguous standard", () => {
  const byPart = { ...general, id: 2, targetPartNameId: "spring" };
  const byAction = { ...general, id: 3, actionId: 8 };
  const result = preview([session(1, 20, undefined, { movementCaliberId: 5 }),
    session(2, 40, undefined, { movementCaliberId: 5 })], { standards: [byPart, byAction] });
  assert.equal(result.workUnits[0].standard.status, "AMBIGUOUS_STANDARD");
  assert.equal(result.workUnits[0].adoptedReason, "ACTUAL_MEDIAN");
  assert.equal(result.estimatedTotalMinutes, 30);
});

test("EXTERNAL reaches Brand when Ref and Model are insufficient", () => {
  const work = { lineType: "LABOR", repairType: "EXTERNAL", repairWorkCategoryId: 4,
    targetPartNameId: "spring", repairWorkActionId: 8, detailLabel: "OH" };
  const externalRepair = { ...repair, repairLineItems: [{ ...line, repairWorkCategory: { repairType: "EXTERNAL" as const } }] };
  const result = preview([session(1, 10, work, { referenceId: 3 }),
    session(2, 20, work, { modelId: 2 }), session(3, 40, work, { brandId: 1 }),
    session(4, 60, work, { brandId: 1 })], { repair: externalRepair, standards: [] });
  assert.deepEqual(result.workUnits[0].attempts.map(attempt => attempt.tier),
    ["REF", "MODEL", "BRAND"]);
  assert.equal(result.workUnits[0].adoptedMinutes, 50);
});

test("zero structured LABOR never produces a complete zero-minute estimate", () => {
  const empty = preview([], { repair: { ...repair, repairLineItems: [] } });
  const partOnly = preview([], { repair: { ...repair, repairLineItems: [{ ...line, lineType: "PART" }] } });
  const unstructuredOnly = preview([], { repair: { ...repair, repairLineItems: [
    { ...line, repairWorkCategoryId: null, repairWorkCategory: null },
  ] } });
  for (const result of [empty, partOnly, unstructuredOnly]) {
    assert.equal(result.structuredLaborLineCount, 0);
    assert.equal(result.logicalWorkUnitCount, 0);
    assert.equal(result.previewStatus, "NO_STRUCTURED_LABOR");
    assert.equal(result.complete, false);
    assert.equal(result.estimatedTotalMinutes, null);
  }
  assert.equal(unstructuredOnly.unstructuredLaborLineCount, 1);
  assert.equal(unstructuredOnly.unresolvedWorkUnitCount, 0);
  assert.equal(unstructuredOnly.lines[0].status, "UNRESOLVED");
  assert.throws(() => preview([], { schedulerSetting: null }), /SchedulerSetting is missing/);
});

test("duplicate current structured LABOR resolves one historical actual and maps both rows", () => {
  const result = preview([
    session(1, 40, undefined, { movementCaliberId: 5 }),
    session(2, 80, undefined, { movementCaliberId: 5 }),
  ], { repair: { ...repair, repairLineItems: [line,
    { ...line, id: 101, detailLabelSnapshot: "OH" }] } });
  assert.equal(result.structuredLaborLineCount, 2);
  assert.equal(result.logicalWorkUnitCount, 1);
  assert.equal(result.workUnits.length, 1);
  assert.deepEqual(result.workUnits[0].memberLineItemIds, [100, 101]);
  assert.deepEqual(result.workUnits[0].condition, condition);
  assert.equal(result.workUnits[0].adoptedReason, "ACTUAL_MEDIAN");
  assert.equal(result.workUnits[0].adoptedMinutes, 60);
  assert.equal(result.resolvedMinutes, 60);
  assert.equal(result.estimatedTotalMinutes, 60);
  assert.deepEqual(result.lines, [100, 101].map(lineItemId =>
    ({ lineItemId, status: "WORK_UNIT", workUnitKey: result.workUnits[0].key })));
});

test("whitespace-only and null details share one condition key", () => {
  const result = preview([], { repair: { ...repair, repairLineItems: [
    { ...line, detailLabelSnapshot: "   " },
    { ...line, id: 101, detailLabelSnapshot: null },
  ] } });
  assert.equal(result.logicalWorkUnitCount, 1);
  assert.equal(result.workUnits[0].condition.detailLabel, null);
  assert.deepEqual(result.workUnits[0].memberLineItemIds, [100, 101]);
  assert.equal(result.estimatedTotalMinutes, 90);
});

test("different structured condition remains a separate summed work unit", () => {
  const result = preview([
    session(1, 40, undefined, { movementCaliberId: 5 }),
    session(2, 80, undefined, { movementCaliberId: 5 }),
  ], { repair: { ...repair, repairLineItems: [line,
    { ...line, id: 101, repairWorkActionId: 9 }] } });
  assert.equal(result.logicalWorkUnitCount, 2);
  assert.notEqual(result.workUnits[0].key, result.workUnits[1].key);
  assert.deepEqual(result.workUnits.map(unit => unit.adoptedMinutes), [60, 90]);
  assert.equal(result.estimatedTotalMinutes, 150);
  assert.notEqual(result.lines[0].status === "WORK_UNIT" && result.lines[0].workUnitKey,
    result.lines[1].status === "WORK_UNIT" && result.lines[1].workUnitKey);
});

test("duplicate unresolved condition counts once while both member rows stay visible", () => {
  const result = preview([], { standards: [], repair: { ...repair, repairLineItems: [line,
    { ...line, id: 101, detailLabelSnapshot: "OH" }] } });
  assert.equal(result.structuredLaborLineCount, 2);
  assert.equal(result.logicalWorkUnitCount, 1);
  assert.equal(result.unresolvedWorkUnitCount, 1);
  assert.deepEqual(result.workUnits[0].memberLineItemIds, [100, 101]);
  assert.equal(result.workUnits[0].status, "UNRESOLVED");
  assert.equal(result.workUnits[0].adoptedReason, "NO_STANDARD");
  assert.deepEqual(result.lines.map(row => row.lineItemId), [100, 101]);
  assert.deepEqual(result.lines.map(row => row.status === "WORK_UNIT" && row.workUnitKey),
    [result.workUnits[0].key, result.workUnits[0].key]);
  assert.equal(result.complete, false);
  assert.equal(result.estimatedTotalMinutes, null);
});
