import type { PreviewDay, PreviewRepairAnalysis } from "./deadline-capacity-preview-domain";
import { SCHEDULABLE_STATUS } from "./simple-auto-scheduler";

export const SCHEDULER_V2_PLANNER_VERSION = "193B-1";

export type CurrentSegment = {
  id: number; repairId: number; workDate: string; plannedMinutes: number;
  source: "AUTO" | "MANUAL"; sortOrder: number;
};
export type PlannerMetadata = {
  id: number; priorityScore: number; receptionDate: string | null;
};
export type ProposedSegment = {
  repairId: number; workDate: string; plannedMinutes: number; source: "AUTO"; sortOrder: number;
};
export type SchedulerV2Repair = PreviewRepairAnalysis & PlannerMetadata & {
  currentScheduledDate: string | null;
  autoCandidate: boolean;
  currentPlanClass: "FIXED" | "PRESERVED_PROVISIONAL" | "REPLACEABLE_PROVISIONAL" | "NONE";
  currentSegments: CurrentSegment[];
  proposedSegments: ProposedSegment[];
  proposedSummaryDate: string | null;
  unplacedReason: string | null;
};
export type SchedulerV2Day = Pick<PreviewDay, "date" | "grossCapacityMinutes" |
  "totalReservedMinutes" | "effectiveRepairCapacityMinutes"> & {
  fixedLoadMinutes: number; preservedProvisionalLoadMinutes: number;
  replaceableCurrentLoadMinutes: number; currentPlanLoadMinutes: number;
  proposedLoadMinutes: number; remainingCapacityMinutes: number;
};

const TERMINAL = new Set(["作業完了", "納品済み", "キャンセル"]);
const compareDate = (a: string | null, b: string | null) => a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;

