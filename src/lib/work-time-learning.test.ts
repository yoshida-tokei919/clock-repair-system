import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { getWorkTimeLearning } from "./work-time-learning";

const now = new Date("2026-09-27T12:00:00Z");
const schedulerSetting = {
  repairLearningMode: "AUTO", repairLearningMinimumSamples: 3,
  repairFullSampleThreshold: 10, repairEarlyAggregationMethod: "MEDIAN",
  defaultAggregationMethod: "MEAN", repairLookbackMonths: 6, repairOutlierMethod: "NONE",
};
const repairCondition = { repairType: "INTERNAL" as const, repairWorkCategoryId: 4,
  targetPartNameId: "spring", repairWorkActionId: 8, detailLabel: "OH" };

test("DB resolver only reads settings and complete activity history", async () => {
  const calls: string[] = [];
  const db = {
    schedulerSetting: { findUnique: async () => { calls.push("schedulerSetting.findUnique"); return schedulerSetting; } },
    schedulerActivitySetting: { findUnique: async () => { calls.push("schedulerActivitySetting.findUnique"); return null; } },
    workTimeSession: { findMany: async (query: { where: unknown }) => {
      calls.push("workTimeSession.findMany");
      assert.deepEqual(query.where, { activityType: "REPAIR" });
      return [];
    } },
  } as unknown as PrismaClient;
  const result = await getWorkTimeLearning(db, { activityType: "REPAIR", repairCondition, now });
  assert.equal(result.adoptedReason, "NO_STANDARD");
  assert.deepEqual(calls, ["schedulerSetting.findUnique", "workTimeSession.findMany"]);
});

test("DB resolver fails explicitly for absent settings", async () => {
  const db = {
    schedulerSetting: { findUnique: async () => null },
    schedulerActivitySetting: { findUnique: async () => null },
    workTimeSession: { findMany: async () => [] },
  } as unknown as PrismaClient;
  await assert.rejects(() => getWorkTimeLearning(db, { activityType: "REPAIR", repairCondition, now }), /SchedulerSetting is missing/);
  const withGlobal = { ...db, schedulerSetting: { findUnique: async () => schedulerSetting } } as unknown as PrismaClient;
  await assert.rejects(() => getWorkTimeLearning(withGlobal, { activityType: "INQUIRY", now }), /SchedulerActivitySetting is missing/);
});

test("DB resolver rejects a malformed REPAIR query without a condition", async () => {
  const db = {
    schedulerSetting: { findUnique: async () => schedulerSetting },
    workTimeSession: { findMany: async () => [] },
  } as unknown as PrismaClient;
  // @ts-expect-error REPAIR DB queries must supply the structured condition.
  await assert.rejects(() => getWorkTimeLearning(db, { activityType: "REPAIR", now }), /repairCondition is required/);
});
