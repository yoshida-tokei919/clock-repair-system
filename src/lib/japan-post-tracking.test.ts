import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  allowedTrackingUrl, fetchJapanPostTracking, JAPAN_POST_POLL_CAP, JAPAN_POST_POLL_STATUSES,
  parseJapanPostTracking, pollJapanPostShipments,
} from "./japan-post-tracking";

const number = "123456789012"; // Synthetic fixture only.
const inquiry = (echoed = number) => `<table summary="配達状況詳細">
  <tr><th>お問い合わせ番号</th><th>商品種別</th></tr>
  <tr><td>${echoed}</td><td>合成ゆうパック</td></tr></table>`;
const page = (statuses: string[], echoed = number) => `<html><body>
  ${inquiry(echoed)}
  <table summary="履歴情報">
  <tr><th rowspan="2">状態発生日</th><th rowspan="2">配送履歴</th>
    <th rowspan="2">詳細</th><th>取扱局</th><th rowspan="2">県名等</th></tr>
  <tr><th>郵便番号</th></tr>
  ${statuses.map((status, i) => `<tr><td rowspan="2">10月${i + 1}日 09:00</td>
    <td rowspan="2">${status}</td><td rowspan="2">合成詳細${i + 1}</td>
    <td>合成郵便局</td><td rowspan="2">東京都</td></tr>
    <tr><td>100-0001</td></tr>`).join("")}
  </table></body></html>`;

test("official descriptions and live aliases classify the latest history row", () => {
  for (const [status, state] of [
    ["引受", "SHIPPED"], ["到着", "IN_TRANSIT"], ["中継", "IN_TRANSIT"],
    ["持出中", "OUT_FOR_DELIVERY"],
    ["お届け先にお届け済み", "DELIVERED"], ["窓口渡し", "DELIVERED"],
    ["不在持戻", "EXCEPTION"], ["返還完了", "EXCEPTION"],
  ]) {
    const result = parseJapanPostTracking(page(["引受", status]), number);
    assert.equal(result.kind, "FOUND");
    if (result.kind === "FOUND") {
      assert.equal(result.state, state);
      assert.deepEqual(result.history[1], { dateTimeText: "10月2日 09:00", statusText: status,
        officeText: "合成郵便局", otherFields: ["合成詳細2", "東京都", "100-0001"] });
    }
  }
});

test("verified two-row events retain oldest-to-newest history order", () => {
  const result = parseJapanPostTracking(page(["引受", "到着", "お届け先にお届け済み"]), number);
  assert.equal(result.kind, "FOUND");
  if (result.kind === "FOUND") {
    assert.equal(result.state, "DELIVERED");
    assert.deepEqual(result.history.map(event => event.statusText), ["引受", "到着", "お届け先にお届け済み"]);
  }
});

test("missing, unknown, mismatched and malformed data fail closed", () => {
  assert.deepEqual(parseJapanPostTracking(page(["引受"], "999999999999"), number),
    { kind: "ERROR", code: "TRACKING_MISMATCH" });
  const unknown = parseJapanPostTracking(page(["未確認の状態"]), number);
  assert.equal(unknown.kind, "ERROR");
  if (unknown.kind === "ERROR") {
    assert.equal(unknown.code, "UNKNOWN_STATUS");
    assert.equal(unknown.history?.[0].statusText, "未確認の状態");
  }
  assert.equal(parseJapanPostTracking(page(["未出荷"]), number).kind, "ERROR");
  assert.deepEqual(parseJapanPostTracking(page([]), number), { kind: "ERROR", code: "NO_HISTORY" });
  assert.deepEqual(parseJapanPostTracking(`${inquiry()}<p>該当するデータはありません</p>`, number),
    { kind: "ERROR", code: "NOT_FOUND" });
  assert.deepEqual(parseJapanPostTracking(`${inquiry()}<p>unexpected</p>`, number),
    { kind: "ERROR", code: "CONTRACT_CHANGED" });
  assert.deepEqual(parseJapanPostTracking(page(["引受"]).replace("<th rowspan=\"2\">配送履歴</th>", "<th rowspan=\"2\">不明</th>"), number),
    { kind: "ERROR", code: "CONTRACT_CHANGED" });
  assert.deepEqual(parseJapanPostTracking(page(["引受"]) + inquiry(), number),
    { kind: "ERROR", code: "CONTRACT_CHANGED" });
  assert.deepEqual(parseJapanPostTracking(page(["引受"]).replace(inquiry(),
    `<table><tr><th>お問い合わせ番号</th><td>${number}</td></tr></table>`), number),
    { kind: "ERROR", code: "CONTRACT_CHANGED" });
  assert.deepEqual(parseJapanPostTracking(page(["引受"]).replace('summary="配達状況詳細"', 'summary="other"'), number),
    { kind: "ERROR", code: "CONTRACT_CHANGED" });
  for (const malformed of [
    page(["引受"]).replace('<td rowspan="2">引受</td>', "<td>引受</td>"),
    page(["引受"]).replace("<tr><td>100-0001</td></tr>", ""),
    page(["引受"]).replace("<tr><td>100-0001</td></tr>", "<tr><td>100-0001</td><td>extra</td></tr>"),
    page(["引受"]).replace('<th rowspan="2">県名等</th>', "<th>県名等</th>"),
    page(["引受"]).replace("<th>取扱局</th>", '<th colspan="2">取扱局</th>'),
  ]) assert.deepEqual(parseJapanPostTracking(malformed, number), { kind: "ERROR", code: "CONTRACT_CHANGED" });
});

