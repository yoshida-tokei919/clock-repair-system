import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { getRepairWorkTimePreview } from "./repair-work-time-preview";
import { applyRepairWorkTimePreview, applyRepairWorkTimePreviewRequest, parseWorkTimePreviewApplyBody,
  StaleWorkTimePreviewError, UnsafeWorkTimePreviewError } from "./repair-work-time-preview-apply";

const now = new Date("2026-09-27T12:00:00Z");
const line = { id: 20, lineType: "LABOR", repairWorkCategoryId: 4,
  repairWorkCategory: { repairType: "INTERNAL" }, targetPartNameId: null,
  repairWorkActionId: null, detailLabelSnapshot: null };
type TestLine = Omit<typeof line, "repairWorkCategoryId" | "repairWorkCategory"> & {
  repairWorkCategoryId: number | null; repairWorkCategory: { repairType: string } | null;
};
const watch = { brandId: 1, modelId: null, referenceId: null, caseReferenceId: null,
  caliberId: null, baseCaliberId: null, driveType: null };
const setting = { repairLearningMode: "MANUAL", repairLearningMinimumSamples: 3,
  repairFullSampleThreshold: 10, repairEarlyAggregationMethod: "MEDIAN",
  defaultAggregationMethod: "MEAN", repairLookbackMonths: 6, repairOutlierMethod: "NONE" };

