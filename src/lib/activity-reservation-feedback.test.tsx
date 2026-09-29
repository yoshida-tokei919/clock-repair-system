import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrismaClient, WorkTimeActivityType } from "@prisma/client";
import { ActivityReservationFeedback, loadSchedulerSettingsWithFeedback } from "../components/settings/SchedulerSettingsEditor";
import { ACTIVITY_TYPES } from "./scheduler-settings-domain";
import { loadActivityReservationFeedback, summarizeActivityReservationFeedback } from "./activity-reservation-feedback";

const now = new Date("2026-09-29T12:00:00Z");
const settings = ACTIVITY_TYPES.map(activityType => ({ activityType, manualStandardMinutes: activityType === "ESTIMATE" ? 20 : null,
  dailyReservedMinutes: activityType === "INQUIRY" ? 60 : 0, learningMode: "MANUAL" as const,
  aggregationMethod: "MEAN" as const, lookbackMonths: 3, fallbackLookbackMonths: 6,
  minimumSamples: 3 }));
const globalSetting = { repairLearningMode: "AUTO" as const, repairLearningMinimumSamples: 3,
  repairFullSampleThreshold: 10, repairEarlyAggregationMethod: "MEDIAN" as const,
  defaultAggregationMethod: "MEAN" as const, repairLookbackMonths: 6, repairOutlierMethod: "NONE" as const };
function session(activityType: WorkTimeActivityType, start: string, end: string | null, invalidatedAt: Date | null = null) {
  return { activityType, startedAt: new Date(start), endedAt: end === null ? null : new Date(end), invalidatedAt };
}
const row = (activityType: WorkTimeActivityType, sessions: ReturnType<typeof session>[]) =>
  summarizeActivityReservationFeedback(settings, sessions, now).find(item => item.activityType === activityType)!;

test("REPAIR, open, invalidated, reversed and future sessions are excluded; activity types remain separate", () => {
  const sessions = [
    session("REPAIR", "2026-09-28T00:00:00Z", "2026-09-28T01:00:00Z"),
    session("INQUIRY", "2026-09-28T00:00:00Z", "2026-09-28T00:10:00Z"),
    session("INQUIRY", "2026-09-28T00:00:00Z", null),
    session("INQUIRY", "2026-09-28T00:00:00Z", "2026-09-28T00:30:00Z", now),
    session("INQUIRY", "2026-09-28T01:00:00Z", "2026-09-28T00:00:00Z"),
    session("INQUIRY", "2026-09-30T00:00:00Z", "2026-09-30T00:10:00Z"),
    session("ADMIN", "2026-09-28T00:00:00Z", "2026-09-28T00:20:00Z"),
  ];
  const rows = summarizeActivityReservationFeedback(settings, sessions, now);
  assert.equal(rows.length, 8);
  assert.equal(rows.some(item => item.activityType === "REPAIR"), false);
  assert.equal(rows.find(item => item.activityType === "INQUIRY")!.sessions.sampleCount, 1);
  assert.equal(rows.find(item => item.activityType === "ADMIN")!.daily.mean, 20);
  assert.equal(rows.find(item => item.activityType === "ESTIMATE")!.daily.sampleCount, 0);
  assert.equal(rows.find(item => item.activityType === "ESTIMATE")!.daily.meanDeltaFromReservation, null);
});

test("Tokyo midnight splits daily totals, observed days alone form the denominator", () => {
  const actual = row("INQUIRY", [
    session("INQUIRY", "2026-09-28T14:50:00Z", "2026-09-28T15:10:00Z"),
    session("INQUIRY", "2026-09-28T15:20:00Z", "2026-09-28T15:40:00Z"),
  ]);
  assert.equal(actual.daily.observedDayCount, 2);
  assert.equal(actual.daily.min, 10);
  assert.equal(actual.daily.max, 30);
  assert.equal(actual.daily.mean, 20);
  assert.equal(actual.daily.meanDeltaFromReservation, -40);
  assert.equal(actual.sessions.sampleCount, 2);
  assert.equal(actual.sessions.median, 20);
  assert.equal(actual.current.dailyReservedMinutes, 60);
  assert.equal(settings.find(item => item.activityType === "INQUIRY")!.dailyReservedMinutes, 60);
});

test("daily and per-session median, mean, nearest-rank P80 and range use raw duration", () => {
  const sessions = [1, 2, 4, 6, 10].map((minutes, index) => {
    const start = new Date(Date.UTC(2026, 8, 20 + index, 0));
    return session("SHIPPING", start.toISOString(), new Date(start.getTime() + minutes * 60_000).toISOString());
  });
  const actual = row("SHIPPING", sessions);
  for (const stats of [actual.daily, actual.sessions]) {
    assert.equal(stats.sampleCount, 5);
    assert.equal(stats.median, 4);
    assert.equal(stats.mean, 4.6);
    assert.equal(stats.p80, 6);
    assert.equal(stats.min, 1);
    assert.equal(stats.max, 10);
  }
  assert.equal(actual.current.dailyReservedMinutes, 0);
  assert.equal(actual.current.manualStandardMinutes, null);
  assert.equal(actual.daily.meanDeltaFromReservation, 4.6);
});

