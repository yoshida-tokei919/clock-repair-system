import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

type AuditResponse = { body: unknown; status: number };

test("audit route authenticates before reading input and maps success and errors", async () => {
  let session: { user: { id: string } } | null = null;
  let jsonReads = 0;
  let domainReads = 0;
  let body: unknown = { storageLocationId: 1, repairIds: [] };
  const failure = (error: { status?: number }) => ({ status: error.status ?? 500,
    message: error.status === 404 ? "棚卸し場所が見つかりません。" :
      error.status === 409 ? "棚卸し場所は使用できません。" : "棚卸し結果を確認できませんでした。" });
  const modules: Record<string, unknown> = {
    "@/lib/admin-api-auth": { requireAdminApi: async () => session?.user ? null :
      { body: { error: "認証が必要です。" }, status: 401 } },
    "next-auth": { getServerSession: async () => session },
    "next/server": { NextResponse: { json: (value: unknown, options?: { status: number }): AuditResponse =>
      ({ body: value, status: options?.status ?? 200 }) } },
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": { prisma: {} },
    "@/lib/storage-location-audit": {
      parseStorageLocationAudit: (value: any) => {
        if (!Array.isArray(value.repairIds)) throw Error("invalid");
        return value;
      },
      auditStorageLocation: async (_db: unknown, input: { storageLocationId: number }) => {
        domainReads++;
        if (input.storageLocationId >= 97) throw { status: input.storageLocationId === 97 ? undefined :
          input.storageLocationId === 98 ? 409 : 404 };
        return { counts: { missing: 0 } };
      },
      storageLocationAuditFailure: failure,
    },
  };
  const path = resolve("src/app/api/storage-locations/audit/route.ts");
  const source = readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022 } }).outputText;
  const route = new Module(path);
  route.filename = path;
  route.require = ((id: string) => {
    if (!(id in modules)) throw Error(`Unexpected import: ${id}`);
    return modules[id];
  }) as typeof route.require;
  (route as Module & { _compile(code: string, filename: string): void })._compile(compiled, path);
  const target = route.exports as { dynamic: string; POST: (request: { json: () => Promise<unknown> }) => Promise<AuditResponse> };
  const request = { json: async () => { jsonReads++; return body; } };
  assert.equal(target.dynamic, "force-dynamic");
  assert.equal((await target.POST(request)).status, 401);
  assert.deepEqual([jsonReads, domainReads], [0, 0]);
  session = { user: { id: "1" } };
  body = {};
  assert.equal((await target.POST(request)).status, 400);
  assert.equal(domainReads, 0);
  body = { storageLocationId: 1, repairIds: [] };
  assert.deepEqual(await target.POST(request), { body: { counts: { missing: 0 } }, status: 200 });
  for (const [storageLocationId, status, message] of [
    [99, 404, "棚卸し場所が見つかりません。"], [98, 409, "棚卸し場所は使用できません。"],
    [97, 500, "棚卸し結果を確認できませんでした。"],
  ] as const) {
    body = { storageLocationId, repairIds: [] };
    assert.deepEqual(await target.POST(request), { body: { error: message }, status });
  }
});
