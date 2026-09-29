import type { PrismaClient, WorkTimeActivityType } from "@prisma/client";
import { resolveDeadlineCapacityPreview } from "./deadline-capacity-preview-domain";
import { tokyoCalendarDate } from "./order-expected-arrival";
import { todayInJapan } from "./simple-auto-scheduler";
import { parseWorkDate, type WorkCalendarException } from "./work-calendar";

type Session = { activityType: WorkTimeActivityType; startedAt: Date; endedAt: Date | null; invalidatedAt: Date | null };
type CapacitySettings = { dailyScheduleReviewMinutes: number; activityReservedMinutes: number };

export type CapacityObservationDay = {
  date: string; grossCapacityMinutes: number; scheduleReviewReservedMinutes: number;
  activityReservedMinutes: number; effectiveRepairCapacityMinutes: number; overReservedMinutes: number;
  measuredRepairMinutes: number; measuredNonRepairMinutes: number; totalMeasuredMinutes: number;
};
export type CapacityObservationFeedback = {
  firstObservedDate: string | null; lastObservedDate: string | null; observedDayCount: number;
  observedDayMeans: { repair: number | null; nonRepair: number | null; total: number | null };
  days: CapacityObservationDay[];
};

const dateKey = (date: Date) => tokyoCalendarDate(date).toISOString().slice(0, 10);
const addDays = (date: string, count: number) => {
  const value = parseWorkDate(date);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
};
const tokyoMidnightUtc = (date: string) => parseWorkDate(date).getTime() - 9 * 3_600_000;

export function summarizeCapacityObservations(input: {
  now: Date; sessions: readonly Session[]; workCalendar: readonly WorkCalendarException[]; settings: CapacitySettings;
}): CapacityObservationFeedback {
  if (!Number.isFinite(input.now.getTime())) throw new Error("Invalid feedback time.");
  const todayStart = tokyoMidnightUtc(todayInJapan(input.now));
  const measured = new Map<string, { repairSeconds: number; nonRepairSeconds: number }>();
  for (const session of input.sessions) {
    if (!session.endedAt || session.invalidatedAt || !Number.isFinite(session.startedAt.getTime()) ||
        !Number.isFinite(session.endedAt.getTime()) || session.endedAt < session.startedAt ||
        session.endedAt > input.now || session.startedAt >= input.now) continue;
    const start = session.startedAt.getTime();
    const end = Math.min(session.endedAt.getTime(), todayStart);
    if (end <= start) continue;
    for (let cursor = start; cursor < end;) {
      const date = dateKey(new Date(cursor));
      const segmentEnd = Math.min(end, tokyoMidnightUtc(addDays(date, 1)));
      const row = measured.get(date) ?? { repairSeconds: 0, nonRepairSeconds: 0 };
      if (session.activityType === "REPAIR") row.repairSeconds += (segmentEnd - cursor) / 1000;
      else row.nonRepairSeconds += (segmentEnd - cursor) / 1000;
      measured.set(date, row);
      cursor = segmentEnd;
    }
  }
  const days = Array.from(measured).sort(([a], [b]) => a.localeCompare(b)).map(([date, actual]) => {
    // Use the Task192 calculation itself, including the over-reservation clamp.
    const capacity = resolveDeadlineCapacityPreview({ asOfDate: date, horizonDays: 1,
      repairs: [], workCalendar: input.workCalendar, settings: {
        ...input.settings, runningTestDays: null, reworkBufferDays: null, shippingBufferDays: null,
      } }).days[0];
    const measuredRepairMinutes = actual.repairSeconds / 60;
    const measuredNonRepairMinutes = actual.nonRepairSeconds / 60;
    return { date, grossCapacityMinutes: capacity.grossCapacityMinutes,
      scheduleReviewReservedMinutes: capacity.scheduleReviewReservedMinutes,
      activityReservedMinutes: capacity.activityReservedMinutes,
      effectiveRepairCapacityMinutes: capacity.effectiveRepairCapacityMinutes,
      overReservedMinutes: capacity.overReservedMinutes, measuredRepairMinutes,
      measuredNonRepairMinutes, totalMeasuredMinutes: measuredRepairMinutes + measuredNonRepairMinutes };
  });
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return { firstObservedDate: days[0]?.date ?? null, lastObservedDate: days.at(-1)?.date ?? null,
    observedDayCount: days.length,
    observedDayMeans: { repair: mean(days.map(day => day.measuredRepairMinutes)),
      nonRepair: mean(days.map(day => day.measuredNonRepairMinutes)),
      total: mean(days.map(day => day.totalMeasuredMinutes)) }, days };
}

export async function loadCapacityObservationFeedback(db: PrismaClient, now = new Date()) {
  const today = todayInJapan(now);
  const [setting, activities, workCalendar, sessions] = await Promise.all([
    db.schedulerSetting.findUnique({ where: { id: 1 }, select: { dailyScheduleReviewMinutes: true } }),
    db.schedulerActivitySetting.findMany({ select: { dailyReservedMinutes: true } }),
    db.workCalendar.findMany({ select: { workDate: true, availableMinutes: true, note: true } }),
    db.workTimeSession.findMany({ where: { startedAt: { lt: new Date(tokyoMidnightUtc(today)) },
      endedAt: { not: null, lte: now }, invalidatedAt: null },
      select: { activityType: true, startedAt: true, endedAt: true, invalidatedAt: true } }),
  ]);
  if (!setting) throw new Error("SchedulerSetting(id=1) is missing.");
  return summarizeCapacityObservations({ now, sessions, workCalendar, settings: {
    dailyScheduleReviewMinutes: setting.dailyScheduleReviewMinutes,
    activityReservedMinutes: activities.reduce((sum, row) => sum + row.dailyReservedMinutes, 0),
  } });
}
