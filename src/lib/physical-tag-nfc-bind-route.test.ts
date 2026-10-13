import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("bind route authenticates before JSON parsing and mutation", async () => {
  const globals = globalThis as typeof globalThis & { __bindSession: unknown; __bindAdmin: unknown;
    __bindReads: number; __bindParses: number; __bindWrites: number; __bindJson: number };
  const modules: Record<string, string> = {
    "next-auth": "export const getServerSession = async () => globalThis.__bindSession;",
    "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = { admin: { findUnique: async () => { globalThis.__bindReads++; return globalThis.__bindAdmin; } } };",
    "@/lib/physical-tag-nfc-bind": [
      "export const parsePhysicalTagNfcBind = body => { globalThis.__bindParses++; return body; };",
      "export const bindPhysicalTagNfcUid = async () => { globalThis.__bindWrites++; return { nfcUid: '0433' }; };",
      "export const physicalTagNfcBindFailure = () => ({ status: 500, message: 'failed' });",
    ].join("\n"),
  };
  const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as Record<string, any> };
  const localRequire = (specifier: string) => {
    assert.ok(modules[specifier]);
    const stub = { exports: {} as Record<string, any> };
    new Function("exports", "module", compile(modules[specifier]))(stub.exports, stub);
    return stub.exports;
  };
  new Function("exports", "require", "module", compile(readFileSync("src/app/api/physical-tags/bind-nfc/route.ts", "utf8")))(
    module.exports, localRequire, module);
  globals.__bindSession = null; globals.__bindAdmin = null;
  globals.__bindReads = globals.__bindParses = globals.__bindWrites = globals.__bindJson = 0;
  const request = { json: async () => { globals.__bindJson++; return input; } };
  const input = { physicalTagId: 5, repairId: 10, nfcUid: "0433" };
  assert.equal(module.exports.dynamic, "force-dynamic");
  assert.equal((await module.exports.POST(request)).status, 401);
  assert.deepEqual([globals.__bindReads, globals.__bindJson, globals.__bindParses, globals.__bindWrites], [0, 0, 0, 0]);
  globals.__bindSession = { user: { email: "admin@example.test" } };
  assert.equal((await module.exports.POST(request)).status, 401);
  assert.deepEqual([globals.__bindReads, globals.__bindJson, globals.__bindParses, globals.__bindWrites], [1, 0, 0, 0]);
  globals.__bindAdmin = { id: 42 };
  assert.equal((await module.exports.POST(request)).status, 200);
  assert.deepEqual([globals.__bindReads, globals.__bindJson, globals.__bindParses, globals.__bindWrites], [2, 1, 1, 1]);
});
