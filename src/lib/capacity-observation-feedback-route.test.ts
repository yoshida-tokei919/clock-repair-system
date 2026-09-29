import assert from "node:assert/strict";
import test from "node:test";
import { build, type Plugin } from "esbuild";

test("capacity feedback GET requires auth and only reads when authenticated", async () => {
  const modules: Record<string, string> = {
    "next-auth": "export const getServerSession = async () => globalThis.__capacitySession;",
    "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = {};",
    "@/lib/capacity-observation-feedback": "export const loadCapacityObservationFeedback = async () => { globalThis.__capacityReads++; if (globalThis.__capacityFail) throw Error('failed'); return { days: [] }; };",
  };
  const plugin: Plugin = { name: "capacity-feedback-route-dependencies", setup(api) {
    api.onResolve({ filter: /^(?:next-auth|next\/server|@\/lib\/)/ }, args => ({ path: args.path, namespace: "stub" }));
    api.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: modules[args.path], loader: "js" }));
  } };
  const built = await build({ entryPoints: ["src/app/api/settings/scheduler/capacity-feedback/route.ts"],
    bundle: true, platform: "node", format: "esm", write: false, plugins: [plugin] });
  const route = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
  const globals = globalThis as typeof globalThis & { __capacitySession: unknown;
    __capacityReads: number; __capacityFail: boolean };
  globals.__capacitySession = null; globals.__capacityReads = 0; globals.__capacityFail = false;
  assert.equal(route.dynamic, "force-dynamic");
  assert.deepEqual(await route.GET(), { body: { error: "認証が必要です。" }, status: 401 });
  assert.equal(globals.__capacityReads, 0);
  globals.__capacitySession = { user: { id: "1" } };
  assert.deepEqual(await route.GET(), { body: { days: [] }, status: 200 });
  assert.equal(globals.__capacityReads, 1);
  globals.__capacityFail = true;
  const originalError = console.error;
  console.error = () => {};
  try { assert.deepEqual(await route.GET(), {
    body: { error: "容量比較の計測実績を読み込めませんでした。" }, status: 500 }); }
  finally { console.error = originalError; }
});
