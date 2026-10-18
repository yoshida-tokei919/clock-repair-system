import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const state = globalThis as typeof globalThis & { __repairTagSession: any; __repairTagAdmin: boolean;
  __repairTagReads: number; __repairTagWrites: number; __repairTagBodyReads: number; __repairTagOperator: number | null };

function loadRoute() {
  const modules: Record<string, string> = {
    "next-auth": "export const getServerSession = async () => globalThis.__repairTagSession;",
    "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = { admin: { findUnique: async () => globalThis.__repairTagAdmin ? { id: 42 } : null } };",
    "@/lib/repair-tag-release": [
      "export const parseRepairIds = body => { if (!Array.isArray(body.repairIds)) throw Error('bad input'); return body.repairIds; };",
      "export const parseRepairTagReleaseRequest = body => { if (body.confirmed !== true) throw Error('confirmation required'); return body; };",
      "export const previewRepairTagRelease = async () => { globalThis.__repairTagReads++; return { eligibleCount: 1 }; };",
      "export const releaseRepairTags = async (db, body, operator) => { globalThis.__repairTagWrites++; globalThis.__repairTagOperator = operator; return { releasedCount: 1 }; };",
    ].join("\n"),
    "@/lib/shipment-tag-release": "export const shipmentTagReleaseFailure = error => ({ status: 400, message: error.message });",
  };
  function load(path: string): Record<string, any> {
    const code = ts.transpileModule(modules[path] ?? readFileSync(path, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const module = { exports: {} as Record<string, any> };
    new Function("exports", "require", "module", code)(module.exports, load, module);
    return module.exports;
  }
  return load("src/app/api/repairs/physical-tag-release/route.ts");
}

test("preview and execution authenticate before reading input and require actual admin", async () => {
  const route = loadRoute();
  state.__repairTagSession = null; state.__repairTagAdmin = true;
  state.__repairTagReads = 0; state.__repairTagWrites = 0; state.__repairTagBodyReads = 0;
  const request = { json: async () => { state.__repairTagBodyReads++; return { repairIds: [10], confirmed: true }; } };
  assert.equal(route.dynamic, "force-dynamic");
  assert.equal((await route.POST(request)).status, 401);
  assert.equal((await route.PUT(request)).status, 401);
  state.__repairTagSession = { user: { email: "admin@example.test" } }; state.__repairTagAdmin = false;
  assert.equal((await route.POST(request)).status, 401);
  assert.equal((await route.PUT(request)).status, 401);
  assert.equal(state.__repairTagBodyReads, 0);
  state.__repairTagAdmin = true;
  assert.equal((await route.POST({ json: async () => { throw new SyntaxError("bad json"); } })).status, 400);
  assert.equal((await route.POST(request)).status, 200);
  assert.equal((await route.PUT(request)).status, 200);
  assert.equal(state.__repairTagReads, 1);
  assert.equal(state.__repairTagWrites, 1);
  assert.equal(state.__repairTagOperator, 42);
});
