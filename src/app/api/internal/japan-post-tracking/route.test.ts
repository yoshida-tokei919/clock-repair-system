import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { japanPostTrackingRoute } from "./_route";

const request = (token?: string) => new NextRequest("http://localhost/api/internal/japan-post-tracking", {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

test("poll route fails closed on missing and invalid N8N token", async () => {
  const previous = process.env.N8N_INTERNAL_TOKEN;
  try {
    delete process.env.N8N_INTERNAL_TOKEN;
    let called = false;
    const poll = async () => { called = true; return []; };
    const unavailable = await japanPostTrackingRoute(request(), poll);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("cache-control"), "no-store");
    process.env.N8N_INTERNAL_TOKEN = "synthetic-secret";
    const unauthorized = await japanPostTrackingRoute(request("wrong"), poll);
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get("cache-control"), "no-store");
    assert.equal(called, false);
    const authorized = await japanPostTrackingRoute(request("synthetic-secret"), poll);
    assert.equal(authorized.status, 200);
    assert.equal(authorized.headers.get("cache-control"), "no-store");
    assert.deepEqual(await authorized.json(), { results: [] });
    assert.equal(called, true);
  } finally {
    if (previous === undefined) delete process.env.N8N_INTERNAL_TOKEN;
    else process.env.N8N_INTERNAL_TOKEN = previous;
  }
});
