import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { getRepairWorkTimePreview } from "./repair-work-time-preview";

const now = new Date("2026-09-27T12:00:00Z");
const setting = { repairLearningMode: "MANUAL", repairLearningMinimumSamples: 3,
  repairFullSampleThreshold: 10, repairEarlyAggregationMethod: "MEDIAN",
  defaultAggregationMethod: "MEAN", repairLookbackMonths: 6, repairOutlierMethod: "NONE" };
const repair = { id: 10, movementCaliberId: null, baseMovementCaliberId: null,
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
  assert.deepEqual(calls, ["repair.findUnique", "schedulerSetting.findUnique",
    "repairWorkTimeStandard.findMany", "workTimeSession.findMany"]);
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
