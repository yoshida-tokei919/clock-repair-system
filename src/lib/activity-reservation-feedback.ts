import type { PrismaClient, SchedulerActivitySetting, WorkTimeActivityType } from "@prisma/client";
import { ACTIVITY_TYPES, AUTO_ACTIVITY_TYPES, assertSettingsRows } from "./scheduler-settings-domain";
import { monthsBefore, resolveWorkTimeLearning, type LearningSession } from "./work-time-learning-domain";
import { tokyoCalendarDate } from "./order-expected-arrival";

type ActivitySetting = Pick<SchedulerActivitySetting, "activityType" | "manualStandardMinutes" |
  "dailyReservedMinutes" | "learningMode" | "aggregationMethod" | "lookbackMonths" |
  "fallbackLookbackMonths" | "minimumSamples">;
type GlobalSetting = NonNullable<Parameters<typeof resolveWorkTimeLearning>[0]["schedulerSetting"]>;
type ActualSession = Pick<LearningSession, "activityType" | "startedAt" | "endedAt" | "invalidatedAt">;
type Stats = { sampleCount: number; median: number | null; mean: number | null;
  p80: number | null; min: number | null; max: number | null };

export type ActivityReservationFeedbackRow = {
  activityType: WorkTimeActivityType;
  current: ActivitySetting;
  daily: Stats & { observedDayCount: number; meanDeltaFromReservation: number | null };
  sessions: Stats;
  lookback: { since: string; through: string };
  learning: null | { usableSampleCount: number; usedFallback: boolean; adoptedMinutes: number | null;
    adoptedReason: string; mean: number | null; median: number | null; p80: number | null };
};

function stats(values: readonly number[]): Stats {
  if (!values.length) return { sampleCount: 0, mean: null, median: null, p80: null, min: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { sampleCount: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p80: sorted[Math.ceil(sorted.length * 0.8) - 1], min: sorted[0], max: sorted.at(-1)! };
}

// Reservation is a daily capacity deduction. Split sessions at Tokyo midnight and compare
// daily totals on observed days; an unobserved day is not evidence of zero usage.
export function summarizeActivityReservationFeedback(
  settings: readonly ActivitySetting[], sessions: readonly ActualSession[], now: Date,
  globalSetting?: GlobalSetting,
  learningSessions?: readonly LearningSession[],
): ActivityReservationFeedbackRow[] {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid feedback time.");
  const byType = new Map(settings.map(row => [row.activityType, row]));
  return ACTIVITY_TYPES.map(activityType => {
    const current = byType.get(activityType)!;
    if (!current) throw new Error(`SchedulerActivitySetting is missing for ${activityType}.`);
    const since = monthsBefore(now, current.lookbackMonths);
    const dailySeconds = new Map<string, number>();
    const sessionMinutes: number[] = [];
    for (const session of sessions) {
      if (session.activityType !== activityType || !session.endedAt || session.invalidatedAt ||
          !Number.isFinite(session.startedAt.getTime()) || !Number.isFinite(session.endedAt.getTime()) ||
          session.endedAt < session.startedAt || session.endedAt > now) continue;
      const start = Math.max(session.startedAt.getTime(), since.getTime());
      const end = session.endedAt.getTime();
      if (end < start || (end === start && session.startedAt.getTime() < since.getTime())) continue;
      sessionMinutes.push((session.endedAt.getTime() - session.startedAt.getTime()) / 60_000);
      // Zero-duration ended sessions remain valid observations.
      if (end === start) {
        const day = tokyoCalendarDate(new Date(start)).toISOString().slice(0, 10);
        dailySeconds.set(day, dailySeconds.get(day) ?? 0);
      }
      for (let cursor = start; cursor < end;) {
        const day = tokyoCalendarDate(new Date(cursor));
        const key = day.toISOString().slice(0, 10);
        const nextMidnight = day.getTime() + 86_400_000 - 9 * 3_600_000;
        const segmentEnd = Math.min(end, nextMidnight);
        dailySeconds.set(key, (dailySeconds.get(key) ?? 0) + (segmentEnd - cursor) / 1000);
        cursor = segmentEnd;
      }
    }
    const daily = stats(Array.from(dailySeconds.values(), seconds => seconds / 60));
    const learningResult = globalSetting && learningSessions && AUTO_ACTIVITY_TYPES.some(type => type === activityType)
      ? resolveWorkTimeLearning({ activityType: activityType as "ESTIMATE" | "INQUIRY" | "PARTS_ORDER",
        schedulerSetting: globalSetting, activitySetting: current, sessions: learningSessions, now }) : null;
    return { activityType, current,
      daily: { ...daily, observedDayCount: daily.sampleCount,
        meanDeltaFromReservation: daily.mean === null ? null : daily.mean - current.dailyReservedMinutes },
      sessions: stats(sessionMinutes), lookback: { since: since.toISOString(), through: now.toISOString() },
      learning: learningResult ? { usableSampleCount: learningResult.usableSampleCount,
        usedFallback: learningResult.lookback.usedFallback, adoptedMinutes: learningResult.adoptedMinutes,
        adoptedReason: learningResult.adoptedReason, mean: learningResult.mean,
        median: learningResult.median, p80: learningResult.p80 } : null };
  });
}

export async function loadActivityReservationFeedback(db: PrismaClient, now = new Date()) {
  const [globalSetting, settings, sessions] = await Promise.all([
    db.schedulerSetting.findUnique({ where: { id: 1 } }),
    db.schedulerActivitySetting.findMany(),
    db.workTimeSession.findMany({ where: { activityType: { in: [...ACTIVITY_TYPES] },
      endedAt: { not: null }, invalidatedAt: null },
      select: { activityType: true, repairId: true, inquiryId: true, orderRequestId: true,
        contextSchemaVersion: true, contextSnapshot: true, startedAt: true, endedAt: true, invalidatedAt: true } }),
  ]);
  assertSettingsRows(globalSetting, settings);
  return summarizeActivityReservationFeedback(settings, sessions, now, globalSetting!, sessions);
}
