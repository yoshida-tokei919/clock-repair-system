import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrismaClient, WorkTimeActivityType } from "@prisma/client";
import CapacityObservationFeedback from "../components/settings/CapacityObservationFeedback";
import { loadCapacityObservationFeedback, summarizeCapacityObservations } from "./capacity-observation-feedback";
import { parseWorkDate } from "./work-calendar";

const now = new Date("2026-09-30T03:00:00Z");
const session = (activityType: WorkTimeActivityType, start: string, end: string | null,
  invalidatedAt: Date | null = null) => ({ activityType, startedAt: new Date(start),
    endedAt: end === null ? null : new Date(end), invalidatedAt });
const settings = { dailyScheduleReviewMinutes: 30, activityReservedMinutes: 60 };

test("completed Tokyo dates separate repair and non-repair seconds, including midnight split", () => {
  const actual = summarizeCapacityObservations({ now, settings,
    workCalendar: [{ workDate: parseWorkDate("2026-09-29"), availableMinutes: 60, note: null }],
    sessions: [
      session("REPAIR", "2026-09-28T14:50:00Z", "2026-09-28T15:10:00Z"),
      session("REPAIR", "2026-09-28T15:20:00Z", "2026-09-28T15:40:00Z"),
      session("INQUIRY", "2026-09-28T15:00:00Z", "2026-09-28T15:00:30Z"),
      session("ADMIN", "2026-09-28T00:00:00Z", "2026-09-28T00:05:00Z"),
    ] });
  assert.equal(actual.observedDayCount, 2);
  assert.deepEqual(actual.days.map(day => day.date), ["2026-09-28", "2026-09-29"]);
  assert.deepEqual(actual.days.map(day => [day.measuredRepairMinutes, day.measuredNonRepairMinutes,
    day.totalMeasuredMinutes]), [[10, 5, 15], [30, 0.5, 30.5]]);
  assert.equal(actual.days[0].grossCapacityMinutes, 480);
  assert.equal(actual.days[0].scheduleReviewReservedMinutes, 30);
  assert.equal(actual.days[0].activityReservedMinutes, 60);
  assert.equal(actual.days[0].effectiveRepairCapacityMinutes, 390);
  assert.equal(actual.days[1].grossCapacityMinutes, 60);
  assert.equal(actual.days[1].effectiveRepairCapacityMinutes, 0);
  assert.equal(actual.days[1].overReservedMinutes, 30);
  assert.equal(actual.observedDayMeans.repair, 20);
  assert.equal(actual.observedDayMeans.nonRepair, 2.75);
  assert.equal(actual.observedDayMeans.total, 22.75);
  assert.equal(actual.firstObservedDate, "2026-09-28");
  assert.equal(actual.lastObservedDate, "2026-09-29");
});

test("open, invalidated, reversed, invalid and future sessions are excluded; no-session days are absent", () => {
  const actual = summarizeCapacityObservations({ now, settings, workCalendar: [], sessions: [
    session("REPAIR", "2026-09-28T00:00:00Z", null),
    session("REPAIR", "2026-09-28T00:00:00Z", "2026-09-28T01:00:00Z", now),
    session("REPAIR", "2026-09-28T01:00:00Z", "2026-09-28T00:00:00Z"),
    session("REPAIR", "invalid", "2026-09-28T01:00:00Z"),
    session("REPAIR", "2026-09-28T00:00:00Z", "invalid"),
    session("REPAIR", "2026-09-29T14:00:00Z", "2026-09-30T04:00:00Z"),
    session("REPAIR", "2026-09-30T00:00:00Z", "2026-09-30T00:30:00Z"),
    session("REPAIR", "2026-09-30T04:00:00Z", "2026-09-30T05:00:00Z"),
  ] });
  assert.equal(actual.days.length, 0);
  assert.equal(actual.observedDayMeans.total, null);
  assert.equal(actual.firstObservedDate, null);
  assert.equal(actual.lastObservedDate, null);
});

