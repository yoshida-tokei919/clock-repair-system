import { availableMinutesForDate, parseWorkDate, serializeWorkDate, type WorkCalendarException } from "./work-calendar";
import type { PartsReadiness } from "./repair-parts-readiness";
import { SCHEDULE_HORIZON_DAYS } from "./simple-auto-scheduler";

export type PreviewRepair = {
  id: number; inquiryNumber: string; status: string; scheduledDate: string | null;
  scheduleLocked: boolean; estimatedWorkMinutes: number; remainingWorkMinutes: number | null;
  deliveryDateExpected: string | null; partsReadinessState: PartsReadiness["state"];
  partsReadyDate: string | null; blocked: boolean; resumeEligibleDate: string | null;
  reviewDate: string | null;
};
export type PreviewSettings = {
  dailyScheduleReviewMinutes: number;
  activityReservedMinutes: number;
  runningTestDays: number | null;
  reworkBufferDays: number | null;
  shippingBufferDays: number | null;
};
export type PreviewDayItem = { id: number; inquiryNumber: string; minutes: number };
export type PreviewDay = {
  date: string; grossCapacityMinutes: number; scheduleReviewReservedMinutes: number;
  activityReservedMinutes: number; totalReservedMinutes: number;
  effectiveRepairCapacityMinutes: number; overReservedMinutes: number;
  fixedLoadMinutes: number; provisionalLoadMinutes: number; currentPlanLoadMinutes: number;
  fixedRemainingMinutes: number; currentPlanRemainingMinutes: number; overbookedMinutes: number;
  fixedItems: PreviewDayItem[]; provisionalItems: PreviewDayItem[];
};
export type AnalysisReason = "TERMINAL" | "WORK_MINUTES_UNAVAILABLE" | "PARTS_WAITING_UNKNOWN" |
  "PARTS_LEGACY_UNKNOWN" | "BLOCKED_REQUIRES_MANUAL_RESUME" | "PROCESS_BUFFER_UNSET" |
  "DEADLINE_UNSET" | "DEADLINE_WINDOW_PASSED" | "REQUIRES_SPLIT_SCHEDULER" |
  "NO_CAPACITY_IN_WINDOW" | "BEYOND_PREVIEW_HORIZON" | "LOCKED_DATE_CONFLICT" |
  "CURRENT_PLAN_CONFLICT" | "READY";
export type PreviewRepairAnalysis = PreviewRepair & {
  workMinutes: number | null; workMinutesSource: "REMAINING_WORK" | "ESTIMATED_WORK" | null;
  latestWorkCompletionDate: string | null; projectedEarliestDate: string | null;
  potentialEarliestDate: string | null; firstAvailableDateAgainstCurrentPlan: string | null;
  currentPlanConstraintConflict: boolean;
  slackDays: number | null; analysisStatus: "AVAILABLE" | "CONFLICT" | "UNAVAILABLE" | "INFORMATIONAL";
  analysisReason: AnalysisReason;
};

const TERMINAL = new Set(["作業完了", "納品済み", "キャンセル"]);
const addDays = (date: string, days: number) => {
  const value = parseWorkDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return serializeWorkDate(value);
};
const dayDifference = (start: string, end: string) =>
  Math.round((parseWorkDate(end).getTime() - parseWorkDate(start).getTime()) / 86_400_000);
const later = (a: string, b: string) => a > b ? a : b;

