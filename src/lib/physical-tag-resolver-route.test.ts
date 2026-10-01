import assert from "node:assert/strict";
import test from "node:test";
import { build, type Plugin } from "esbuild";

test("PhysicalTag resolver POST requires auth and validates before DB lookup", async () => {
  const resolverStub = [
    'export const parsePhysicalTagIdentifier = value => {',
    '  globalThis.__physicalTagParses++;',
    '  if (globalThis.__physicalTagInvalid) throw Error("invalid");',
    '  return value;',
    '};',
    'export const resolvePhysicalTag = async () => {',
    '  globalThis.__physicalTagReads++;',
    '  if (globalThis.__physicalTagFail) throw Error("failed");',
    '  return { status: "NOT_FOUND" };',
    '};',
  ].join("\n");
  const modules: Record<string, string> = {
    "next-auth": "export const getServerSession = async () => globalThis.__physicalTagSession;",
    "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = {};",
    "@/lib/physical-tag-resolver": resolverStub,
  };
  const plugin: Plugin = {
    name: "physical-tag-resolver-route-dependencies",
    setup(api) {
      api.onResolve({ filter: /^(?:next-auth|next\/server|@\/lib\/)/ },
        args => ({ path: args.path, namespace: "stub" }));
      api.onLoad({ filter: /.*/, namespace: "stub" },
        args => ({ contents: modules[args.path], loader: "js" }));
    },
  };

  const built = await build({
    entryPoints: ["src/app/api/physical-tags/resolve/route.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    plugins: [plugin],
  });
  const encoded = Buffer.from(built.outputFiles[0].contents).toString("base64");
  const route = await import(`data:text/javascript;base64,${encoded}`);

  const globals = globalThis as typeof globalThis & {
    __physicalTagSession: unknown;
    __physicalTagParses: number;
    __physicalTagReads: number;
    __physicalTagInvalid: boolean;
    __physicalTagFail: boolean;
    __physicalTagJsonReads: number;
  };
  globals.__physicalTagSession = null;
  globals.__physicalTagParses = 0;
  globals.__physicalTagReads = 0;
  globals.__physicalTagInvalid = false;
  globals.__physicalTagFail = false;
  globals.__physicalTagJsonReads = 0;

  const request = { json: async () => {
    globals.__physicalTagJsonReads++;
    return { type: "QR_TOKEN", value: "abc" };
  } };

  assert.equal(route.dynamic, "force-dynamic");
  assert.deepEqual(await route.POST(request), {
    body: { error: "認証が必要です。" },
    status: 401,
  });
  assert.equal(globals.__physicalTagParses, 0);
  assert.equal(globals.__physicalTagReads, 0);
  assert.equal(globals.__physicalTagJsonReads, 0);

  globals.__physicalTagSession = { user: { id: "1" } };
  assert.deepEqual(await route.POST(request), {
    body: { status: "NOT_FOUND" },
    status: 200,
  });
  assert.equal(globals.__physicalTagParses, 1);
  assert.equal(globals.__physicalTagReads, 1);
  assert.equal(globals.__physicalTagJsonReads, 1);
  globals.__physicalTagInvalid = true;
  assert.deepEqual(await route.POST(request), {
    body: { error: "識別子が不正です。" },
    status: 400,
  });
  assert.equal(globals.__physicalTagReads, 1);
  assert.equal(globals.__physicalTagJsonReads, 2);

  globals.__physicalTagInvalid = false;
  globals.__physicalTagFail = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await route.POST(request), {
      body: { error: "PhysicalTagを解決できませんでした。" },
      status: 500,
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(globals.__physicalTagReads, 2);
  assert.equal(globals.__physicalTagJsonReads, 3);
});