function fixture(options: { missingRepair?: boolean; missingSetting?: boolean;
  lines?: TestLine[]; standardMinutes?: number } = {}) {
  let minutes = 10;
  let writes = 0;
  let beforeUpdate: (() => void) | undefined;
  const repair = { id: 10, movementCaliberId: null, baseMovementCaliberId: null,
    watch, repairLineItems: options.lines ?? [line] };
  const tx = {
    repair: {
      findUnique: async () => options.missingRepair ? null : { ...repair, estimatedWorkMinutes: minutes },
      updateMany: async ({ where, data }: { where: { id: number; estimatedWorkMinutes: number };
        data: Record<string, unknown> }) => {
        beforeUpdate?.();
        if (where.id !== 10 || where.estimatedWorkMinutes !== minutes) return { count: 0 };
        assert.deepEqual(Object.keys(data), ["estimatedWorkMinutes"]);
        minutes = data.estimatedWorkMinutes as number;
        writes++;
        return { count: 1 };
      },
    },
    schedulerSetting: { findUnique: async () => options.missingSetting ? null : setting },
    repairWorkTimeStandard: { findMany: async () => options.standardMinutes === undefined ? [] : [{
      id: 1, repairType: "INTERNAL", categoryId: 4, targetPartNameId: null,
      actionId: null, detailLabel: null, driveType: null, standardMinutes: options.standardMinutes,
    }] },
    workTimeSession: { findMany: async () => [] },
  };
  const db = { ...tx, $transaction: async (fn: (transaction: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient;
  return { db, get minutes() { return minutes; }, get writes() { return writes; },
    changeMinutes(value: number) { minutes = value; },
    beforeUpdate(callback: () => void) { beforeUpdate = callback; } };
}

test("apply writes only rounded estimatedWorkMinutes from a current complete preview", async () => {
  const state = fixture({ standardMinutes: 45 });
  const preview = (await getRepairWorkTimePreview(state.db, 10, now))!;
  assert.equal(preview.roundedEstimatedWorkMinutes, 45);
  assert.deepEqual(await applyRepairWorkTimePreview(state.db, 10, preview.revision, now),
    { estimatedWorkMinutes: 45 });
  assert.equal(state.minutes, 45);
  assert.equal(state.writes, 1);
});

test("request handler returns applied value with HTTP 200", async () => {
  const state = fixture({ standardMinutes: 45 });
  const preview = (await getRepairWorkTimePreview(state.db, 10, now))!;
  assert.deepEqual(await applyRepairWorkTimePreviewRequest(state.db, 10, { revision: preview.revision }, now),
    { status: 200, body: { estimatedWorkMinutes: 45 } });
  assert.equal(state.writes, 1);
});

test("stale revision and later manual edit cannot overwrite persisted minutes", async () => {
  const state = fixture({ standardMinutes: 45 });
  const preview = (await getRepairWorkTimePreview(state.db, 10, now))!;
  await assert.rejects(() => applyRepairWorkTimePreview(state.db, 10, "0".repeat(64), now), StaleWorkTimePreviewError);
  assert.equal(state.writes, 0);
  state.changeMinutes(22);
  const stale = await applyRepairWorkTimePreviewRequest(state.db, 10, { revision: preview.revision }, now);
  assert.equal(stale.status, 409);
  assert.equal(state.minutes, 22);
  assert.equal(state.writes, 0);
});

test("conditional write detects a manual edit after recalculation", async () => {
  const state = fixture({ standardMinutes: 45 });
  const preview = (await getRepairWorkTimePreview(state.db, 10, now))!;
  state.beforeUpdate(() => state.changeMinutes(23));
  await assert.rejects(() => applyRepairWorkTimePreview(state.db, 10, preview.revision, now), StaleWorkTimePreviewError);
  assert.equal(state.minutes, 23);
  assert.equal(state.writes, 0);
});

test("missing Repair short circuits; missing setting and incomplete previews never write", async () => {
  const missing = fixture({ missingRepair: true });
  assert.equal((await applyRepairWorkTimePreviewRequest(missing.db, 10, { revision: "0".repeat(64) }, now)).status, 404);
  assert.equal(missing.writes, 0);
  const missingSetting = fixture({ missingSetting: true });
  const unavailable = await applyRepairWorkTimePreviewRequest(missingSetting.db, 10, { revision: "0".repeat(64) }, now);
  assert.equal(unavailable.status, 409);
  assert.match("error" in unavailable.body ? unavailable.body.error : "", /SchedulerSetting is missing/);
  assert.equal(missingSetting.writes, 0);
  for (const lines of [[], [{ ...line, repairWorkCategoryId: null, repairWorkCategory: null }]]) {
    const state = fixture({ lines, standardMinutes: 45 });
    const preview = (await getRepairWorkTimePreview(state.db, 10, now))!;
    assert.equal(preview.roundedEstimatedWorkMinutes, null);
    await assert.rejects(() => applyRepairWorkTimePreview(state.db, 10, preview.revision, now), UnsafeWorkTimePreviewError);
    assert.equal(state.writes, 0);
  }
});

test("zero and out-of-range rounded values are unsafe", async () => {
  for (const standardMinutes of [0, 2147483648]) {
    const state = fixture({ standardMinutes });
    const preview = (await getRepairWorkTimePreview(state.db, 10, now))!;
    await assert.rejects(() => applyRepairWorkTimePreview(state.db, 10, preview.revision, now), UnsafeWorkTimePreviewError);
    assert.equal(state.writes, 0);
  }
});

test("apply body accepts only one lowercase SHA-256 revision and no client minutes", () => {
  const revision = "a".repeat(64);
  assert.equal(parseWorkTimePreviewApplyBody({ revision }), revision);
  for (const body of [null, [], {}, { revision: "A".repeat(64) }, { revision: "a" },
    { revision, estimatedWorkMinutes: 999 }, { revision, minutes: 999 }]) {
    assert.throws(() => parseWorkTimePreviewApplyBody(body), /Invalid work-time preview revision/);
  }
});

test("malformed or extra request fields return HTTP 400 before any read or write", async () => {
  const state = fixture({ standardMinutes: 45 });
  for (const body of [{ revision: "bad" }, { revision: "a".repeat(64), estimatedWorkMinutes: 999 }]) {
    assert.equal((await applyRepairWorkTimePreviewRequest(state.db, 10, body, now)).status, 400);
  }
  assert.equal(state.writes, 0);
});
