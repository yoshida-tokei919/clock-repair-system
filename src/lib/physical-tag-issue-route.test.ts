import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("issue route authenticates before body parsing or DB access", async () => {
  const modules: Record<string, string> = {
    "next-auth": "export const getServerSession = async () => globalThis.__issueSession;",
    "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = { admin: { findUnique: async args => { globalThis.__issueDbReads++; return { id: 42 }; } } };",
    "@/lib/physical-tag-issue": [
      "export const parsePhysicalTagIssue = body => { globalThis.__issueParses++; return body; };",
      "export const issuePhysicalTag = async () => { globalThis.__issueWrites++; return { shortCode: 'PT-000001' }; };",
      "export const physicalTagIssueFailure = () => ({ status: 500, message: 'failed' });",
    ].join("\n"),
  };
  const source = readFileSync("src/app/api/physical-tags/issue/route.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as Record<string, any> };
  const localRequire = (specifier: string) => {
    const text = modules[specifier];
    assert.ok(text, `unexpected import: ${specifier}`);
    const compiled = ts.transpileModule(text, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const stub = { exports: {} as Record<string, any> };
    new Function("exports", "module", compiled)(stub.exports, stub);
    return stub.exports;
  };
  new Function("exports", "require", "module", code)(module.exports, localRequire, module);
  const globals = globalThis as typeof globalThis & {
    __issueSession: unknown; __issueDbReads: number; __issueParses: number;
    __issueWrites: number; __issueJsonReads: number;
  };
  globals.__issueSession = null;
  globals.__issueDbReads = globals.__issueParses = globals.__issueWrites = globals.__issueJsonReads = 0;
  const request = { json: async () => { globals.__issueJsonReads++; return { repairId: 10 }; } };
  assert.equal(module.exports.dynamic, "force-dynamic");
  assert.deepEqual(await module.exports.POST(request), { body: { error: "認証が必要です。" }, status: 401 });
  assert.equal(globals.__issueJsonReads, 0);
  assert.equal(globals.__issueDbReads, 0);
  assert.equal(globals.__issueParses, 0);
  assert.equal(globals.__issueWrites, 0);
  globals.__issueSession = { user: { email: "admin@example.test" } };
  assert.deepEqual(await module.exports.POST(request), { body: { shortCode: "PT-000001" }, status: 200 });
  assert.equal(globals.__issueJsonReads, 1);
  assert.equal(globals.__issueDbReads, 1);
  assert.equal(globals.__issueWrites, 1);
});
