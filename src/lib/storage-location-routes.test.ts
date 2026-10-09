import assert from "node:assert/strict";
import test from "node:test";
import { build, type Plugin } from "esbuild";

async function route(entry: string, modules: Record<string, string>) {
  const plugin: Plugin = { name: "storage-location-route-stubs", setup(api) {
    api.onResolve({ filter: /^(?:next-auth|next\/server|@\/lib\/)/ },
      args => ({ path: args.path, namespace: "stub" }));
    api.onLoad({ filter: /.*/, namespace: "stub" },
      args => ({ contents: modules[args.path], loader: "js" }));
  } };
  const built = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", write: false, plugins: [plugin] });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString("base64")}`);
}

const globals = globalThis as typeof globalThis & {
  __storageSession: any; __storageReads: number; __storageParses: number; __storageJsonReads: number;
  __storageAdmin: any; __storageAdminReads: number; __storageMoves: number; __storageAdminId: number | null;
};
const response = "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };";

test("resolve route checks auth before body and DB and rejects malformed identifier", async () => {
  const modules = {
    "@/lib/admin-api-auth": "export const requireAdminApi = async () => globalThis.__storageSession?.user ? null : { body: { error: '認証が必要です。' }, status: 401 };",
    "next-auth": "export const getServerSession = async () => globalThis.__storageSession;",
    "next/server": response,
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = {};",
    "@/lib/storage-location-resolver": [
      "export const parseStorageLocationIdentifier = value => { globalThis.__storageParses++; if (!value.value) throw Error('invalid'); return value; };",
      "export const resolveStorageLocation = async () => { globalThis.__storageReads++; return { status: 'NOT_FOUND' }; };",
    ].join("\n"),
  };
  const target = await route("src/app/api/storage-locations/resolve/route.ts", modules);
  globals.__storageSession = null; globals.__storageReads = 0; globals.__storageParses = 0; globals.__storageJsonReads = 0;
  let body: any = { type: "QR_TOKEN", value: "opaque" };
  const request = { json: async () => { globals.__storageJsonReads++; return body; } };
  assert.equal(target.dynamic, "force-dynamic");
  assert.equal((await target.POST(request)).status, 401);
  assert.deepEqual([globals.__storageJsonReads, globals.__storageParses, globals.__storageReads], [0, 0, 0]);
  globals.__storageSession = { user: { id: "1" } };
  body = {};
  assert.equal((await target.POST(request)).status, 400);
  assert.deepEqual([globals.__storageJsonReads, globals.__storageParses, globals.__storageReads], [1, 1, 0]);
  body = { type: "QR_TOKEN", value: "opaque" };
  assert.deepEqual(await target.POST(request), { body: { status: "NOT_FOUND" }, status: 200 });
});

test("move route requires email and real Admin before domain mutation", async () => {
  const modules = {
    "next-auth": "export const getServerSession = async () => globalThis.__storageSession;",
    "next/server": response,
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = { admin: { findUnique: async args => { globalThis.__storageAdminReads++; globalThis.__storageAdmin = args; return globalThis.__storageAdminId === null ? null : { id: globalThis.__storageAdminId }; } } };",
    "@/lib/storage-location-move": [
      "export const parseStorageLocationMove = value => { globalThis.__storageParses++; if (!value.repairIds) throw Error('invalid'); return value; };",
      "export const moveStorageLocation = async (db, input, adminId) => { globalThis.__storageMoves++; return { adminId }; };",
      "export const storageLocationMoveFailure = () => ({ status: 500, message: 'failed' });",
    ].join("\n"),
  };
  const target = await route("src/app/api/storage-locations/move/route.ts", modules);
  globals.__storageSession = null; globals.__storageParses = 0; globals.__storageJsonReads = 0;
  globals.__storageAdminReads = 0; globals.__storageMoves = 0; globals.__storageAdminId = 42;
  let body: any = { storageLocationId: 1, repairIds: [10] };
  const request = { json: async () => { globals.__storageJsonReads++; return body; } };
  assert.equal(target.dynamic, "force-dynamic");
  assert.equal((await target.POST(request)).status, 401);
  assert.deepEqual([globals.__storageJsonReads, globals.__storageAdminReads, globals.__storageMoves], [0, 0, 0]);
  globals.__storageSession = { user: {} };
  assert.equal((await target.POST(request)).status, 401);
  assert.equal(globals.__storageJsonReads, 0);
  globals.__storageSession = { user: { email: "admin@example.com" } };
  globals.__storageAdminId = null;
  assert.equal((await target.POST(request)).status, 401);
  assert.equal(globals.__storageJsonReads, 0);
  assert.equal(globals.__storageAdminReads, 1);
  assert.equal(globals.__storageParses, 0);
  assert.equal(globals.__storageMoves, 0);
  globals.__storageAdminId = 42;
  body = {};
  assert.equal((await target.POST(request)).status, 400);
  assert.equal(globals.__storageAdminReads, 2);
  assert.equal(globals.__storageJsonReads, 1);
  assert.equal(globals.__storageParses, 1);
  body = { storageLocationId: 1, repairIds: [10] };
  globals.__storageAdminId = null;
  assert.equal((await target.POST(request)).status, 401);
  assert.equal(globals.__storageJsonReads, 1);
  assert.equal(globals.__storageParses, 1);
  assert.equal(globals.__storageMoves, 0);
  globals.__storageAdminId = 42;
  assert.deepEqual(await target.POST(request), { body: { adminId: 42 }, status: 200 });
  assert.deepEqual(globals.__storageAdmin, { where: { email: "admin@example.com" }, select: { id: true } });
});
