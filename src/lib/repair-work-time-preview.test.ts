import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { getRepairWorkTimePreview, roundedPreviewMinutes } from "./repair-work-time-preview";

const now = new Date("2026-09-27T12:00:00Z");
const setting = { repairLearningMode: "MANUAL", repairLearningMinimumSamples: 3,
  repairFullSampleThreshold: 10, repairEarlyAggregationMethod: "MEDIAN",
  defaultAggregationMethod: "MEAN", repairLookbackMonths: 6, repairOutlierMethod: "NONE" };
const repair = { id: 10, estimatedWorkMinutes: 12, movementCaliberId: null, baseMovementCaliberId: null,
  watch: { brandId: 1, modelId: null, referenceId: null, caseReferenceId: null,
    caliberId: null, baseCaliberId: null, driveType: null }, repairLineItems: [
    { id: 20, lineType: "LABOR", repairWorkCategoryId: 4,
      repairWorkCategory: { repairType: "INTERNAL" }, targetPartNameId: null,
      repairWorkActionId: null, detailLabelSnapshot: null },
  ] };

test("server preview uses read methods only and returns the selected standard", async () => {
  const calls: string[] = [];
  const readonlyModel = (name: string, method: "findUnique" | "findMany", value: unknown) =>
    new Proxy({}, { get(_target, property) {
      if (property !== method) throw new Error(`unexpected ${name}.${String(property)}`);
      return async () => { calls.push(`${name}.${method}`); return value; };
    } });
  const db = {
    repair: readonlyModel("repair", "findUnique", repair),
    schedulerSetting: readonlyModel("schedulerSetting", "findUnique", setting),
    repairWorkTimeStandard: readonlyModel("repairWorkTimeStandard", "findMany", [
      { id: 1, repairType: "INTERNAL", categoryId: 4, targetPartNameId: null,
        actionId: null, detailLabel: null, driveType: null, standardMinutes: 45 },
    ]),
    workTimeSession: readonlyModel("workTimeSession", "findMany", []),
  } as unknown as PrismaClient;
  const preview = await getRepairWorkTimePreview(db, 10, now);
  assert.equal(preview?.estimatedTotalMinutes, 45);
  assert.equal(preview?.currentEstimatedWorkMinutes, 12);
  assert.equal(preview?.roundedEstimatedWorkMinutes, 45);
  assert.match(preview?.revision ?? "", /^[0-9a-f]{64}$/);
  assert.deepEqual(calls, ["repair.findUnique", "schedulerSetting.findUnique",
    "repairWorkTimeStandard.findMany", "workTimeSession.findMany"]);
});

test("rounding uses Math.round only for complete previews", () => {
  for (const [total, expected] of [[22.4, 22], [22.5, 23], [22, 22]]) {
    assert.equal(roundedPreviewMinutes({ complete: true, estimatedTotalMinutes: total }), expected);
  }
  assert.equal(roundedPreviewMinutes({ complete: false, estimatedTotalMinutes: 22.5 }), null);
  assert.equal(roundedPreviewMinutes({ complete: false, estimatedTotalMinutes: null }), null);
});

