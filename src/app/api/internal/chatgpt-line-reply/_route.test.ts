import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { parseApproval, parseStatus, parseTarget } from "@/lib/chatgpt-line-reply-bridge";
import { bridgeRoute } from "./_route";

function request(body: string, token?: string) {
  return new NextRequest("http://localhost/api/internal/chatgpt-line-reply/context", {
    method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body,
  });
}

test("internal bridge auth rejects missing server token and unauthorized callers before parsing", async () => {
  const original = process.env.N8N_INTERNAL_TOKEN;
  try {
    delete process.env.N8N_INTERNAL_TOKEN;
    assert.equal((await bridgeRoute(request("{"), async () => null)).status, 503);
    process.env.N8N_INTERNAL_TOKEN = "test-only-token";
    assert.equal((await bridgeRoute(request("{"), async () => null)).status, 401);
    assert.equal((await bridgeRoute(request("{", "wrong"), async () => null)).status, 401);
  } finally {
    if (original === undefined) delete process.env.N8N_INTERNAL_TOKEN;
    else process.env.N8N_INTERNAL_TOKEN = original;
  }
});

test("internal bridge parses strictly and masks unexpected failures", async () => {
  const original = process.env.N8N_INTERNAL_TOKEN;
  process.env.N8N_INTERNAL_TOKEN = "test-only-token";
  try {
    assert.equal((await bridgeRoute(request("{", "test-only-token"), async () => null)).status, 400);
    const malformed = await bridgeRoute(request(JSON.stringify({ targetType: "CUSTOMER", targetId: 1 }), "test-only-token"), async (body) => parseTarget(body));
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { ok: false, error: "invalid_input" });
    assert.equal((await bridgeRoute(request(JSON.stringify({ targetType: "INQUIRY", targetId: 1, text: "x", approvalFingerprint: "bad" }), "test-only-token"), async (body) => parseApproval(body))).status, 400);
    assert.equal((await bridgeRoute(request(JSON.stringify({ targetType: "INQUIRY", targetId: 1, approvalId: 0 }), "test-only-token"), async (body) => parseStatus(body))).status, 400);
    const failure = await bridgeRoute(request("{}", "test-only-token"), async () => { throw new Error("secret-bot lastError"); });
    assert.equal(failure.status, 500);
    assert.equal(JSON.stringify(await failure.json()).includes("secret-bot"), false);
  } finally {
    if (original === undefined) delete process.env.N8N_INTERNAL_TOKEN;
    else process.env.N8N_INTERNAL_TOKEN = original;
  }
});
