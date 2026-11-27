import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { isCustomerRepairPhotoShown } from "./customer-repair-photos";

test("photo URL refuses hidden, wrong-stage and another repair while serving shown photos", async () => {
  const source = readFileSync("src/app/(private)/customer/repairs/[token]/photos/[photoId]/route.ts", "utf8");
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const photos = [
    { id: 1, stage: "RECEPTION", category: "FRONT", customerVisible: true },
    { id: 2, stage: "WORK", category: "FAULT_DETAIL", customerVisible: true },
    { id: 3, stage: "RECEPTION", category: "BACK", customerVisible: false },
    { id: 4, stage: "RECEPTION", category: "FRONT", customerVisible: true },
  ];
  let signed = 0;
  let customerType = "individual";
  const db = {
    repairPhoto: { findUnique: async ({ where }: any) => photos.some(item => item.id === where.id)
      ? { repairId: where.id === 4 ? 200 : 100, storageKey: `repairs/100/123456/00000000-0000-0000-0000-000000000001.jpg` } : null },
    estimateDocument: { findUnique: async () => null },
    repair: { findUnique: async () => ({ status: "受付", customer: { type: customerType }, photos: photos.filter(item => item.id !== 4 && item.customerVisible) }) },
  };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (_: unknown, options: { status: number }) => ({ status: options.status }), redirect: () => ({ status: 307 }) } },
    "@/lib/prisma": { prisma: db },
    "@/lib/customer-repair-share": { resolveCustomerRepairShareScope: async () => ({ repairIds: [100] }) },
    "@/lib/customer-repair-photos": { isCustomerRepairPhotoShown },
    "@/lib/r2-repair-photos": { isR2RepairPhotoKey: () => true, getRepairPhotoSignedReadUrl: async () => { signed++; return "https://example.invalid/signed"; } },
  };
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((name: string) => modules[name], exports);
  const get = (id: number) => exports.GET({} as Request, { params: Promise.resolve({ token: "token", photoId: String(id) }) });
  assert.equal((await get(1)).status, 307);
  assert.equal((await get(2)).status, 404);
  assert.equal((await get(3)).status, 404);
  assert.equal((await get(4)).status, 404);
  customerType = "business";
  assert.equal((await get(1)).status, 404);
  assert.equal(signed, 1);
});
