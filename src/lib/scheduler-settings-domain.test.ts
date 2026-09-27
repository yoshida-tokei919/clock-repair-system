import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { ACTIVITY_TYPES, assertSettingsRows, parseActivityInput, parseSchedulerInput, parseStandardInput } from "./scheduler-settings-domain";
import { assertUniqueStandard, getSchedulerSettings, settingsResponseError, validateStandardMasters } from "./scheduler-settings";
import { isRepairWorkActionApplicable, isRepairWorkTargetPartApplicable } from "./repair-work-selection";

const activity = { activityType: "ESTIMATE", manualStandardMinutes: null, dailyReservedMinutes: 0,
  learningMode: "MANUAL", aggregationMethod: "MEAN", lookbackMonths: 3, fallbackLookbackMonths: null, minimumSamples: 3 };
const standard = { repairType: "INTERNAL", categoryId: 1, targetPartNameId: null, actionId: null,
  detailLabel: "  test  ", driveType: "QUARTZ", standardMinutes: 30 };

test("nullable activity fields stay null and unsupported AUTO is rejected", () => {
  assert.deepEqual(parseActivityInput(activity), activity);
  assert.throws(() => parseActivityInput({ ...activity, activityType: "REPAIR" }));
  assert.throws(() => parseActivityInput({ ...activity, activityType: "INTAKE", learningMode: "AUTO" }), /AUTO/);
  assert.equal(parseActivityInput({ ...activity, learningMode: "AUTO" }).learningMode, "AUTO");
  assert.throws(() => parseActivityInput({ ...activity, fallbackLookbackMonths: 2 }));
});

test("singleton settings enforce bounds and sample ordering", () => {
  const input = { standardDailyMinutes: 480, dailyScheduleReviewMinutes: 30, repairLearningMode: "AUTO",
    repairLearningMinimumSamples: 3, repairFullSampleThreshold: 10, repairEarlyAggregationMethod: "MEDIAN",
    defaultAggregationMethod: "MEAN", repairLookbackMonths: 6, repairOutlierMethod: "IQR" };
  assert.equal(parseSchedulerInput(input).repairOutlierMethod, "IQR");
  assert.throws(() => parseSchedulerInput({ ...input, repairFullSampleThreshold: 2 }));
  assert.throws(() => parseSchedulerInput({ ...input, dailyScheduleReviewMinutes: 481 }));
});

test("standard detail trims, empty becomes null, EXTERNAL drive is prohibited", () => {
  assert.equal(parseStandardInput(standard).detailLabel, "test");
  assert.equal(parseStandardInput({ ...standard, detailLabel: "  " }).detailLabel, null);
  assert.throws(() => parseStandardInput({ ...standard, repairType: "EXTERNAL" }), /外装/);
  assert.equal(parseStandardInput({ ...standard, repairType: "EXTERNAL", driveType: null }).driveType, null);
  assert.throws(() => parseStandardInput({ ...standard, standardMinutes: 0 }));
});

test("missing singleton and activity rows are explicit errors", async () => {
  assert.throws(() => assertSettingsRows(null, []), /SchedulerSetting/);
  assert.throws(() => assertSettingsRows({}, [{ activityType: "ESTIMATE" }]), /INTAKE/);
  const db = {
    schedulerSetting: { findUnique: async () => null },
    schedulerActivitySetting: { findMany: async () => [] },
    repairWorkTimeStandard: { findMany: async () => [] },
    repairWorkCategory: { findMany: async () => [] },
    repairWorkAction: { findMany: async () => [] },
    partNameMaster: { findMany: async () => [] },
  } as unknown as PrismaClient;
  await assert.rejects(() => getSchedulerSettings(db), /SchedulerSetting/);
  assert.doesNotThrow(() => assertSettingsRows({}, ACTIVITY_TYPES.map(activityType => ({ activityType }))));
});

test("master applicability follows structured-work rules", async () => {
  const db = {
    repairWorkCategory: { findUnique: async () => ({ repairType: "INTERNAL", name: "quartz", isActive: true }) },
    repairWorkAction: { findUnique: async () => ({ name: "oil", isActive: true }) },
    partNameMaster: { findUnique: async () => ({ key: "battery", partType: "part_internal", isActive: true,
      category: { key: "quartz", partType: "part_internal" } }) },
  } as unknown as PrismaClient;
  const input = parseStandardInput({ ...standard, targetPartNameId: "battery", actionId: 7 });
  await assert.doesNotReject(() => validateStandardMasters(db, input));
  await assert.rejects(() => validateStandardMasters(db, { ...input, repairType: "EXTERNAL", driveType: null }), /カテゴリ/);
  const wrongAction = { ...db, repairWorkAction: { findUnique: async () => ({ name: "painting", isActive: true }) } } as unknown as PrismaClient;
  await assert.rejects(() => validateStandardMasters(wrongAction, input), /処置/);
  const wrongPart = { ...db, partNameMaster: { findUnique: async () => ({ key: "crown", partType: "part_external", isActive: true,
    category: { key: "crown_tube", partType: "part_external" } }) } } as unknown as PrismaClient;
  await assert.rejects(() => validateStandardMasters(wrongPart, input), /対象部品/);
});

test("shared repair selectors preserve category mapping and internal fallback", () => {
  assert.equal(isRepairWorkActionApplicable("INTERNAL", "oil"), true);
  assert.equal(isRepairWorkActionApplicable("EXTERNAL", "oil"), false);
  assert.equal(isRepairWorkActionApplicable("EXTERNAL", "painting"), true);
  assert.equal(isRepairWorkTargetPartApplicable("INTERNAL", "quartz",
    { key: "battery", partType: null, categoryKey: null }), true);
  assert.equal(isRepairWorkTargetPartApplicable("INTERNAL", "quartz",
    { key: "crown", partType: "part_internal", categoryKey: "quartz" }), false);
  assert.equal(isRepairWorkTargetPartApplicable("EXTERNAL", "case_glass",
    { key: "glass", partType: "part_external", categoryKey: "case_glass" }), true);
  assert.equal(isRepairWorkTargetPartApplicable("EXTERNAL", "case_glass",
    { key: "glass", partType: "part_internal", categoryKey: "case_glass" }), false);
});

test("duplicate conditions and database uniqueness failures return conflict", async () => {
  const input = parseStandardInput(standard);
  const db = { repairWorkTimeStandard: { findFirst: async () => ({ id: 5 }) } } as unknown as PrismaClient;
  await assert.rejects(() => assertUniqueStandard(db, input), error => settingsResponseError(error).status === 409);
  assert.equal(settingsResponseError({ code: "P2002" }).status, 409);
  assert.equal(settingsResponseError({ code: "P2025" }).status, 409);
  assert.equal(settingsResponseError(new SyntaxError("invalid JSON")).status, 400);
});
