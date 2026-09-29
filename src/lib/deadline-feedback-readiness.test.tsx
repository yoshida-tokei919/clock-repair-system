import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrismaClient } from "@prisma/client";
import DeadlineFeedbackReadiness from "../components/settings/DeadlineFeedbackReadiness";
import { loadDeadlineFeedbackReadiness } from "./deadline-feedback-readiness";

test("deadline readiness counts only stored fields and reads saved current buffers", async () => {
  const records = [
    { deliveryDateExpected: new Date("2026-09-10"), deliveryDateActual: new Date("2026-09-12") },
    { deliveryDateExpected: new Date("2026-09-11"), deliveryDateActual: null },
    { deliveryDateExpected: null, deliveryDateActual: new Date("2026-09-13") },
    { deliveryDateExpected: null, deliveryDateActual: null },
  ];
  const readFilters: unknown[] = [];
  const db = {
    schedulerSetting: { findUnique: async () => ({ runningTestDays: 0, reworkBufferDays: null, shippingBufferDays: 2 }) },
    repair: { count: async (args?: { where?: { deliveryDateExpected?: { not: null }; deliveryDateActual?: { not: null } } }) => {
      readFilters.push(args?.where ?? null);
      return records.filter(row => (!args?.where?.deliveryDateExpected || row.deliveryDateExpected !== null)
        && (!args?.where?.deliveryDateActual || row.deliveryDateActual !== null)).length;
    } },
  } as unknown as PrismaClient;
  const result = await loadDeadlineFeedbackReadiness(db);
  assert.deepEqual(result, { currentBuffers: { runningTestDays: 0, reworkBufferDays: null, shippingBufferDays: 2 },
    repairCounts: { total: 4, expectedDeliveryDate: 2, actualDeliveryDate: 2, bothDeliveryDates: 1 } });
  assert.deepEqual(readFilters, [null, { deliveryDateExpected: { not: null } },
    { deliveryDateActual: { not: null } },
    { deliveryDateExpected: { not: null }, deliveryDateActual: { not: null } }]);
  const html = renderToStaticMarkup(<DeadlineFeedbackReadiness readiness={result} />);
  assert.match(html, /ランニングテスト 0暦日、再調整余裕 未設定、発送余裕 2暦日/);
  assert.match(html, /両方あり 1件/);
  assert.match(html, /遅延件数や納期遵守率ではありません/);
  assert.match(html, /過去の設定履歴はない/);
  assert.doesNotMatch(html, /推奨日数|設定を適用/);
});
