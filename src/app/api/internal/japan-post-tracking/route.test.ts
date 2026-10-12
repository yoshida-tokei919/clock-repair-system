import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { japanPostTrackingRoute } from "./_route";

const url = "http://localhost/api/internal/japan-post-tracking";
function request(token?: string, body = Buffer.from("csv"), contentType = "application/octet-stream") {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": contentType,
    },
    body,
  });
}

test("CSV preview route authenticates before reading and remains no-store", async () => {
  const previous = process.env.N8N_INTERNAL_TOKEN;
  try {
    delete process.env.N8N_INTERNAL_TOKEN;
    let calls = 0;
    const preview = async (_db: unknown, bytes: Buffer) => {
      calls++;
      assert.deepEqual(bytes, Buffer.from("csv"));
      return [];
    };
    const unavailable = await japanPostTrackingRoute(request(), preview as never);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("cache-control"), "no-store");

    process.env.N8N_INTERNAL_TOKEN = "synthetic-secret";
    assert.equal((await japanPostTrackingRoute(request("wrong"), preview as never)).status, 401);
    assert.equal(calls, 0);

    const ok = await japanPostTrackingRoute(request("synthetic-secret"), preview as never);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { results: [] });
    assert.equal(calls, 1);
  } finally {
    if (previous === undefined) delete process.env.N8N_INTERNAL_TOKEN;
    else process.env.N8N_INTERNAL_TOKEN = previous;
  }
});

test("CSV preview route rejects unsupported media type and oversized declared body", async () => {
  const previous = process.env.N8N_INTERNAL_TOKEN;
  process.env.N8N_INTERNAL_TOKEN = "synthetic-secret";
  try {
    let calls = 0;
    const preview = async () => { calls++; return []; };
    assert.equal((await japanPostTrackingRoute(
      request("synthetic-secret", Buffer.from("csv"), "application/json"), preview as never,
    )).status, 415);

    const oversized = request("synthetic-secret");
    oversized.headers.set("content-length", String(256 * 1024 + 1));
    assert.equal((await japanPostTrackingRoute(oversized, preview as never)).status, 413);
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env.N8N_INTERNAL_TOKEN;
    else process.env.N8N_INTERNAL_TOKEN = previous;
  }
});
