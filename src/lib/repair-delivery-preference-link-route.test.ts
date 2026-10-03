import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

test("delivery preference link preparation is authenticated, explicit, and eligibility-gated", async () => {
  class CompletionNotFound extends Error {}
  class TokenNotFound extends Error {}
  const state: any = {
    session: null, admin: null, tokenWrites: 0,
    completion: { eligible: true, hasVerifiedLineDestination: true, notice: null },
  };
  const modules: Record<string, unknown> = {
    "next-auth": { getServerSession: async () => state.session },
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/auth": { authOptions: {} },
    "@/lib/customer-share-url": { buildCustomerShareUrl: (path: string) => `https://app.test${path}` },
    "@/lib/prisma": { prisma: { admin: { findUnique: async () => state.admin } } },
    "@/lib/repair-completion-notice": {
      RepairCompletionNoticeNotFoundError: CompletionNotFound,
      getRepairCompletionNotice: async () => state.completion,
    },
    "@/lib/repair-public-token": {
      RepairPublicTokenNotFoundError: TokenNotFound,
      ensureRepairPublicToken: async () => { state.tokenWrites++; return "token_12345678901234567890"; },
    },
  };
  const source = readFileSync("src/app/api/repairs/[id]/delivery-preference-link/route.ts", "utf8");
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const route: Record<string, any> = {};
  new Function("require", "exports", code)((name: string) => modules[name], route);
  const request = new Request("https://app.test/api/repairs/10/delivery-preference-link", { method: "POST" });
  const context = { params: Promise.resolve({ id: "10" }) };

  assert.equal((await route.POST(request, context)).status, 401);
  state.session = { user: { email: "admin@example.com" } };
  assert.equal((await route.POST(request, context)).status, 401);
  state.admin = { id: 1 };
  state.completion = { eligible: false, hasVerifiedLineDestination: true, notice: null };
  assert.equal((await route.POST(request, context)).status, 409);
  state.completion = { eligible: true, hasVerifiedLineDestination: true, notice: { id: 1 } };
  assert.equal((await route.POST(request, context)).status, 409);
  assert.equal(state.tokenWrites, 0);
  state.completion = { eligible: true, hasVerifiedLineDestination: true, notice: null };
  const ok = await route.POST(request, context);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.url, "https://app.test/customer/delivery/token_12345678901234567890");
  assert.equal(state.tokenWrites, 1);
});
