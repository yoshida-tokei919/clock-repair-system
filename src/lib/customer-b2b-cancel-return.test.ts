import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

function loadRoute(modules: Record<string, unknown>) {
  const source = readFileSync("src/app/api/customer/repairs/[id]/cancel-return/route.ts", "utf8");
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((name: string) => {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  }, exports);
  return exports;
}

const nextResponse = { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) };

test("B2B shared cancellation applies zero-yen cancellation return and records partner audit", async () => {
  const calls: any[] = [];
  const tx = {
    repair: { findUnique: async () => ({ id: 7, customer: { type: "business" } }) },
    repairCustomerMessage: { create: async (query: unknown) => calls.push(["message", query]) },
  };
  const prisma = { $transaction: async (callback: (client: any) => unknown) => callback(tx) };
  const route = loadRoute({
    "next/server": { NextResponse: nextResponse },
    "@/lib/prisma": { prisma },
    "@/lib/repair-return": { applyRepairReturn: async (...args: unknown[]) => { calls.push(["return", ...args]); return { ok: true }; } },
    "../_workflow": { findRepairIdByPublicToken: async () => 7 },
  });

  const response = await route.POST(new Request("http://localhost"), { params: Promise.resolve({ id: "token" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0].slice(1), [tx, 7, null, { outcome: "キャンセル返却", charge: 0, shipping: 0 }]);
  assert.deepEqual(calls[1], ["message", { data: { repairId: 7, body: "取引先が共有ページからキャンセル・返却を選択しました。", senderType: "partner" } }]);
});

test("B2C token cannot use the B2B shared cancellation endpoint", async () => {
  let returnCalls = 0;
  const tx = {
    repair: { findUnique: async () => ({ id: 7, customer: { type: "individual" } }) },
    repairCustomerMessage: { create: async () => { throw new Error("message mutation reached"); } },
  };
  const prisma = { $transaction: async (callback: (client: any) => unknown) => callback(tx) };
  const route = loadRoute({
    "next/server": { NextResponse: nextResponse },
    "@/lib/prisma": { prisma },
    "@/lib/repair-return": { applyRepairReturn: async () => { returnCalls++; } },
    "../_workflow": { findRepairIdByPublicToken: async () => 7 },
  });

  const response = await route.POST(new Request("http://localhost"), { params: Promise.resolve({ id: "token" }) });
  assert.equal(response.status, 403);
  assert.equal(returnCalls, 0);
});
