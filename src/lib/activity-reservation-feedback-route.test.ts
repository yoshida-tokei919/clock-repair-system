import assert from "node:assert/strict";
import test from "node:test";
import { build, type Plugin } from "esbuild";

test("feedback GET requires auth, reads only, and reports isolated load failure", async () => {
  const modules: Record<string, string> = {
    "@/lib/admin-api-auth": "export const requireAdminApi = async () => globalThis.__activityFeedbackSession?.user ? null : { body: { error: '認証が必要です。' }, status: 401 };",
    "next-auth": "export const getServerSession = async () => globalThis.__activityFeedbackSession;",
    "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = {};",
    "@/lib/activity-reservation-feedback": "export const loadActivityReservationFeedback = async () => { globalThis.__activityFeedbackReads++; if (globalThis.__activityFeedbackFail) throw Error('failed'); return []; };",
  };
  const plugin: Plugin = { name: "feedback-route-dependencies", setup(api) {
    api.onResolve({ filter: /^(?:next-auth|next\/server|@\/lib\/)/ }, args => ({ path: args.path, namespace: "stub" }));
    api.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: modules[args.path], loader: "js" }));
  } };
  const built = await build({ entryPoints: ["src/app/api/settings/scheduler/activities/feedback/route.ts"],
    bundle: true, platform: "node", format: "esm", write: false, plugins: [plugin] });
  const route = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
  const globals = globalThis as typeof globalThis & { __activityFeedbackSession: unknown;
    __activityFeedbackReads: number; __activityFeedbackFail: boolean };
  globals.__activityFeedbackSession = null; globals.__activityFeedbackReads = 0; globals.__activityFeedbackFail = false;
  assert.equal((await route.GET()).status, 401);
  assert.equal(globals.__activityFeedbackReads, 0);
  globals.__activityFeedbackSession = { user: { id: "1" } };
  assert.deepEqual(await route.GET(), { body: [], status: 200 });
  assert.equal(globals.__activityFeedbackReads, 1);
  globals.__activityFeedbackFail = true;
  const originalError = console.error;
  console.error = () => {};
  try { assert.equal((await route.GET()).status, 500); }
  finally { console.error = originalError; }
});
