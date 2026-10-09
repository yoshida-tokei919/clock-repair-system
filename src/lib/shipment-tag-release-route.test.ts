import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const state = globalThis as typeof globalThis & {
  __releaseSession: any; __releaseAdmin: boolean; __releaseReads: number; __releaseWrites: number;
  __releaseJsonReads: number; __releaseOperator: number | null;
  __releaseAdminReads: number; __releaseParses: number;
};

function loadRoute() {
  const modules: Record<string, string> = {
    "next-auth": "export const getServerSession = async () => globalThis.__releaseSession;",
    "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = { admin: { findUnique: async () => { globalThis.__releaseAdminReads++; return globalThis.__releaseAdmin ? { id: 42 } : null; } } };",
    "@/lib/shipment": "export const shipmentId = value => { if (value !== '7') throw Error('bad id'); return 7; }; export const shipmentFailure = () => ({ status: 500, message: 'failed' });",
    "@/lib/shipment-tag-release": [
      "export const parseReleaseRequest = body => { globalThis.__releaseParses++; if (body.confirmed !== true) throw Error('confirmation required'); return body; };",
      "export const previewShipmentTagRelease = async () => { globalThis.__releaseReads++; return { shipmentId: 7 }; };",
      "export const releaseShipmentTags = async (db, id, body, operator) => { globalThis.__releaseWrites++; globalThis.__releaseOperator = operator; return { shipmentId: id, releasedCount: body.targets.length }; };",
      "export const shipmentTagReleaseFailure = error => ({ status: 500, message: error.message });",
    ].join("\n"),
  };
  function load(path: string): Record<string, any> {
    const source = modules[path] ?? readFileSync(path, "utf8");
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const module = { exports: {} as Record<string, any> };
    new Function("exports", "require", "module", code)(module.exports, load, module);
    return module.exports;
  }
  return load("src/app/api/shipments/[id]/physical-tag-release/route.ts");
}

test("release preview and POST authenticate first, then require confirmation and actual Admin ID", async () => {
  const route = await loadRoute();
  state.__releaseSession = null; state.__releaseAdmin = true;
  state.__releaseReads = 0; state.__releaseWrites = 0; state.__releaseJsonReads = 0;
  state.__releaseAdminReads = 0; state.__releaseParses = 0;
  const context = { params: Promise.resolve({ id: "7" }) };
  let body: any = { confirmed: true, targets: [{ repairId: 10, assignmentId: 100, physicalTagId: 1 }] };
  const request = { json: async () => { state.__releaseJsonReads++; return body; } };
  assert.equal(route.dynamic, "force-dynamic");
  assert.equal((await route.GET(request, context)).status, 401);
  assert.equal((await route.POST(request, context)).status, 401);
  assert.equal(state.__releaseJsonReads, 0);
  assert.equal(state.__releaseAdminReads, 0);
  assert.equal(state.__releaseParses, 0);
  state.__releaseSession = { user: { email: "admin@example.test" } };
  state.__releaseAdmin = false;
  assert.equal((await route.GET(request, context)).status, 401);
  assert.equal((await route.POST(request, context)).status, 401);
  assert.equal(state.__releaseJsonReads, 0);
  assert.equal(state.__releaseAdminReads, 2);
  assert.equal(state.__releaseParses, 0);
  state.__releaseAdmin = true;
  assert.equal((await route.GET(request, context)).status, 200);
  assert.equal(state.__releaseReads, 1);
  assert.equal(state.__releaseWrites, 0);
  body = { targets: [] };
  assert.equal((await route.POST(request, context)).status, 400);
  assert.equal(state.__releaseWrites, 0);
  body = { confirmed: true, targets: [{ repairId: 10, assignmentId: 100, physicalTagId: 1 }] };
  assert.equal((await route.POST(request, context)).status, 200);
  assert.equal(state.__releaseJsonReads, 2);
  assert.equal(state.__releaseParses, 2);
  assert.equal(state.__releaseWrites, 1);
  assert.equal(state.__releaseOperator, 42);
});