test("zero-duration sessions do not create observed days, and today is excluded", () => {
  const actual = summarizeCapacityObservations({ now, settings, workCalendar: [], sessions: [
    session("REPAIR", "2026-09-28T00:00:00Z", "2026-09-28T00:00:00Z"),
    session("ADMIN", "2026-09-29T15:00:00Z", "2026-09-29T15:00:00Z"),
  ] });
  assert.deepEqual(actual.days, []);
  assert.equal(actual.observedDayCount, 0);
  assert.deepEqual(actual.observedDayMeans, { repair: null, nonRepair: null, total: null });
});

test("all history contributes, including yesterday's portion of a session ending today", () => {
  const actual = summarizeCapacityObservations({ now, settings, workCalendar: [], sessions: [
    session("REPAIR", "2026-07-01T00:00:00Z", "2026-07-01T01:00:00Z"),
    session("ADMIN", "2026-09-29T14:55:00Z", "2026-09-29T15:05:00Z"),
    session("REPAIR", "2026-09-29T15:00:00Z", "2026-09-29T15:10:00Z"),
  ] });
  assert.equal(actual.firstObservedDate, "2026-07-01");
  assert.equal(actual.lastObservedDate, "2026-09-29");
  assert.deepEqual(actual.days.map(day => [day.date, day.measuredRepairMinutes,
    day.measuredNonRepairMinutes]), [["2026-07-01", 60, 0], ["2026-09-29", 0, 5]]);
  assert.equal(actual.observedDayMeans.total, 32.5);
});

test("loader performs four bulk reads and no writes", async () => {
  const calls: string[] = [];
  const read = (name: string, result: unknown) => new Proxy({}, { get(_target, method) {
    if (method !== "findUnique" && method !== "findMany") throw new Error(`unexpected ${name}.${String(method)}`);
    return async (args: { where?: Record<string, unknown> }) => { calls.push(name);
      if (name === "sessions") {
        assert.deepEqual(args.where?.invalidatedAt, null);
        assert.deepEqual(args.where?.startedAt, { lt: new Date("2026-09-29T15:00:00Z") });
        assert.deepEqual(args.where?.endedAt, { not: null, lte: now });
      }
      if (name === "calendar") assert.equal(args.where, undefined);
      return result; };
  } });
  const db = { schedulerSetting: read("setting", { dailyScheduleReviewMinutes: 30 }),
    schedulerActivitySetting: read("activities", [{ dailyReservedMinutes: 60 }]),
    workCalendar: read("calendar", []), workTimeSession: read("sessions", []) } as unknown as PrismaClient;
  const actual = await loadCapacityObservationFeedback(db, now);
  assert.equal(actual.observedDayCount, 0);
  assert.deepEqual(calls.sort(), ["setting", "activities", "calendar", "sessions"].sort());
});

test("feedback UI labels observation limits and current-setting comparison", () => {
  const feedback = summarizeCapacityObservations({ now, settings, workCalendar: [], sessions: [
    session("REPAIR", "2026-09-28T00:00:00Z", "2026-09-28T00:01:00Z"),
  ] });
  const html = renderToStaticMarkup(createElement(CapacityObservationFeedback, { feedback }));
  assert.match(html, /未計測日は0分として扱いません/);
  assert.match(html, /全業務を網羅しているかは不明/);
  assert.match(html, /学習容量ではありません/);
  assert.match(html, /空き時間、学習済み容量を示しません/);
  assert.match(html, /過去の設定履歴がないため、現在の設定値/);
  assert.match(html, /各観測日について現在DBに保存されているWorkCalendarの値/);
  assert.match(html, /後日編集された場合、当時の値とは限りません/);
  assert.match(html, /観測日: 2026-09-28〜2026-09-28/);
  assert.match(html, /計測修理以外/);
});

test("empty feedback UI does not display an invented date range", () => {
  const feedback = summarizeCapacityObservations({ now, settings, workCalendar: [], sessions: [] });
  const html = renderToStaticMarkup(createElement(CapacityObservationFeedback, { feedback }));
  assert.doesNotMatch(html, /観測日:/);
  assert.match(html, /今日より前の完了日に計測実績はありません/);
});
