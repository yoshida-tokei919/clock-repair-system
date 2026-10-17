import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { createMobileRepairPhotoToken, verifiedMobileRepairPhotoId, verifyMobileRepairPhotoToken } from "./mobile-repair-photo-token";

test("mobile photo token is scoped to one repair and expires", () => {
  const previous = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "test-only-mobile-photo-secret";
  try {
    const now = 1_800_000_000_000;
    const token = createMobileRepairPhotoToken(4, now);
    assert.equal(verifiedMobileRepairPhotoId(token, now), 4);
    assert.equal(verifyMobileRepairPhotoToken(token, 4, now), true);
    assert.equal(verifyMobileRepairPhotoToken(token, 5, now), false);
    assert.equal(verifiedMobileRepairPhotoId(token, now + 30 * 60 * 1000), null);
    assert.equal(verifyMobileRepairPhotoToken(token, 4, now + 30 * 60 * 1000), false);
    const signatureStart = token.lastIndexOf(".") + 1;
    const tampered = `${token.slice(0, signatureStart)}${token[signatureStart] === "A" ? "B" : "A"}${token.slice(signatureStart + 1)}`;
    assert.equal(verifiedMobileRepairPhotoId(tampered, now), null);
    assert.equal(verifyMobileRepairPhotoToken(tampered, 4, now), false);
    assert.equal(verifiedMobileRepairPhotoId(token.replace(/^4\./, "9007199254740992."), now), null);
    assert.equal(verifyMobileRepairPhotoToken(token, 4, now - 1000), false);
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = previous;
  }
});

test("upload accepts a matching token or Admin session, and rejects other tokens before business access", async () => {
  const previous = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "test-only-mobile-photo-secret";
  try {
    const source = readFileSync("src/app/api/upload/route.ts", "utf8");
    const code = transpileModule(source, {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    }).outputText;
    let admin = false;
    let parsed = false;
    const unauthorized = { status: 401 };
    const modules: Record<string, unknown> = {
      "@/lib/admin-api-auth": { requireAdminApi: async () => admin ? null : unauthorized },
      "@/lib/mobile-repair-photo-token": { verifiedMobileRepairPhotoId },
      "@/lib/prisma": { prisma: new Proxy({}, { get: () => { throw new Error("business access"); } }) },
      "@/lib/repair-photo-sharing": { repairPhotoCategory: () => "OTHER", repairPhotoStage: () => "BEFORE" },
      "@/lib/r2-repair-photos": {},
      "next/server": { NextResponse: { json: (_body: unknown, options: { status?: number } = {}) => ({ status: options.status ?? 200 }) } },
    };
    const exports: Record<string, any> = {};
    new Function("require", "exports", code)((name: string) => modules[name] ?? {}, exports);
    const request = (token: string | null, repairId = "4") => ({
      headers: new Headers(token ? { "x-mobile-photo-token": token } : {}),
      formData: async () => { parsed = true; return new Map([["repairId", repairId]]); },
    });
    assert.equal((await exports.POST(request(null))).status, 401);
    assert.equal(parsed, false);
    const token = createMobileRepairPhotoToken(4);
    assert.equal((await exports.POST(request(token))).status, 400);
    assert.equal(parsed, true);
    parsed = false;
    assert.equal((await exports.POST(request(token, "5"))).status, 401);
    assert.equal(parsed, true);
    parsed = false;
    assert.equal((await exports.POST(request("invalid"))).status, 401);
    assert.equal(parsed, false);
    const signatureStart = token.lastIndexOf(".") + 1;
    const tampered = `${token.slice(0, signatureStart)}${token[signatureStart] === "A" ? "B" : "A"}${token.slice(signatureStart + 1)}`;
    assert.equal((await exports.POST(request(tampered))).status, 401);
    assert.equal(parsed, false);
    assert.equal((await exports.POST(request(createMobileRepairPhotoToken(4, Date.now() - 31 * 60 * 1000)))).status, 401);
    assert.equal(parsed, false);
    admin = true;
    assert.equal((await exports.POST(request("invalid"))).status, 400);
    assert.equal(parsed, true);
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = previous;
  }
});