export function resolveDeadlineCapacityPreview(input: {
  asOfDate: string; repairs: readonly PreviewRepair[]; workCalendar: readonly WorkCalendarException[];
  settings: PreviewSettings; horizonDays?: number;
}) {
  parseWorkDate(input.asOfDate);
  const horizonDays = input.horizonDays ?? SCHEDULE_HORIZON_DAYS;
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 366) throw new Error("Invalid preview horizon.");
  const s = input.settings;
  const processBufferConfigured = [s.runningTestDays, s.reworkBufferDays, s.shippingBufferDays]
    .every(value => value !== null && Number.isInteger(value) && value >= 0);
  const totalProcessBufferDays = processBufferConfigured
    ? s.runningTestDays! + s.reworkBufferDays! + s.shippingBufferDays! : null;
  const days: PreviewDay[] = Array.from({ length: horizonDays }, (_, index) => {
    const date = addDays(input.asOfDate, index);
    const grossCapacityMinutes = availableMinutesForDate(date, input.workCalendar);
    const totalReservedMinutes = s.dailyScheduleReviewMinutes + s.activityReservedMinutes;
    return {
      date, grossCapacityMinutes, scheduleReviewReservedMinutes: s.dailyScheduleReviewMinutes,
      activityReservedMinutes: s.activityReservedMinutes, totalReservedMinutes,
      effectiveRepairCapacityMinutes: Math.max(0, grossCapacityMinutes - totalReservedMinutes),
      overReservedMinutes: Math.max(0, totalReservedMinutes - grossCapacityMinutes),
      fixedLoadMinutes: 0, provisionalLoadMinutes: 0, currentPlanLoadMinutes: 0,
      fixedRemainingMinutes: 0, currentPlanRemainingMinutes: 0, overbookedMinutes: 0,
      fixedItems: [], provisionalItems: [],
    };
  });
  const byDate = new Map(days.map(day => [day.date, day]));
  const minutesFor = (repair: PreviewRepair) => repair.remainingWorkMinutes !== null
    ? { minutes: repair.remainingWorkMinutes, source: "REMAINING_WORK" as const }
    : repair.estimatedWorkMinutes > 0
      ? { minutes: repair.estimatedWorkMinutes, source: "ESTIMATED_WORK" as const }
      : { minutes: null, source: null };
  for (const repair of input.repairs) {
    if (TERMINAL.has(repair.status) || !repair.scheduledDate) continue;
    const minutes = minutesFor(repair).minutes;
    if (minutes === null || minutes <= 0) continue;
    const day = byDate.get(repair.scheduledDate);
    if (!day) continue;
    const item = { id: repair.id, inquiryNumber: repair.inquiryNumber, minutes };
    if (repair.scheduleLocked) { day.fixedLoadMinutes += minutes; day.fixedItems.push(item); }
    else { day.provisionalLoadMinutes += minutes; day.provisionalItems.push(item); }
  }
  for (const day of days) {
    day.currentPlanLoadMinutes = day.fixedLoadMinutes + day.provisionalLoadMinutes;
    day.fixedRemainingMinutes = Math.max(0, day.effectiveRepairCapacityMinutes - day.fixedLoadMinutes);
    day.currentPlanRemainingMinutes = Math.max(0, day.effectiveRepairCapacityMinutes - day.currentPlanLoadMinutes);
    day.overbookedMinutes = Math.max(0, day.currentPlanLoadMinutes - day.effectiveRepairCapacityMinutes);
  }
  const repairs: PreviewRepairAnalysis[] = input.repairs.map(repair => {
    const work = minutesFor(repair);
    const workMinutes = work.minutes !== null && work.minutes > 0 ? work.minutes : null;
    const latestWorkCompletionDate = repair.deliveryDateExpected !== null && totalProcessBufferDays !== null
      ? addDays(repair.deliveryDateExpected, -totalProcessBufferDays) : null;
    const partsKnown = repair.partsReadinessState === "NOT_REQUIRED" || repair.partsReadinessState === "READY" ||
      (repair.partsReadinessState === "WAITING" && repair.partsReadyDate !== null);
    let potentialEarliestDate: string | null = partsKnown ? input.asOfDate : null;
    if (potentialEarliestDate && repair.partsReadyDate && repair.partsReadinessState === "WAITING")
      potentialEarliestDate = later(potentialEarliestDate, repair.partsReadyDate);
    if (potentialEarliestDate && repair.blocked && repair.resumeEligibleDate)
      potentialEarliestDate = later(potentialEarliestDate, repair.resumeEligibleDate);
    const projectedEarliestDate = repair.blocked ? null : potentialEarliestDate;
    const currentPlanConstraintConflict = !TERMINAL.has(repair.status) && repair.scheduledDate !== null &&
      (repair.blocked || !partsKnown || (potentialEarliestDate !== null && repair.scheduledDate < potentialEarliestDate) ||
        (latestWorkCompletionDate !== null && repair.scheduledDate > latestWorkCompletionDate));
    const base = {
      ...repair, workMinutes, workMinutesSource: workMinutes === null ? null : work.source,
      latestWorkCompletionDate, projectedEarliestDate, potentialEarliestDate,
      currentPlanConstraintConflict,
      firstAvailableDateAgainstCurrentPlan: null as string | null,
      slackDays: projectedEarliestDate && latestWorkCompletionDate
        ? dayDifference(projectedEarliestDate, latestWorkCompletionDate) : null,
    };
    let analysisReason: AnalysisReason;
    if (TERMINAL.has(repair.status)) analysisReason = "TERMINAL";
    else if (workMinutes === null) analysisReason = "WORK_MINUTES_UNAVAILABLE";
    else if (repair.partsReadinessState === "WAITING_UNKNOWN" || (repair.partsReadinessState === "WAITING" && !repair.partsReadyDate)) analysisReason = "PARTS_WAITING_UNKNOWN";
    else if (repair.partsReadinessState === "LEGACY_UNKNOWN") analysisReason = "PARTS_LEGACY_UNKNOWN";
    else if (repair.blocked) analysisReason = "BLOCKED_REQUIRES_MANUAL_RESUME";
    else if (!processBufferConfigured) analysisReason = "PROCESS_BUFFER_UNSET";
    else if (!latestWorkCompletionDate) analysisReason = "DEADLINE_UNSET";
    else if (latestWorkCompletionDate < projectedEarliestDate!) analysisReason = "DEADLINE_WINDOW_PASSED";
    else if (repair.scheduledDate && (repair.scheduledDate < projectedEarliestDate! || repair.scheduledDate > latestWorkCompletionDate))
      analysisReason = repair.scheduleLocked ? "LOCKED_DATE_CONFLICT" : "CURRENT_PLAN_CONFLICT";
    else if (repair.scheduledDate && !byDate.has(repair.scheduledDate)) analysisReason = "BEYOND_PREVIEW_HORIZON";
    else {
      const windowDays = days.filter(day => day.date >= projectedEarliestDate! && day.date <= latestWorkCompletionDate);
      const maxAbsolute = Math.max(0, ...windowDays.map(day => day.effectiveRepairCapacityMinutes));
      if (windowDays.length === 0) analysisReason = "BEYOND_PREVIEW_HORIZON";
      else {
        const available = windowDays.find(day => {
          // Existing load for this repair must not prevent its own assessment.
          const own = repair.scheduledDate === day.date ? workMinutes : 0;
          return day.effectiveRepairCapacityMinutes - day.currentPlanLoadMinutes + own >= workMinutes;
        });
        base.firstAvailableDateAgainstCurrentPlan = available?.date ?? null;
        analysisReason = available ? "READY" : latestWorkCompletionDate > days.at(-1)!.date
          ? "BEYOND_PREVIEW_HORIZON" : maxAbsolute > 0 && workMinutes > maxAbsolute
            ? "REQUIRES_SPLIT_SCHEDULER" : "NO_CAPACITY_IN_WINDOW";
        if (repair.scheduledDate && byDate.get(repair.scheduledDate)?.overbookedMinutes)
          analysisReason = repair.scheduleLocked ? "LOCKED_DATE_CONFLICT" : "CURRENT_PLAN_CONFLICT";
      }
    }
    const analysisStatus = currentPlanConstraintConflict || analysisReason === "LOCKED_DATE_CONFLICT" ||
      analysisReason === "CURRENT_PLAN_CONFLICT"
        ? "CONFLICT" as const
      : analysisReason === "READY" ? "AVAILABLE" as const
        : analysisReason === "TERMINAL" || analysisReason === "DEADLINE_UNSET" ||
          analysisReason === "PROCESS_BUFFER_UNSET" || analysisReason === "BEYOND_PREVIEW_HORIZON"
          ? "INFORMATIONAL" as const : "UNAVAILABLE" as const;
    return { ...base, analysisStatus, analysisReason };
  });
  const analysisStatusCounts = repairs.reduce<Record<string, number>>((counts, row) => {
    counts[row.analysisStatus] = (counts[row.analysisStatus] ?? 0) + 1;
    return counts;
  }, {});
  const analysisCounts = repairs.reduce<Record<string, number>>((counts, row) => {
    counts[row.analysisReason] = (counts[row.analysisReason] ?? 0) + 1;
    return counts;
  }, {});
  return {
    asOfDate: input.asOfDate, horizonEndDate: days.at(-1)!.date,
    totalReservedDailyMinutes: s.dailyScheduleReviewMinutes + s.activityReservedMinutes,
    processBufferSettings: { runningTestDays: s.runningTestDays, reworkBufferDays: s.reworkBufferDays,
      shippingBufferDays: s.shippingBufferDays, configured: processBufferConfigured, totalProcessBufferDays },
    overReservedDayCount: days.filter(day => day.overReservedMinutes > 0).length,
    overbookedDayCount: days.filter(day => day.overbookedMinutes > 0).length,
    analysisCounts, analysisStatusCounts, days, repairs,
  };
}
