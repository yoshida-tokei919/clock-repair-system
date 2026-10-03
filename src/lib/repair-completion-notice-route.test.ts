import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

test("completion notice API keeps Admin auth and server-rebuilds the reviewed delivery message", async () => {
  class InputError extends Error {}
  class NotFoundError extends Error {}
  class UnavailableError extends Error {}
  class OutboxError extends Error {}
  class TokenNotFoundError extends Error {}
  const state = {
    session: null as unknown, admin: null as unknown, reads: 0, writes: 0,
    writeError: null as Error | null, createdBody: null as unknown,
  };
  const modules: Record<string, unknown> = {
    "next-auth": { getServerSession: async () => state.session },
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": { prisma: { admin: { findUnique: async () => state.admin } } },
    "@/lib/customer-share-url": { buildCustomerShareUrl: (path: string) => `https://example.test${path}` },
    "@/lib/line-manager-send-outbox": { LineManagerSendOutboxError: OutboxError },
    "@/lib/repair-public-token": {
      RepairPublicTokenNotFoundError: TokenNotFoundError,
      getRepairPublicToken: async () => "token-12345678901234567890",
    },
    "@/lib/repair-completion-notice-message": {
      parseRepairCompletionNoticeSubmission: (value: any) => {
        if (value?.confirmed !== true || typeof value?.introText !== "string" || typeof value?.reviewedText !== "string") throw new Error("bad input");
        return { introText: value.introText, reviewedText: value.reviewedText };
      },
      buildRepairCompletionNoticeText: () => "FINAL",
    },
    "@/lib/repair-completion-notice": {
      RepairCompletionNoticeInputError: InputError,
      RepairCompletionNoticeNotFoundError: NotFoundError,
      RepairCompletionNoticeUnavailableError: UnavailableError,
      getRepairCompletionNotice: async () => {
        state.reads++;
        return { eligible: true, hasVerifiedLineDestination: true, notice: null };
      },
      createRepairCompletionNotice: async (_db: unknown, _id: number, body: unknown) => {
        state.writes++;
        state.createdBody = body;
        if (state.writeError) throw state.writeError;
        return { id: 1 };
      },
    },
  };
  const source = readFileSync("src/app/api/repairs/[id]/completion-notice/route.ts", "utf8");
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const route: Record<string, any> = {};
  new Function("require", "exports", code)((name: string) => modules[name], route);
  const context = { params: Promise.resolve({ id: "10" }) };
  const request = (reviewedText = "FINAL") => new Request("http://localhost/api/repairs/10/completion-notice", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirmed: true, introText: "完了", reviewedText }),
  });

  assert.equal((await route.GET(new Request("http://localhost"), context)).status, 401);
  assert.equal((await route.POST(request(), context)).status, 401);
  state.session = { user: { email: "admin@example.com" } };
  assert.equal((await route.POST(request(), context)).status, 401);
  assert.equal(state.reads, 0); assert.equal(state.writes, 0);

  state.admin = { id: 1 };
  assert.equal((await route.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "10x" }) })).status, 400);
  assert.equal((await route.POST(new Request("http://localhost", { method: "POST", body: "{}" }), context)).status, 400);
  assert.equal((await route.POST(new Request("http://localhost", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{",
  }), context)).status, 400);
  assert.equal((await route.POST(request("STALE"), context)).status, 409);
  assert.equal(state.writes, 0);

  assert.equal((await route.GET(new Request("http://localhost"), context)).status, 200);
  assert.equal((await route.POST(request(), context)).status, 200);
  assert.deepEqual(state.createdBody, { confirmed: true, text: "FINAL" });
  assert.equal(state.reads, 3); assert.equal(state.writes, 1);

  state.writeError = new OutboxError("conflict");
  assert.equal((await route.POST(request(), context)).status, 409);
});