test("only exact HTTPS official tracking URLs are allowed", () => {
  for (const url of [
    "http://trackings.post.japanpost.jp/services/srv/search",
    "https://evil.example/services/srv/search",
    "https://trackings.post.japanpost.jp.evil.example/services/srv/search",
    "https://trackings.post.japanpost.jp/services/srv/search-evil",
    "https://trackings.post.japanpost.jp/other",
  ]) assert.equal(allowedTrackingUrl(new URL(url)), false);
  assert.equal(allowedTrackingUrl(new URL("https://trackings.post.japanpost.jp/services/srv/search/detail")), true);
});

test("GET is single-request, bounded and rejects upstream and redirects", async () => {
  let calls = 0;
  const ok = (async (url: URL | RequestInfo) => {
    calls++;
    assert.equal(new URL(String(url)).searchParams.get("requestNo1"), number);
    return new Response(page(["引受"]), { status: 200,
      headers: { "content-type": "text/html; charset=utf-8" } });
  }) as typeof fetch;
  // A browser/Node Response has no URL when constructed locally. Supply the verified final URL.
  const fetcher = (async (url: URL | RequestInfo) => {
    const response = await ok(url);
    Object.defineProperty(response, "url", { value: String(url) });
    return response;
  }) as typeof fetch;
  assert.equal((await fetchJapanPostTracking(number, fetcher)).kind, "FOUND");
  assert.equal(calls, 1);
  assert.deepEqual(await fetchJapanPostTracking("bad", fetcher), { kind: "ERROR", code: "INVALID_NUMBER" });
  assert.equal(calls, 1);
  const upstream = (async (url: URL | RequestInfo) => {
    const response = new Response("error", { status: 503 });
    Object.defineProperty(response, "url", { value: String(url) });
    return response;
  }) as typeof fetch;
  assert.deepEqual(await fetchJapanPostTracking(number, upstream), { kind: "ERROR", code: "UPSTREAM_ERROR" });
  const redirect = (async (url: URL | RequestInfo) => {
    const response = new Response(null, { status: 302, headers: { location: "https://evil.example/" } });
    Object.defineProperty(response, "url", { value: String(url) });
    return response;
  }) as typeof fetch;
  assert.deepEqual(await fetchJapanPostTracking(number, redirect), { kind: "ERROR", code: "UNSAFE_REDIRECT" });
});

test("poll selects only allowed Shipment statuses and performs no DB mutation", async () => {
  const rows = [{ id: 4, trackingNumber: number }, { id: 5, trackingNumber: "bad" },
    { id: 6, trackingNumber: number }];
  const methods = { findMany: async (query: unknown) => {
    assert.deepEqual(query, { where: { direction: "OUTBOUND", carrierCode: "JAPAN_POST",
      AND: [{ trackingNumber: { not: null } }, { trackingNumber: { not: "" } }],
      status: { in: [...JAPAN_POST_POLL_STATUSES] } },
      select: { id: true, trackingNumber: true }, orderBy: { id: "asc" }, take: JAPAN_POST_POLL_CAP });
    assert.deepEqual(JAPAN_POST_POLL_STATUSES, ["LABEL_ISSUED", "AWAITING_ACCEPTANCE", "SHIPPED",
      "IN_TRANSIT", "OUT_FOR_DELIVERY", "EXCEPTION"]);
    return rows;
  } };
  const db = { shipment: new Proxy(methods, { get(target, key) {
    if (key === "findMany") return target.findMany;
    throw new Error(`Unexpected DB operation: ${String(key)}`);
  } }) } as unknown as Pick<PrismaClient, "shipment">;
  let fetchCalls = 0;
  const fetcher = (async (url: URL | RequestInfo) => {
    fetchCalls++;
    const response = new Response(page(["引受"]), { headers: { "content-type": "text/html" } });
    Object.defineProperty(response, "url", { value: String(url) });
    return response;
  }) as typeof fetch;
  const results = await pollJapanPostShipments(db, fetcher);
  assert.deepEqual(results.map(row => [row.shipmentId, row.result.kind]), [[4, "FOUND"], [5, "ERROR"], [6, "FOUND"]]);
  assert.equal(fetchCalls, 1);
});
