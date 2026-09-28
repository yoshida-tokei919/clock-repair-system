import assert from "node:assert/strict";
import test from "node:test";
import { build, type Plugin } from "esbuild";
import { resolve } from "node:path";
import { parseRepairScheduleInput } from "./repair-schedule";
import { RepairScheduleNotFoundError, ScheduleSummaryConflictError, updateRepairSchedule } from "./repair-schedule-update";

const date = new Date("2026-10-01T00:00:00.000Z");
const input = parseRepairScheduleInput({
  scheduledDate: "2026-10-02", estimatedWorkMinutes: 90,
  deliveryDateExpected: "2026-10-20", scheduleLocked: true,
});

function database(options: { existing?: boolean; segment?: boolean; updateCount?: number; currentDate?: Date } = {}) {
  const events: string[] = [];
  let updateArgs: any;
  const db = {
    repair: {
      findUnique: async () => { events.push("read repair");
        return options.existing === false ? null : { scheduledDate: options.currentDate ?? date }; },
      updateMany: async (args: unknown) => { events.push("update repair"); updateArgs = args;
        return { count: options.updateCount ?? 1 }; },
      findUniqueOrThrow: async () => { events.push("read result"); return { scheduledDate: date }; },
    },
    repairScheduleSegment: {
      findFirst: async () => { events.push("read segment"); return options.segment ? { id: 3 } : null; },
      create: () => { throw new Error("segment write"); },
      update: () => { throw new Error("segment write"); },
      delete: () => { throw new Error("segment write"); },
    },
  };
  return { db, events, get updateArgs() { return updateArgs; } };
}

test("zero segments allows scheduledDate edit with other schedule fields", async () => {
  const fixture = database();
  await updateRepairSchedule(fixture.db as never, 7, input);
  assert.deepEqual(fixture.events, ["read repair", "read segment", "update repair", "read result"]);
  assert.equal(fixture.updateArgs.data.scheduledDate.toISOString(), "2026-10-02T00:00:00.000Z");
  assert.deepEqual(fixture.updateArgs.where.scheduleSegments, { none: {} });
  assert.equal(fixture.updateArgs.data.estimatedWorkMinutes, 90);
  assert.equal(fixture.updateArgs.data.scheduleLocked, true);
  assert.equal(fixture.updateArgs.data.deliveryDateExpected.toISOString(), "2026-10-20T00:00:00.000Z");
});

test("segment plus changed scheduledDate rejects before any write", async () => {
  const fixture = database({ segment: true });
  await assert.rejects(updateRepairSchedule(fixture.db as never, 7, input), ScheduleSummaryConflictError);
  assert.deepEqual(fixture.events, ["read repair", "read segment"]);
});

test("segment plus unchanged scheduledDate allows other fields and omits summary write", async () => {
  const storedDate = new Date("2026-10-01T12:34:00.000Z");
  const fixture = database({ segment: true, currentDate: storedDate });
  await updateRepairSchedule(fixture.db as never, 7, { ...input, scheduledDate: date });
  assert.deepEqual(fixture.events, ["read repair", "read segment", "update repair", "read result"]);
  assert.equal("scheduledDate" in fixture.updateArgs.data, false);
  assert.equal(fixture.updateArgs.where.scheduledDate, storedDate);
  assert.equal("scheduleSegments" in fixture.updateArgs.where, false);
  assert.equal(fixture.updateArgs.data.estimatedWorkMinutes, 90);
});

test("missing repair and concurrent summary change fail without a segment write", async () => {
  const missing = database({ existing: false });
  await assert.rejects(updateRepairSchedule(missing.db as never, 7, input), RepairScheduleNotFoundError);
  assert.deepEqual(missing.events, ["read repair"]);
  const concurrent = database({ updateCount: 0 });
  await assert.rejects(updateRepairSchedule(concurrent.db as never, 7, input), ScheduleSummaryConflictError);
  assert.deepEqual(concurrent.events, ["read repair", "read segment", "update repair"]);
});

test("PATCH preserves auth and input validation, and maps a segmented date edit to 409", async () => {
  const modules: Record<string, string> = {
    "@prisma/client": "export const Prisma = { TransactionIsolationLevel: { Serializable: 'Serializable' }, PrismaClientKnownRequestError: class extends Error {} };",
    "next-auth": "export const getServerSession = async () => globalThis.__patchSession;",
    "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = { $transaction: (fn, options) => { globalThis.__patchIsolation = options.isolationLevel; return fn(globalThis.__patchTx); } };",
  };
  const plugin: Plugin = {
    name: "patch-route-dependencies",
    setup(api) {
      api.onResolve({ filter: /^@\/lib\/repair-schedule(?:-update)?$/ }, args => ({
        path: resolve("src/lib", args.path.endsWith("-update") ? "repair-schedule-update.ts" : "repair-schedule.ts"),
      }));
      api.onResolve({ filter: /^(?:@prisma\/client|next-auth|next\/server|@\/lib\/auth|@\/lib\/prisma)$/ }, args =>
        ({ path: args.path, namespace: "stub" }));
      api.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: modules[args.path], loader: "js" }));
    },
  };
  const built = await build({ entryPoints: ["src/app/api/repairs/[id]/schedule/route.ts"],
    bundle: true, platform: "node", format: "esm", write: false, plugins: [plugin] });
  const route = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
  const request = (body: unknown) => new Request("http://localhost/api/repairs/7/schedule", {
    method: "PATCH", body: JSON.stringify(body),
  });
  (globalThis as any).__patchSession = null;
  assert.equal((await route.PATCH(request({}), { params: { id: "7" } })).status, 401);
  (globalThis as any).__patchSession = { user: { id: "1" } };
  assert.equal((await route.PATCH(request({}), { params: { id: "bad" } })).status, 400);
  assert.equal((await route.PATCH(request({}), { params: { id: "7" } })).status, 400);
  const fixture = database({ segment: true });
  (globalThis as any).__patchTx = fixture.db;
  const conflict = await route.PATCH(request({
    scheduledDate: "2026-10-02", estimatedWorkMinutes: 90,
    deliveryDateExpected: "2026-10-20", scheduleLocked: true,
  }), { params: { id: "7" } });
  assert.equal(conflict.status, 409);
  assert.match(conflict.body.error, /代表日/);
  assert.equal((globalThis as any).__patchIsolation, "Serializable");
  assert.deepEqual(fixture.events, ["read repair", "read segment"]);
});
