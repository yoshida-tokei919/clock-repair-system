import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("all lifecycle routes authenticate before body parsing or DB access", async () => {
  const modules: Record<string, string> = {
    "next-auth": "export const getServerSession = async () => globalThis.__tagSession;",
    "next/server": "export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };",
    "@/lib/auth": "export const authOptions = {};",
    "@/lib/prisma": "export const prisma = { admin: { findUnique: async args => { globalThis.__tagAdminReads++; globalThis.__tagAdminArgs = args; return { id: 42 }; } } };",
    "@/lib/physical-tag-lifecycle": [
      "export const parsePhysicalTagAction = (action, body) => { globalThis.__tagParses++; return { action, ...body }; };",
      "export const applyPhysicalTagAction = async (db, input, adminId) => { globalThis.__tagActions++; return { input, adminId }; };",
      "export const physicalTagLifecycleFailure = () => ({ status: 500, message: 'failed' });",
    ].join("\n"),
  };
  function loadModule(path: string): Record<string, any> {
    const source = path === "@/lib/physical-tag-lifecycle-route"
      ? readFileSync("src/lib/physical-tag-lifecycle-route.ts", "utf8")
      : modules[path] ?? readFileSync(path, "utf8");
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        esModuleInterop: true },
    }).outputText;
    const module = { exports: {} as Record<string, any> };
    const localRequire = (specifier: string) => loadModule(specifier);
    new Function("exports", "require", "module", code)(module.exports, localRequire, module);
    return module.exports;
  }
  const globals = globalThis as typeof globalThis & {
    __tagSession: unknown; __tagAdminReads: number; __tagAdminArgs: unknown;
    __tagParses: number; __tagActions: number; __tagJsonReads: number;
  };
  for (const action of ["assign", "release", "replace"]) {
    const route = loadModule(`src/app/api/physical-tags/${action}/route.ts`);
    globals.__tagSession = null;
    globals.__tagAdminReads = 0;
    globals.__tagParses = 0;
    globals.__tagActions = 0;
    globals.__tagJsonReads = 0;
    const request = { json: async () => {
      globals.__tagJsonReads++;
      return { repairId: 10 };
    } };
    assert.equal(route.dynamic, "force-dynamic");
    assert.deepEqual(await route.POST(request), { body: { error: "認証が必要です。" }, status: 401 });
    assert.equal(globals.__tagJsonReads, 0);
    assert.equal(globals.__tagAdminReads, 0);
    assert.equal(globals.__tagParses, 0);
    assert.equal(globals.__tagActions, 0);
    globals.__tagSession = { user: { email: "admin@example.test" } };
    assert.deepEqual(await route.POST(request), {
      body: { input: { action, repairId: 10 }, adminId: 42 }, status: 200,
    });
    assert.deepEqual(globals.__tagAdminArgs, {
      where: { email: "admin@example.test" }, select: { id: true },
    });
    assert.equal(globals.__tagJsonReads, 1);
    assert.equal(globals.__tagAdminReads, 1);
    assert.equal(globals.__tagActions, 1);
  }
});
