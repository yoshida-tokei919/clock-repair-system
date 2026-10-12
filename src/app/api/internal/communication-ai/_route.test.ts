import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { CommunicationAiStaleError } from "@/lib/communication-ai-brief";
import { communicationAiRoute } from "./_route";

function request(token?: string) {
  return new NextRequest("http://localhost/api/internal/communication-ai/context", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ targetType: "CUSTOMER", targetId: 1 }),
  });
}

test("communication AI route fails closed when internal token is unavailable", async () => {
  const previous = process.env.N8N_INTERNAL_TOKEN;
  delete process.env.N8N_INTERNAL_TOKEN;
  try {
    const response = await communicationAiRoute(request(), async () => ({ value: "must not run" }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "unavailable" });
  } finally {
    if (previous === undefined) delete process.env.N8N_INTERNAL_TOKEN;
    else process.env.N8N_INTERNAL_TOKEN = previous;
  }
});

test("communication AI route rejects a wrong token without running the action", async () => {
  const previous = process.env.N8N_INTERNAL_TOKEN;
  process.env.N8N_INTERNAL_TOKEN = "expected";
  let called = false;
  try {
    const response = await communicationAiRoute(request("wrong"), async () => { called = true; return {}; });
    assert.equal(response.status, 401);
    assert.equal(called, false);
    assert.deepEqual(await response.json(), { ok: false, error: "unauthorized" });
  } finally {
    if (previous === undefined) delete process.env.N8N_INTERNAL_TOKEN;
    else process.env.N8N_INTERNAL_TOKEN = previous;
  }
});

test("communication AI route maps stale context to 409 and does not leak details", async () => {
  const previous = process.env.N8N_INTERNAL_TOKEN;
  process.env.N8N_INTERNAL_TOKEN = "expected";
  try {
    const response = await communicationAiRoute(request("expected"), async () => {
      throw new CommunicationAiStaleError("private stale detail");
    });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.deepEqual(payload, { ok: false, error: "stale" });
    assert.equal(JSON.stringify(payload).includes("private stale detail"), false);
  } finally {
    if (previous === undefined) delete process.env.N8N_INTERNAL_TOKEN;
    else process.env.N8N_INTERNAL_TOKEN = previous;
  }
});

test("communication AI route returns only action output after valid authorization", async () => {
  const previous = process.env.N8N_INTERNAL_TOKEN;
  process.env.N8N_INTERNAL_TOKEN = "expected";
  try {
    const response = await communicationAiRoute(request("expected"), async () => ({ inputFingerprint: "a".repeat(64) }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, inputFingerprint: "a".repeat(64) });
  } finally {
    if (previous === undefined) delete process.env.N8N_INTERNAL_TOKEN;
    else process.env.N8N_INTERNAL_TOKEN = previous;
  }
});