export function resolveSchedulerV2Planner(input: {
  repairs: readonly PreviewRepairAnalysis[];
  days: readonly PreviewDay[];
  metadata: readonly PlannerMetadata[];
  currentSegments: readonly CurrentSegment[];
}) {
  const metadata = new Map(input.metadata.map(row => [row.id, row]));
  const segments = new Map<number, CurrentSegment[]>();
  for (const segment of input.currentSegments) {
    const rows = segments.get(segment.repairId) ?? [];
    rows.push(segment);
    segments.set(segment.repairId, rows);
  }
  const days: SchedulerV2Day[] = input.days.map(day => ({
    date: day.date, grossCapacityMinutes: day.grossCapacityMinutes,
    totalReservedMinutes: day.totalReservedMinutes,
    effectiveRepairCapacityMinutes: day.effectiveRepairCapacityMinutes,
    fixedLoadMinutes: 0, preservedProvisionalLoadMinutes: 0,
    replaceableCurrentLoadMinutes: 0, currentPlanLoadMinutes: 0,
    proposedLoadMinutes: 0, remainingCapacityMinutes: 0,
  }));
  const byDate = new Map(days.map(day => [day.date, day]));
  const repairs: SchedulerV2Repair[] = input.repairs.map(repair => {
    const meta = metadata.get(repair.id);
    if (!meta) throw new Error(`Planner metadata missing for repair ${repair.id}.`);
    const currentSegments = segments.get(repair.id) ?? [];
    const manual = currentSegments.some(segment => segment.source === "MANUAL");
    const eligible = repair.status === SCHEDULABLE_STATUS && !repair.scheduleLocked && !manual &&
      repair.workMinutes !== null && repair.workMinutes > 0 && !repair.blocked &&
      repair.projectedEarliestDate !== null && repair.latestWorkCompletionDate !== null &&
      repair.projectedEarliestDate <= repair.latestWorkCompletionDate;
    const hasLoad = currentSegments.length > 0 || (repair.scheduledDate !== null && repair.workMinutes !== null);
    const currentPlanClass = repair.scheduleLocked || manual ? "FIXED" : eligible && hasLoad ? "REPLACEABLE_PROVISIONAL"
      : hasLoad ? "PRESERVED_PROVISIONAL" : "NONE";
    return { ...repair, ...meta, currentScheduledDate: repair.scheduledDate,
      autoCandidate: eligible, currentPlanClass, currentSegments, proposedSegments: [], proposedSummaryDate: null,
      unplacedReason: null };
  });
  for (const repair of repairs) {
    if (TERMINAL.has(repair.status)) continue;
    const current = repair.currentSegments.length > 0 ? repair.currentSegments.map(segment => ({
      date: segment.workDate, minutes: segment.plannedMinutes,
    })) : repair.scheduledDate && repair.workMinutes !== null ? [{ date: repair.scheduledDate, minutes: repair.workMinutes }] : [];
    for (const item of current) {
      const day = byDate.get(item.date);
      if (!day) continue;
      if (repair.currentPlanClass === "FIXED") day.fixedLoadMinutes += item.minutes;
      else if (repair.currentPlanClass === "REPLACEABLE_PROVISIONAL") day.replaceableCurrentLoadMinutes += item.minutes;
      else day.preservedProvisionalLoadMinutes += item.minutes;
    }
  }
  for (const day of days) day.currentPlanLoadMinutes = day.fixedLoadMinutes +
    day.preservedProvisionalLoadMinutes + day.replaceableCurrentLoadMinutes;
  const candidates = repairs.filter(row => row.autoCandidate)
    .sort((a, b) => b.priorityScore - a.priorityScore
      || compareDate(a.deliveryDateExpected, b.deliveryDateExpected)
      || compareDate(a.receptionDate, b.receptionDate) || a.id - b.id);
  for (const repair of candidates) {
    let remaining = repair.workMinutes!;
    const tentative: ProposedSegment[] = [];
    for (const day of days) {
      if (day.date < repair.projectedEarliestDate! || day.date > repair.latestWorkCompletionDate!) continue;
      const available = Math.max(0, day.effectiveRepairCapacityMinutes - day.fixedLoadMinutes
        - day.preservedProvisionalLoadMinutes - day.proposedLoadMinutes);
      const minutes = Math.min(remaining, available);
      if (minutes > 0) tentative.push({ repairId: repair.id, workDate: day.date,
        plannedMinutes: minutes, source: "AUTO", sortOrder: 0 });
      remaining -= minutes;
      if (remaining === 0) break;
    }
    if (remaining > 0) {
      repair.unplacedReason = repair.latestWorkCompletionDate! > days.at(-1)!.date
        ? "BEYOND_PREVIEW_HORIZON" : "NO_CAPACITY_IN_WINDOW";
      continue;
    }
    repair.proposedSegments = tentative;
    repair.proposedSummaryDate = tentative[0].workDate;
    for (const segment of tentative) byDate.get(segment.workDate)!.proposedLoadMinutes += segment.plannedMinutes;
  }
  // Candidate order is the display order within every work day.
  const dailyOrder = new Map<string, number>();
  for (const repair of candidates) for (const segment of repair.proposedSegments) {
    segment.sortOrder = dailyOrder.get(segment.workDate) ?? 0;
    dailyOrder.set(segment.workDate, segment.sortOrder + 1);
  }
  for (const repair of repairs) {
    if (repair.autoCandidate) continue;
    repair.unplacedReason = repair.scheduleLocked && repair.currentSegments.length === 0 && !repair.scheduledDate
      ? "LOCKED_WITHOUT_DATE" : repair.currentSegments.some(segment => segment.source === "MANUAL")
        ? "MANUAL_SEGMENT_PROTECTED" : repair.scheduleLocked ? "LOCKED" :
          repair.status !== SCHEDULABLE_STATUS ? "STATUS_NOT_SCHEDULABLE" :
          repair.workMinutes === null ? "WORK_MINUTES_UNAVAILABLE" :
          repair.blocked ? "BLOCKED_REQUIRES_MANUAL_RESUME" :
          repair.partsReadinessState === "WAITING_UNKNOWN" || repair.partsReadinessState === "WAITING" && !repair.partsReadyDate
            ? "PARTS_WAITING_UNKNOWN" : repair.partsReadinessState === "LEGACY_UNKNOWN"
              ? "PARTS_LEGACY_UNKNOWN" : repair.analysisReason;
  }
  for (const day of days) day.remainingCapacityMinutes = Math.max(0, day.effectiveRepairCapacityMinutes
    - day.fixedLoadMinutes - day.preservedProvisionalLoadMinutes - day.proposedLoadMinutes);
  return { days, repairs };
}