test("configured primary lookback excludes older completions and retains second precision", () => {
  const actual = row("OTHER", [
    session("OTHER", "2026-05-01T00:00:00Z", "2026-05-01T00:30:00Z"),
    session("OTHER", "2026-09-28T00:00:00Z", "2026-09-28T00:00:30Z"),
  ]);
  assert.equal(actual.sessions.sampleCount, 1);
  assert.equal(actual.sessions.mean, 0.5);
  assert.equal(actual.daily.mean, 0.5);
  assert.equal(actual.lookback.since, "2026-06-29T12:00:00.000Z");
});

test("existing Task190 learning is reused only for its three supported activities", () => {
  const full = [1, 2, 3].map(id => ({ ...session("ESTIMATE", "2026-09-28T00:00:00Z",
    "2026-09-28T00:20:00Z"), repairId: id, inquiryId: null, orderRequestId: null,
    contextSchemaVersion: 1, contextSnapshot: null }));
  const rows = summarizeActivityReservationFeedback(settings.map(setting => setting.activityType === "ESTIMATE"
    ? { ...setting, learningMode: "AUTO" as const } : setting), full, now, globalSetting, full);
  assert.equal(rows.find(item => item.activityType === "ESTIMATE")!.learning?.adoptedMinutes, 20);
  assert.equal(rows.find(item => item.activityType === "ESTIMATE")!.learning?.usableSampleCount, 3);
  assert.equal(rows.find(item => item.activityType === "INTAKE")!.learning, null);
  assert.equal(rows.find(item => item.activityType === "ESTIMATE")!.sessions.sampleCount, 3);
  assert.equal(rows.find(item => item.activityType === "ESTIMATE")!.daily.observedDayCount, 1);
});

test("loader bulk reads and never writes", async () => {
  const calls: string[] = [];
  const read = (name: string, value: unknown) => new Proxy({}, { get(_target, key) {
    if (key !== "findUnique" && key !== "findMany") throw new Error(`unexpected ${name}.${String(key)}`);
    return async (args: { where?: unknown }) => { calls.push(name);
      if (name === "sessions") assert.deepEqual(args.where, { activityType: { in: [...ACTIVITY_TYPES] },
        endedAt: { not: null }, invalidatedAt: null });
      return value; };
  } });
  const db = { schedulerSetting: read("global", globalSetting),
    schedulerActivitySetting: read("activities", settings), workTimeSession: read("sessions", []) } as unknown as PrismaClient;
  const result = await loadActivityReservationFeedback(db, now);
  assert.equal(result.length, 8);
  assert.deepEqual(calls.sort(), ["activities", "global", "sessions"]);
});

test("feedback UI distinguishes saved settings and daily versus session values", () => {
  const html = renderToStaticMarkup(createElement(ActivityReservationFeedback,
    { row: row("INQUIRY", [session("INQUIRY", "2026-09-28T00:00:00Z", "2026-09-28T00:30:00Z")]) }));
  assert.match(html, /保存済み現在設定/);
  assert.match(html, /日別合計（予約枠との比較）/);
  assert.match(html, /1セッション（期間内に終了、全区間）/);
  assert.match(html, /日次予約 60分/);
  assert.match(html, /手動標準 —/);
  assert.match(html, /自動更新はしません/);
  const differentStatsHtml = renderToStaticMarkup(createElement(ActivityReservationFeedback,
    { row: row("SHIPPING", [1, 2, 4, 6, 10].map((duration, index) => {
      const start = new Date(Date.UTC(2026, 8, 20 + index));
      return session("SHIPPING", start.toISOString(), new Date(start.getTime() + duration * 60_000).toISOString());
    })) }));
  assert.match(differentStatsHtml, /4分<\/td><td class="whitespace-nowrap p-2">4.6分（予約比 \+4.6分）<\/td><td class="p-2">6分/);
});

test("feedback fetch failure leaves scheduler settings available for editing", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    return url.endsWith("/feedback") || url.endsWith("/capacity-feedback")
      ? { ok: false, json: async () => ({ error: "failed" }) }
      : { ok: true, json: async () => ({ setting: { id: 1 }, activities: settings, standards: [], masters: {} }) };
  }) as typeof fetch;
  try {
    const result = await loadSchedulerSettingsWithFeedback();
    assert.equal(result.data.setting.id, 1);
    assert.equal(result.data.activities.length, 8);
    assert.equal(result.feedback, null);
    assert.equal(result.capacityFeedback, null);
    assert.deepEqual(calls.sort(), ["/api/settings/scheduler", "/api/settings/scheduler/activities/feedback",
      "/api/settings/scheduler/capacity-feedback"].sort());
  } finally { globalThis.fetch = originalFetch; }
});

test("capacity feedback failure does not prevent scheduler settings or activity feedback from loading", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => url.endsWith("/capacity-feedback")
    ? { ok: false, json: async () => ({ error: "failed" }) }
    : { ok: true, json: async () => url.endsWith("/activities/feedback") ? []
      : { setting: { id: 1 }, activities: settings, standards: [], masters: {} } }) as typeof fetch;
  try {
    const result = await loadSchedulerSettingsWithFeedback();
    assert.equal(result.data.setting.id, 1);
    assert.equal(result.data.activities.length, 8);
    assert.deepEqual(result.feedback, []);
    assert.equal(result.capacityFeedback, null);
  } finally { globalThis.fetch = originalFetch; }
});