test("revision ignores ordinary now progression but tracks persisted minutes and derivation inputs", async () => {
  let currentRepair = repair;
  let standardMinutes = 45;
  let currentSetting = setting;
  let sessions: unknown[] = [];
  const db = { repair: { findUnique: async () => currentRepair },
    schedulerSetting: { findUnique: async () => currentSetting },
    repairWorkTimeStandard: { findMany: async () => [{ id: 1, repairType: "INTERNAL", categoryId: 4,
      targetPartNameId: null, actionId: null, detailLabel: null, driveType: null, standardMinutes }] },
    workTimeSession: { findMany: async () => sessions } } as unknown as PrismaClient;
  const first = (await getRepairWorkTimePreview(db, 10, new Date("2026-09-27T12:00:00Z")))!;
  const later = (await getRepairWorkTimePreview(db, 10, new Date("2026-09-27T12:05:00Z")))!;
  assert.equal(first.revision, later.revision);
  currentRepair = { ...repair, estimatedWorkMinutes: 13 };
  const manualChange = (await getRepairWorkTimePreview(db, 10, now))!;
  assert.notEqual(first.revision, manualChange.revision);
  standardMinutes = 46;
  const standardChange = (await getRepairWorkTimePreview(db, 10, now))!;
  assert.notEqual(manualChange.revision, standardChange.revision);
  currentRepair = { ...currentRepair, watch: { ...currentRepair.watch, brandId: 2 } };
  const watchChange = (await getRepairWorkTimePreview(db, 10, now))!;
  assert.notEqual(standardChange.revision, watchChange.revision);
  currentSetting = { ...setting, repairLookbackMonths: 3 };
  const settingChange = (await getRepairWorkTimePreview(db, 10, now))!;
  assert.notEqual(watchChange.revision, settingChange.revision);
  sessions = [{ activityType: "REPAIR", repairId: 30, inquiryId: null, orderRequestId: null,
    contextSchemaVersion: 1, contextSnapshot: null,
    startedAt: new Date("2026-09-26T12:00:00Z"), endedAt: null, invalidatedAt: null }];
  const historyChange = (await getRepairWorkTimePreview(db, 10, now))!;
  assert.notEqual(settingChange.revision, historyChange.revision);
});

test("revision changes when a historical sample crosses the lookback boundary", async () => {
  const ending = new Date("2026-03-27T12:02:00Z");
  const db = { repair: { findUnique: async () => ({ ...repair, movementCaliberId: 5 }) },
    schedulerSetting: { findUnique: async () => ({ ...setting, repairLearningMode: "AUTO",
      repairLearningMinimumSamples: 1 }) },
    repairWorkTimeStandard: { findMany: async () => [{ id: 1, repairType: "INTERNAL", categoryId: 4,
      targetPartNameId: null, actionId: null, detailLabel: null, driveType: null, standardMinutes: 45 }] },
    workTimeSession: { findMany: async () => [{ activityType: "REPAIR", repairId: 30,
      inquiryId: null, orderRequestId: null, contextSchemaVersion: 1,
      contextSnapshot: { work: { lineType: "LABOR", repairType: "INTERNAL", repairWorkCategoryId: 4,
        targetPartNameId: null, repairWorkActionId: null, detailLabel: null },
        repair: { movementCaliberId: 5 } },
      startedAt: new Date(ending.getTime() - 22.5 * 60_000), endedAt: ending, invalidatedAt: null }] },
  } as unknown as PrismaClient;
  const within = (await getRepairWorkTimePreview(db, 10, new Date("2026-09-27T12:01:00Z")))!;
  const stillWithin = (await getRepairWorkTimePreview(db, 10, new Date("2026-09-27T12:01:30Z")))!;
  const outside = (await getRepairWorkTimePreview(db, 10, new Date("2026-09-27T12:03:00Z")))!;
  assert.equal(within.revision, stillWithin.revision);
  assert.equal(within.roundedEstimatedWorkMinutes, 23);
  assert.equal(outside.roundedEstimatedWorkMinutes, 45);
  assert.notEqual(within.revision, outside.revision);
});

test("missing Repair returns null before fetching settings or history", async () => {
  const db = { repair: { findUnique: async () => null } } as unknown as PrismaClient;
  assert.equal(await getRepairWorkTimePreview(db, 999, now), null);
});

test("server preview explicitly errors when SchedulerSetting is missing", async () => {
  const db = { repair: { findUnique: async () => repair },
    schedulerSetting: { findUnique: async () => null },
    repairWorkTimeStandard: { findMany: async () => [] },
    workTimeSession: { findMany: async () => [] } } as unknown as PrismaClient;
  await assert.rejects(() => getRepairWorkTimePreview(db, 10, now), /SchedulerSetting is missing/);
});
