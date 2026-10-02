import assert from "node:assert/strict";
import test from "node:test";
import { createSelectedShipment, ShipmentResultUncertainError } from "./shipment-confirmation";

test("shipment confirmation posts only selected repair ids and confirmed true", async () => {
  let calls = 0;
  const fetcher = (async (url: string, init: RequestInit) => {
    calls += 1;
    assert.equal(url, "/api/shipments");
    assert.equal(init.method, "POST");
    assert.deepEqual(init.headers, { "Content-Type": "application/json" });
    assert.equal(init.cache, "no-store");
    assert.deepEqual(JSON.parse(init.body as string), { repairIds: [12, 13], confirmed: true });
    return Response.json({ id: 42 }, { status: 201 });
  }) as typeof fetch;
  assert.equal(await createSelectedShipment([12, 13], fetcher), 42);
  assert.equal(calls, 1);
});

test("shipment confirmation uses valid server errors and safe status fallbacks", async () => {
  for (const [status, body, expected] of [
    [400, { error: "対象が不正です。" }, "対象が不正です。"],
    [404, { error: { detail: "unsafe" } }, "修理案件が見つかりません。"],
    [409, { error: "返送先が一致しません。" }, "返送先が一致しません。"],
    [401, { error: null }, "認証が必要です。"],
    [500, {}, "発送を作成できませんでした。"],
  ] as const) {
    const fetcher = (async () => Response.json(body, { status })) as typeof fetch;
    await assert.rejects(createSelectedShipment([12], fetcher), error =>
      error instanceof Error && error.message.includes(expected));
  }
});

test("shipment confirmation requires a positive id in the successful response", async () => {
  for (const body of [{ id: 0 }, { id: "42" }, [], null]) {
    const fetcher = (async () => Response.json(body, { status: 201 })) as typeof fetch;
    await assert.rejects(createSelectedShipment([12], fetcher), error =>
      error instanceof ShipmentResultUncertainError && error.message.includes("作成結果を確認できませんでした"));
  }
});

test("shipment confirmation treats a network failure as an unknown creation result", async () => {
  const fetcher = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
  await assert.rejects(createSelectedShipment([12], fetcher), error =>
    error instanceof ShipmentResultUncertainError && error.message.includes("再送せず管理者に確認してください"));
});

test("shipment confirmation treats unreadable successful JSON as an unknown creation result", async () => {
  const fetcher = (async () => new Response("not JSON", { status: 201 })) as typeof fetch;
  await assert.rejects(createSelectedShipment([12], fetcher), error =>
    error instanceof ShipmentResultUncertainError && error.message.includes("再送せず管理者に確認してください"));
});
