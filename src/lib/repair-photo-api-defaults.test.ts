import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import * as sharing from "./repair-photo-sharing";

function route(path: string, modules: Record<string, unknown>) {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((name: string) => modules[name] ?? {}, exports);
  return exports;
}

test("direct photo registration infers the repair stage and applies safe defaults", async () => {
  let saved: any;
  const db = {
    repair: { findUnique: async () => ({ id: 12, status: "作業中", photoPostingOptOut: false }) },
    photoSharingDefault: { findUnique: async () => ({ customerVisible: true, publicCaseVisible: true, snsVisible: true }) },
    repairPhoto: { create: async ({ data }: any) => { saved = data; return data; } },
  };
  const handler = route("src/app/api/repairs/[id]/photos/route.ts", {
    "@/lib/admin-api-auth": { requireAdminApi: async () => null },
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ status: options?.status ?? 200, body }) } },
    "@/lib/prisma": { prisma: db },
    "@/lib/repair-photo-sharing": sharing,
    "@/lib/r2-repair-photos": {},
  });
  const response = await handler.POST({ json: async () => ({ category: "FRONT", url: "legacy", fileName: "x" }) }, { params: Promise.resolve({ id: "12" }) });
  assert.equal(response.status, 200);
  assert.equal(saved.stage, "WORK");
  assert.equal(saved.customerVisible, false);
  assert.equal(saved.publicCaseVisible, true);
  assert.equal(saved.snsVisible, true);
});

test("upload route infers stage for mobile-style requests and defaults new categories off", async () => {
  let saved: any;
  const db = {
    repair: { findUnique: async () => ({ status: "作業中", photoPostingOptOut: false }) },
    photoSharingDefault: { findUnique: async () => null },
    repairPhoto: { create: async ({ data }: any) => { saved = data; return data; } },
  };
  const handler = route("src/app/api/upload/route.ts", {
    "@/lib/admin-api-auth": { requireAdminApi: async () => null },
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ status: options?.status ?? 200, body }) } },
    "@/lib/prisma": { prisma: db },
    "@/lib/repair-photo-sharing": sharing,
    "@/lib/r2-repair-photos": { uploadRepairPhotoObject: async () => "key", deleteRepairPhotoObject: async () => {} },
    "@/lib/mobile-repair-photo-token": { verifiedMobileRepairPhotoId: () => null },
  });
  const data = new FormData();
  data.set("file", new File([new Uint8Array([1])], "x.jpg", { type: "image/jpeg" }));
  data.set("repairId", "12");
  data.set("category", "MOVEMENT_DISASSEMBLED");
  const response = await handler.POST({ headers: new Headers(), formData: async () => data });
  assert.equal(response.status, 200);
  assert.equal(saved.stage, "WORK");
  assert.equal(saved.category, "MOVEMENT_DISASSEMBLED");
  assert.equal(saved.customerVisible, false);
  assert.equal(saved.publicCaseVisible, false);
  assert.equal(saved.snsVisible, false);
});

test("authenticated admin upload uses explicit WORK stage over persisted RECEPTION", async () => {
  let saved: any;
  const handler = route("src/app/api/upload/route.ts", {
    "@/lib/admin-api-auth": { requireAdminApi: async () => null },
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ status: options?.status ?? 200, body }) } },
    "@/lib/prisma": { prisma: {
      repair: { findUnique: async () => ({ status: "受付", photoPostingOptOut: false }) },
      photoSharingDefault: { findUnique: async () => ({ customerVisible: true, publicCaseVisible: false, snsVisible: false }) },
      repairPhoto: { create: async ({ data }: any) => { saved = data; return data; } },
    } },
    "@/lib/repair-photo-sharing": sharing,
    "@/lib/r2-repair-photos": { uploadRepairPhotoObject: async () => "key", deleteRepairPhotoObject: async () => {} },
    "@/lib/mobile-repair-photo-token": { verifiedMobileRepairPhotoId: () => null },
  });
  const data = new FormData();
  data.set("file", new File([new Uint8Array([1])], "x.jpg", { type: "image/jpeg" }));
  data.set("repairId", "12");
  data.set("category", "FRONT");
  data.set("stage", "WORK");
  const response = await handler.POST({ headers: new Headers(), formData: async () => data });
  assert.equal(response.status, 200);
  assert.equal(saved.stage, "WORK");
  assert.equal(saved.customerVisible, false);
});

test("mobile token upload ignores spoofed RECEPTION stage on WORK repair", async () => {
  let saved: any;
  const handler = route("src/app/api/upload/route.ts", {
    "@/lib/admin-api-auth": { requireAdminApi: async () => ({ status: 401 }) },
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ status: options?.status ?? 200, body }) } },
    "@/lib/prisma": { prisma: {
      repair: { findUnique: async () => ({ status: "作業中", photoPostingOptOut: false }) },
      photoSharingDefault: { findUnique: async () => ({ customerVisible: true, publicCaseVisible: false, snsVisible: false }) },
      repairPhoto: { create: async ({ data }: any) => { saved = data; return data; } },
    } },
    "@/lib/repair-photo-sharing": sharing,
    "@/lib/r2-repair-photos": { uploadRepairPhotoObject: async () => "key", deleteRepairPhotoObject: async () => {} },
    "@/lib/mobile-repair-photo-token": { verifiedMobileRepairPhotoId: (token: string) => token === "valid" ? 12 : null },
  });
  const data = new FormData();
  data.set("file", new File([new Uint8Array([1])], "x.jpg", { type: "image/jpeg" }));
  data.set("repairId", "12");
  data.set("category", "FRONT");
  data.set("stage", "RECEPTION");
  const response = await handler.POST({ headers: new Headers({ "x-mobile-photo-token": "valid" }), formData: async () => data });
  assert.equal(response.status, 200);
  assert.equal(saved.stage, "WORK");
  assert.equal(saved.customerVisible, false);
});
