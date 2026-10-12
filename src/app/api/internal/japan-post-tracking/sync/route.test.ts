import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { japanPostTrackingSyncRoute } from "./_route";

const url = "http://localhost/api/internal/japan-post-tracking/sync";
const request = (token?: string) => new NextRequest(url, {
  method: "POST",
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/octet-stream" },
  body: Buffer.from("csv"),
});

test("sync route requires internal token before any mutation path", async () => {
  const previous = process.env.N8N_INTERNAL_TOKEN;
  try {
    delete process.env.N8N_INTERNAL_TOKEN;
    let calls = 0;
    const sync = async (_db: unknown, bytes: Buffer) => {
      calls++; assert.equal(bytes.toString(), "csv"); return { tracking: [], notices: [], repairs: [] };
    };
    assert.equal((await japanPostTrackingSyncRoute(request(), sync as never)).status, 503);
    process.env.N8N_INTERNAL_TOKEN = "synthetic-secret";
    assert.equal((await japanPostTrackingSyncRoute(request("wrong"), sync as never)).status, 401);
    assert.equal(calls, 0);
    const ok = await japanPostTrackingSyncRoute(request("synthetic-secret"), sync as never);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.deepEqual(await ok.json(), { results: [], notices: [], repairs: [] });
    assert.equal(calls, 1);
  } finally {
    if (previous === undefined) delete process.env.N8N_INTERNAL_TOKEN;
    else process.env.N8N_INTERNAL_TOKEN = previous;
  }
});
