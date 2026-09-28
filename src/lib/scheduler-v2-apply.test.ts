import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { StaleScheduleError } from "./auto-schedule-revision";
import { applySchedulerV2Preview, applySchedulerV2Revision, isSchedulerV2ApplyConflict,
  parseSchedulerV2ApplyBody } from "./scheduler-v2-apply";
import { loadSchedulerV2Preview } from "./scheduler-v2-preview";

const revision = "a".repeat(64);
const proposed = (repairId: number, workDate: string, plannedMinutes: number, sortOrder = 0) =>
  ({ repairId, workDate, plannedMinutes, source: "AUTO" as const, sortOrder });
const current = (repairId: number, workDate: string, source: "AUTO" | "MANUAL" = "AUTO") =>
  ({ id: repairId, repairId, workDate, plannedMinutes: 60, source, sortOrder: 0 });
function repair(id: number, action: string, options: {
  summary?: string | null; segments?: ReturnType<typeof current>[];
  proposal?: ReturnType<typeof proposed>[]; locked?: boolean;
} = {}) {
  return { id, futureApplyAction: action, autoCandidate: action !== "PROTECTED",
    scheduleLocked: options.locked ?? false, status: "作業待ち", estimatedWorkMinutes: 60,
    currentScheduledDate: options.summary ?? null, currentSegments: options.segments ?? [],
    proposedSegments: options.proposal ?? [],
    proposedSummaryDate: options.proposal?.[0]?.workDate ?? null };
}
function database(guardPass = true) {
  const events: { operation: string; args: any }[] = [];
  const db = {
    repair: {
      updateMany: async (args: unknown) => { events.push({ operation: "update", args });
        return { count: guardPass ? 1 : 0 }; },
      findFirst: async (args: unknown) => { events.push({ operation: "guard", args });
        return guardPass ? { id: 1 } : null; },
    },
    repairScheduleSegment: {
      deleteMany: async (args: unknown) => { events.push({ operation: "delete", args }); return { count: 1 }; },
      createMany: async (args: unknown) => { events.push({ operation: "create", args }); return { count: 1 }; },
    },
  };
  return { db, events };
}
async function apply(rows: ReturnType<typeof repair>[], submitted = revision, guardPass = true) {
  const { db, events } = database(guardPass);
  const preview = { snapshotRevision: revision, repairs: rows };
  const result = await applySchedulerV2Preview(db as never, preview as never, submitted);
  return { result, events };
}

test("stale revision rejects before any write", async () => {
  const { db, events } = database();
  await assert.rejects(applySchedulerV2Preview(db as never, { snapshotRevision: revision,
    repairs: [repair(1, "CREATE_AUTO", { proposal: [proposed(1, "2026-10-01", 60)] })] } as never,
    "b".repeat(64)), StaleScheduleError);
  assert.deepEqual(events, []);
});

test("CREATE_AUTO inserts only proposed AUTO segments and syncs first date in UTC", async () => {
  const { result, events } = await apply([repair(1, "CREATE_AUTO", { proposal: [
    proposed(1, "2026-10-02", 40, 2), proposed(1, "2026-10-03", 20, 4),
  ] })]);
  assert.deepEqual(result, { changedRepairs: 1, createdSegments: 2 });
  assert.deepEqual(events.map(event => event.operation), ["update", "create"]);
  assert.equal(events[0].args.data.scheduledDate.toISOString(), "2026-10-02T00:00:00.000Z");
  assert.deepEqual(events[1].args.data.map((row: any) =>
    [row.workDate.toISOString(), row.plannedMinutes, row.source, row.sortOrder]), [
    ["2026-10-02T00:00:00.000Z", 40, "AUTO", 2],
    ["2026-10-03T00:00:00.000Z", 20, "AUTO", 4],
  ]);
  assert.equal("skipDuplicates" in events[1].args, false);
});

