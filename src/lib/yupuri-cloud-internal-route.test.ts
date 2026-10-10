import assert from "node:assert/strict";
import test from "node:test";
import { build, type Plugin } from "esbuild";

const state = globalThis as typeof globalThis & { __cloudToken?: string; __cloudNextReads?: number; __cloudCompletes?: number; __cloudBodyReads?: number };
async function route(entry: string) {
  const modules: Record<string, string> = {
    "next/server": "export class NextRequest {}; export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/prisma": "export const prisma = {};",
    "@/lib/yupuri-cloud-issuance": [
      "export const nextCloudIssue = async () => { globalThis.__cloudNextReads++; return null; };",
      "export const parseIssueComplete = value => { if (value.trackingNumber !== '398007150100') throw { status: 400, message: 'bad tracking' }; return value; };",
      "export const completeCloudIssue = async () => { globalThis.__cloudCompletes++; return { status: 'LABEL_ISSUED' }; };",
      "export const cloudIssueFailure = error => ({ status: error.status ?? 500, message: error.message });",
    ].join("\n"),
  };
  const plugin: Plugin = { name: "cloud-route-stubs", setup(api) {
    api.onResolve({ filter: /^(?:next\/server|@\/lib\/|\.\.\/_auth$)/ }, args => ({ path: args.path, namespace: "stub" }));
    api.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: args.path === "../_auth"
      ? "export const cloudWorkerAuthorized = request => !globalThis.__cloudToken ? null : request.headers.get('authorization') === `Bearer ${globalThis.__cloudToken}`;"
      : modules[args.path], loader: "js" }));
  } };
  const built = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", write: false, plugins: [plugin] });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
}

test("internal Cloud routes fail closed without token and never read body before authorization", async () => {
  const next = await route("src/app/api/internal/yupuri-cloud/next/route.ts");
  const complete = await route("src/app/api/internal/yupuri-cloud/complete/route.ts");
  state.__cloudToken = undefined; state.__cloudNextReads = 0; state.__cloudCompletes = 0; state.__cloudBodyReads = 0;
  const request = { headers: new Headers(), json: async () => { state.__cloudBodyReads!++; return { trackingNumber: "398007150100" }; } };
  assert.equal((await next.GET(request)).status, 503);
  assert.equal((await complete.POST(request)).status, 503);
  state.__cloudToken = "secret";
  assert.equal((await next.GET(request)).status, 401);
  assert.equal((await complete.POST(request)).status, 401);
  assert.deepEqual([state.__cloudNextReads, state.__cloudCompletes, state.__cloudBodyReads], [0, 0, 0]);
  request.headers.set("authorization", "Bearer secret");
  assert.equal((await next.GET(request)).status, 200);
  assert.equal((await complete.POST(request)).status, 200);
  assert.deepEqual([state.__cloudNextReads, state.__cloudCompletes, state.__cloudBodyReads], [1, 1, 1]);
});
