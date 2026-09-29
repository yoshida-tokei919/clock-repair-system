import assert from "node:assert/strict";
import test from "node:test";
import { build, type Plugin } from "esbuild";

test("deadline readiness GET requires auth and only reads when authenticated", async () => {
  const modules: Record<string, string> = {
    "next-auth": "export const getServerSession = async () => globalThis.__deadlineSession;",
    "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = {};",
    "@/lib/deadline-feedback-readiness": "export const loadDeadlineFeedbackReadiness = async () => { globalThis.__deadlineReads++; if (globalThis.__deadlineFail) throw Error('failed'); return { repairCounts: {} }; };",
  };
  const plugin: Plugin = { name: "deadline-readiness-route-dependencies", setup(api) {
    api.onResolve({ filter: /^(?:next-auth|next\/server|@\/lib\/)/ }, args => ({ path: args.path, namespace: "stub" }));
    api.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: modules[args.path], loader: "js" }));
  } };
  const built = await build({ entryPoints: ["src/app/api/settings/scheduler/deadline-feedback-readiness/route.ts"],
    bundle: true, platform: "node", format: "esm", write: false, plugins: [plugin] });
  const route = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
  const globals = globalThis as typeof globalThis & { __deadlineSession: unknown;
    __deadlineReads: number; __deadlineFail: boolean };
  globals.__deadlineSession = null; globals.__deadlineReads = 0; globals.__deadlineFail = false;
  assert.equal(route.dynamic, "force-dynamic");
  assert.deepEqual(await route.GET(), { body: { error: "認証が必要です。" }, status: 401 });
  assert.equal(globals.__deadlineReads, 0);
  globals.__deadlineSession = { user: { id: "1" } };
  assert.deepEqual(await route.GET(), { body: { repairCounts: {} }, status: 200 });
  assert.equal(globals.__deadlineReads, 1);
  globals.__deadlineFail = true;
  const originalError = console.error;
  console.error = () => {};
  try { assert.deepEqual(await route.GET(), {
    body: { error: "納期フィードバックのデータ状況を読み込めませんでした。" }, status: 500 }); }
  finally { console.error = originalError; }
});