test("CREATE_FROM_LEGACY creates segments and avoids an unchanged summary write", async () => {
  const { result, events } = await apply([repair(1, "CREATE_FROM_LEGACY", {
    summary: "2026-10-01", proposal: [proposed(1, "2026-10-01", 60)],
  })]);
  assert.deepEqual(result, { changedRepairs: 1, createdSegments: 1 });
  assert.deepEqual(events.map(event => event.operation), ["guard", "create"]);
  assert.equal(events[0].args.where.scheduleLocked, false);
});

test("REPLACE_AUTO deletes only its repair's AUTO rows and creates proposed rows", async () => {
  const { events } = await apply([repair(1, "REPLACE_AUTO", {
    summary: "2026-10-01", segments: [current(1, "2026-10-01")],
    proposal: [proposed(1, "2026-10-02", 60, 3)],
  })]);
  assert.deepEqual(events.map(event => event.operation), ["update", "delete", "create"]);
  assert.deepEqual(events[1].args.where, { repairId: 1, source: "AUTO" });
  assert.equal(events[2].args.data[0].sortOrder, 3);
});

test("SUMMARY_ONLY_SYNC updates the summary without segment mutation", async () => {
  const { result, events } = await apply([repair(1, "SUMMARY_ONLY_SYNC", {
    summary: "2026-10-03", segments: [current(1, "2026-10-01")],
    proposal: [proposed(1, "2026-10-01", 60)],
  })]);
  assert.deepEqual(result, { changedRepairs: 1, createdSegments: 0 });
  assert.deepEqual(events.map(event => event.operation), ["update"]);
  assert.equal(events[0].args.data.scheduledDate.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("NO_CHANGE, PRESERVE_UNPLACED, and PROTECTED make no writes", async () => {
  const { result, events } = await apply([
    repair(1, "NO_CHANGE", { summary: "2026-10-01", segments: [current(1, "2026-10-01")],
      proposal: [proposed(1, "2026-10-01", 60)] }),
    repair(2, "PRESERVE_UNPLACED", { summary: "2026-10-02", segments: [current(2, "2026-10-02")] }),
    repair(3, "PROTECTED", { locked: true, segments: [current(3, "2026-10-03", "MANUAL")] }),
  ]);
  assert.deepEqual(result, { changedRepairs: 0, createdSegments: 0 });
  assert.deepEqual(events, []);
});

test("multiple changed repairs use one supplied transaction client", async () => {
  const { result, events } = await apply([
    repair(1, "CREATE_AUTO", { proposal: [proposed(1, "2026-10-01", 60)] }),
    repair(2, "CREATE_FROM_LEGACY", { summary: "2026-10-02",
      proposal: [proposed(2, "2026-10-01", 60, 1)] }),
  ]);
  assert.deepEqual(result, { changedRepairs: 2, createdSegments: 2 });
  assert.deepEqual(events.map(event => event.operation), ["update", "create", "update", "create"]);
  assert.deepEqual(events.filter(event => event.operation === "create")
    .map(event => event.args.data[0].repairId), [1, 2]);
});

test("revision wrapper recomputes the preview through the supplied transaction client", async () => {
  const events: string[] = [];
  const raw = { id: 1, inquiryNumber: "T-1", status: "作業待ち", scheduledDate: null,
    scheduleLocked: false, estimatedWorkMinutes: 60, deliveryDateExpected: new Date("2026-10-03"),
    partsAllocationLegacy: false, updatedAt: new Date("2026-10-01"), planningState: null,
    estimate: null, partAllocations: [], orderRequests: [] };
  const db = {
    repair: {
      findMany: async (args: any) => { events.push("read repair");
        return args.select?.priorityScore ?
          [{ id: 1, priorityScore: 3, receptionDate: new Date("2026-09-01") }] : [raw]; },
      updateMany: async () => { events.push("update repair"); return { count: 1 }; },
    },
    repairScheduleSegment: {
      findMany: async () => { events.push("read segments"); return []; },
      createMany: async () => { events.push("create segments"); return { count: 1 }; },
    },
    workCalendar: { findMany: async () => { events.push("read calendar"); return []; } },
    schedulerSetting: { findUnique: async () => { events.push("read settings"); return {
      dailyScheduleReviewMinutes: 0, runningTestDays: 0, reworkBufferDays: 0,
      shippingBufferDays: 0, updatedAt: new Date("2026-10-01"),
    }; } },
    schedulerActivitySetting: { findMany: async () => { events.push("read activity"); return []; } },
  };
  const now = new Date("2026-10-01T03:00:00Z");
  const preview = await loadSchedulerV2Preview(db as never, now);
  events.length = 0;
  const result = await applySchedulerV2Revision(db as never, preview.snapshotRevision, now);
  assert.deepEqual(result, { changedRepairs: 1, createdSegments: 1 });
  assert.equal(events.filter(event => event.startsWith("read")).length, 6);
  assert.ok(events.indexOf("read segments") < events.indexOf("update repair"));
  assert.deepEqual(events.slice(-2), ["update repair", "create segments"]);
});

test("failed Repair guard rejects before any segment mutation", async () => {
  const { db, events } = database(false);
  await assert.rejects(applySchedulerV2Preview(db as never, { snapshotRevision: revision,
    repairs: [repair(1, "REPLACE_AUTO", { summary: "2026-10-01",
      segments: [current(1, "2026-10-01")], proposal: [proposed(1, "2026-10-02", 60)] })],
  } as never, revision), StaleScheduleError);
  assert.deepEqual(events.map(event => event.operation), ["update"]);
});

test("MANUAL or locked proposals fail closed before mutation", async () => {
  for (const options of [{ locked: true }, { segments: [current(1, "2026-10-01", "MANUAL")] }]) {
    const { db, events } = database();
    await assert.rejects(applySchedulerV2Preview(db as never, { snapshotRevision: revision,
      repairs: [repair(1, "REPLACE_AUTO", { ...options, proposal: [proposed(1, "2026-10-02", 60)] })],
    } as never, revision), StaleScheduleError);
    assert.deepEqual(events, []);
  }
});

test("body accepts only a revision and P2034 is classified as conflict", () => {
  assert.equal(parseSchedulerV2ApplyBody({ revision }), revision);
  for (const body of [null, {}, { revision: "bad" }, { revision, segments: [] },
    { revision: 1 }, [], { revision: revision.toUpperCase() }]) {
    assert.throws(() => parseSchedulerV2ApplyBody(body), /Invalid schedule revision/);
  }
  const conflict = new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "5.7.0" });
  assert.equal(isSchedulerV2ApplyConflict(conflict), true);
  assert.equal(isSchedulerV2ApplyConflict(new StaleScheduleError("stale")), true);
  assert.equal(isSchedulerV2ApplyConflict(new Error("other")), false);
});

test("P2002 is a schedule conflict without broadening other Prisma errors", () => {
  const knownError = (code: string) => new Prisma.PrismaClientKnownRequestError("conflict", {
    code, clientVersion: "5.7.0",
  });
  assert.equal(isSchedulerV2ApplyConflict(knownError("P2002")), true);
  assert.equal(isSchedulerV2ApplyConflict(knownError("P2003")), false);
});

test("POST route authenticates, recomputes in Serializable transaction, and maps conflicts to 409", () => {
  const source = readFileSync("src/app/api/repairs/scheduler-v2-apply/route.ts", "utf8");
  assert.match(source, /export async function POST\(/);
  assert.doesNotMatch(source, /export async function (GET|PUT|PATCH|DELETE)\(/);
  assert.ok(source.indexOf("if (!session?.user)") < source.indexOf("request.json()"));
  assert.match(source, /prisma\.\$transaction\(tx => applySchedulerV2Revision\(tx, revision\)/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /isSchedulerV2ApplyConflict\(error\)/);
  assert.match(source, /status: 409/);
  assert.match(source, /status: 400/);
});
