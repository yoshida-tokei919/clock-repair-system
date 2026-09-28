import assert from "node:assert/strict";
import test from "node:test";
import { build, type Plugin } from "esbuild";

test("legacy GET remains available while POST fails closed without a Prisma transaction", async () => {
  const modules: Record<string, string> = {
    "@prisma/client": "export const Prisma = { TransactionIsolationLevel: { Serializable: 'Serializable' } };",
    "next-auth": "export const getServerSession = async () => globalThis.__legacySession;",
    "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = { $transaction: (fn) => { globalThis.__legacyTransactions++; return fn({ repair: { findMany: async () => [] }, workCalendar: { findMany: async () => [] } }); } };",
    "@/lib/auto-schedule-revision": "export const scheduleRevision = () => '';",
    "@/lib/simple-auto-scheduler": "export const buildSchedulePreview = () => ({}); export const SCHEDULE_HORIZON_DAYS = 180; export const todayInJapan = () => '';",
    "@/lib/work-calendar": "export const parseWorkDate = () => new Date();",
    "@/lib/repair-parts-readiness": "export const resolveRepairPartsReadiness = () => ({ state: 'READY' });",
  };
  const plugin: Plugin = {
    name: "route-dependencies",
    setup(api) {
      api.onResolve({ filter: /^(?:@prisma\/client|next-auth|next\/server|@\/lib\/)/ }, args =>
        ({ path: args.path, namespace: "stub" }));
      api.onLoad({ filter: /.*/, namespace: "stub" }, args =>
        ({ contents: modules[args.path], loader: "js" }));
    },
  };
  const built = await build({
    entryPoints: ["src/app/api/repairs/auto-schedule/route.ts"],
    bundle: true, platform: "node", format: "esm", write: false, plugins: [plugin],
  });
  const route = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
  (globalThis as any).__legacyTransactions = 0;
  (globalThis as any).__legacySession = null;
  const unauthorized = await route.POST();
  assert.equal(unauthorized.status, 401);
  (globalThis as any).__legacySession = { user: { id: "1" } };
  const preview = await route.GET();
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body, { preview: {}, revision: "" });
  assert.equal((globalThis as any).__legacyTransactions, 1);
  const disabled = await route.POST();
  assert.equal(disabled.status, 409);
  assert.match(disabled.body.error, /Scheduler v2/);
  assert.equal((globalThis as any).__legacyTransactions, 1);
});
