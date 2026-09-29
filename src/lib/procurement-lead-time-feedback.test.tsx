import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrismaClient } from "@prisma/client";
import { ProcurementLeadTimeFeedbackTable } from "../components/settings/ProcurementSettingsEditor";
import { loadProcurementLeadTimeFeedback, summarizeProcurementLeadTimes } from "./procurement-lead-time-feedback";

const suppliers = [
  { id: 1, name: "仕入先A", manualProcessingLeadDays: 2 },
  { id: 2, name: "仕入先B", manualProcessingLeadDays: null },
];
const methods = [
  { id: 10, name: "航空便", manualTransitLeadDays: 3 },
  { id: 20, name: "船便", manualTransitLeadDays: 0 },
];
function order(orderedAt: string | null, receivedAt: string | null, supplierId: number | null = 1,
  procurementShippingMethodId: number | null = 10, status = "received") {
  return { supplierId, procurementShippingMethodId, orderedAt: orderedAt ? new Date(orderedAt) : null,
    receivedAt: receivedAt ? new Date(receivedAt) : null, status };
}

test("Tokyo calendar days match Task191 across midnight, excluding missing and reversed actuals", () => {
  const rows = summarizeProcurementLeadTimes([
    order("2026-09-27T14:59:00Z", "2026-09-27T15:00:00Z"),
    order("2026-09-27T14:59:00Z", null),
    order(null, "2026-09-28T15:00:00Z"),
    order("2026-09-28T00:00:00Z", "2026-09-27T23:59:00Z"),
    order("2026-09-27T14:59:00Z", "2026-10-01T15:00:00Z", 1, 10, "cancelled"),
  ], suppliers, methods);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sampleCount, 1);
  assert.equal(rows[0].medianDays, 1);
  assert.equal(rows[0].configuredTotalDays, 5);
  assert.equal(rows[0].medianDeltaDays, -4);
});

test("exact pairs and unknown dimensions remain separate", () => {
  const rows = summarizeProcurementLeadTimes([
    order("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z"),
    order("2026-09-01T00:00:00Z", "2026-09-03T00:00:00Z", 1, 20),
    order("2026-09-01T00:00:00Z", "2026-09-04T00:00:00Z", null, 10),
    order("2026-09-01T00:00:00Z", "2026-09-05T00:00:00Z", 1, null),
  ], suppliers, methods);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(row => [row.supplierId, row.shippingMethodId, row.medianDays])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    [[1, 10, 1], [1, 20, 2], [null, 10, 3], [1, null, 4]]
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  for (const row of rows.filter(row => row.supplierId === null || row.shippingMethodId === null))
    assert.equal(row.configuredTotalDays, null);
});

test("raw median, mean, nearest-rank P80, and range include small samples", () => {
  const values = [1, 2, 4, 6, 10];
  const rows = summarizeProcurementLeadTimes(values.map(days => order("2026-09-01T00:00:00Z",
    new Date(Date.parse("2026-09-01T00:00:00Z") + days * 86400000).toISOString())), suppliers, methods);
  assert.equal(rows[0].sampleCount, 5);
  assert.equal(rows[0].medianDays, 4);
  assert.equal(rows[0].meanDays, 4.6);
  assert.equal(rows[0].p80Days, 6);
  assert.equal(rows[0].minDays, 1);
  assert.equal(rows[0].maxDays, 10);
  assert.equal(rows[0].p80DeltaDays, 1);
  const even = summarizeProcurementLeadTimes([1, 2, 4, 6].map(days => order("2026-09-01T00:00:00Z",
    new Date(Date.parse("2026-09-01T00:00:00Z") + days * 86400000).toISOString())), suppliers, methods);
  assert.equal(even[0].medianDays, 3);
  assert.equal(even[0].p80Days, 6);
});

test("Task191 requires both configured components, while explicit zero is valid", () => {
  const rows = summarizeProcurementLeadTimes([
    order("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z", 2, 10),
    order("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z", 1, 20),
  ], suppliers, methods);
  assert.equal(rows.find(row => row.supplierId === 2)?.configuredTotalDays, null);
  assert.equal(rows.find(row => row.shippingMethodId === 20)?.configuredTotalDays, 2);
  assert.equal(rows.find(row => row.supplierId === 2)?.meanDeltaDays, null);
});

test("loader bulk-reads only completed actuals and settings", async () => {
  const calls: string[] = [];
  const db = {
    orderRequest: { findMany: async (args: unknown) => { calls.push("orders");
      assert.deepEqual((args as { where: unknown }).where, {
        orderedAt: { not: null }, receivedAt: { not: null }, status: { not: "cancelled" },
      });
      return [order("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z")]; } },
    supplier: { findMany: async () => { calls.push("suppliers"); return [
      { id: 1, name: "仕入先A", leadTimeSetting: { manualProcessingLeadDays: 2 } },
    ]; } },
    procurementShippingMethod: { findMany: async () => { calls.push("methods"); return methods; } },
  } as unknown as PrismaClient;
  const rows = await loadProcurementLeadTimeFeedback(db);
  assert.deepEqual(calls.sort(), ["methods", "orders", "suppliers"]);
  assert.equal(rows[0].configuredTotalDays, 5);
});

test("UI states the total cannot be split into supplier processing and transit", () => {
  const rows = summarizeProcurementLeadTimes([order("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z")],
    suppliers, methods);
  const html = renderToStaticMarkup(createElement(ProcurementLeadTimeFeedbackTable, { rows }));
  assert.match(html, /総リードタイムだけ/);
  assert.match(html, /個別に分解・推定することはできません/);
  assert.match(html, /設定比/);
  assert.doesNotMatch(html, /採用|適用/);
});
