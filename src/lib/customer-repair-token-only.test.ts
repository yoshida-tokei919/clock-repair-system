import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const routeRoot = "src/app/api/customer/repairs/[id]";

function loadModule(path: string, modules: Record<string, unknown>) {
  const source = readFileSync(path, "utf8");
  const code = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((name: string) => {
    assert.ok(name in modules, `Unexpected import: ${name}`);
    return modules[name];
  }, exports);
  return exports;
}

test("customer Repair lookup uses exact publicToken, including a literal numeric token", async () => {
  const rows = [
    { id: 1, publicToken: "opaque-token" },
    { id: 2, publicToken: "other-token" },
  ];
  const lookups: unknown[] = [];
  const prisma = {
    repair: {
      findUnique: async (query: { where: { publicToken: string } }) => {
        lookups.push(query);
        return rows.find(row => row.publicToken === query.where.publicToken) ?? null;
      },
    },
  };
  const workflow = loadModule(`${routeRoot}/_workflow.ts`, { "@/lib/prisma": { prisma } });

  assert.equal(await workflow.findRepairIdByPublicToken("1"), null);
  assert.equal(await workflow.findRepairIdByPublicToken("opaque-token"), 1);
  assert.equal(await workflow.findRepairIdByPublicToken(" "), null);
  rows[1].publicToken = "1";
  assert.equal(await workflow.findRepairIdByPublicToken("1"), 2);
  assert.deepEqual(lookups, [
    { where: { publicToken: "1" }, select: { id: true } },
    { where: { publicToken: "opaque-token" }, select: { id: true } },
    { where: { publicToken: "1" }, select: { id: true } },
  ]);
});

for (const [routeName, body] of [
  ["approve", {}],
  ["reject", { body: "Reason" }],
  ["messages", { body: "Message" }],
  ["return-address", {}],
  ["photo-posting-opt-out", { photoPostingOptOut: true }],
] as const) {
  test(`${routeName} stops before mutation when path is a numeric Repair id`, async () => {
    const queries: unknown[] = [];
    let mutations = 0;
    const mutation = () => { mutations++; throw new Error("Mutation reached"); };
    const prisma = {
      repair: {
        findUnique: async (query: { where: { publicToken: string } }) => {
          queries.push(query);
          return query.where.publicToken === "opaque-token" ? { id: 1 } : null;
        },
        updateMany: mutation,
      },
      $queryRaw: mutation,
      $transaction: mutation,
    };
    const workflow = loadModule(`${routeRoot}/_workflow.ts`, { "@/lib/prisma": { prisma } });
    const route = loadModule(`${routeRoot}/${routeName}/route.ts`, {
      "next/server": {
        NextResponse: {
          json: (responseBody: unknown, options?: { status?: number }) => ({
            body: responseBody,
            status: options?.status ?? 200,
          }),
        },
      },
      "@/lib/prisma": { prisma },
      "@/lib/return-address": {},
      "@/lib/repair-part-allocation": {},
      "@/lib/repair-photo-posting-opt-out": {},
      "../_workflow": workflow,
    });
    const request = new Request(`http://localhost/api/customer/repairs/1/${routeName}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await route.POST(request, { params: Promise.resolve({ id: "1" }) });
    assert.equal(response.status, 404);
    assert.deepEqual(queries, [{ where: { publicToken: "1" }, select: { id: true } }]);
    assert.equal(mutations, 0);
  });
}
