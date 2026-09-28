import type { PreviewDay, PreviewRepairAnalysis } from "./deadline-capacity-preview-domain";
import { SCHEDULABLE_STATUS } from "./simple-auto-scheduler";

export const SCHEDULER_V2_PLANNER_VERSION = "193C1-1";

export type SchedulerV2FutureApplyAction = "NO_CHANGE" | "CREATE_AUTO" | "CREATE_FROM_LEGACY" |
  "REPLACE_AUTO" | "SUMMARY_ONLY_SYNC" | "PRESERVE_UNPLACED" | "PROTECTED";

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
  futureApplyAction: SchedulerV2FutureApplyAction;
};
export type SchedulerV2Day = Pick<PreviewDay, "date" | "grossCapacityMinutes" |
  "totalReservedMinutes" | "effectiveRepairCapacityMinutes"> & {
  fixedLoadMinutes: number; preservedProvisionalLoadMinutes: number;
  // Current-plan fields remain a snapshot of the input, regardless of the proposed replacements.
  replaceableCurrentLoadMinutes: number; currentPlanLoadMinutes: number;
  // The apply-safe result keeps old load for candidates that could not be fully replaced.
  preservedForApplyLoadMinutes: number; proposedLoadMinutes: number;
  resultingPlanLoadMinutes: number; remainingCapacityMinutes: number;
};

const TERMINAL = new Set(["作業完了", "納品済み", "キャンセル"]);
const compareDate = (a: string | null, b: string | null) => a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;

export function classifySchedulerV2FutureApply(repair: SchedulerV2Repair): SchedulerV2FutureApplyAction {
  if (!repair.autoCandidate) return "PROTECTED";
  if (repair.proposedSegments.length === 0) return "PRESERVE_UNPLACED";
  if (repair.currentSegments.length === 0) return repair.currentScheduledDate ? "CREATE_FROM_LEGACY" : "CREATE_AUTO";
  const current = [...repair.currentSegments].sort((a, b) => a.workDate.localeCompare(b.workDate));
  const proposed = [...repair.proposedSegments].sort((a, b) => a.workDate.localeCompare(b.workDate));
  const sameSegments = current.length === proposed.length && current.every((row, index) =>
    row.source === "AUTO" && row.workDate === proposed[index].workDate &&
    row.plannedMinutes === proposed[index].plannedMinutes && row.sortOrder === proposed[index].sortOrder);
  if (!sameSegments) return "REPLACE_AUTO";
  return repair.currentScheduledDate === repair.proposedSummaryDate ? "NO_CHANGE" : "SUMMARY_ONLY_SYNC";
}

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
    preservedForApplyLoadMinutes: 0, proposedLoadMinutes: 0,
    resultingPlanLoadMinutes: 0, remainingCapacityMinutes: 0,
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
      unplacedReason: null, futureApplyAction: "PROTECTED" };
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
  const preservedForApply = new Set<number>();
  // Each failed replacement can only enter the preserved set once. The final pass has no new entries.
  for (let pass = 0; pass <= candidates.length; pass++) {
    let promoted = false;
    for (const day of days) {
      day.proposedLoadMinutes = 0;
      day.preservedForApplyLoadMinutes = 0;
    }
    for (const repair of candidates) {
      repair.proposedSegments = [];
      repair.proposedSummaryDate = null;
      if (!preservedForApply.has(repair.id)) repair.unplacedReason = null;
      else {
        const current = repair.currentSegments.length > 0 ? repair.currentSegments.map(segment => ({
          date: segment.workDate, minutes: segment.plannedMinutes,
        })) : [{ date: repair.currentScheduledDate!, minutes: repair.workMinutes! }];
        for (const item of current) {
          const day = byDate.get(item.date);
          if (day) day.preservedForApplyLoadMinutes += item.minutes;
        }
      }
    }
    for (const repair of candidates) {
      if (preservedForApply.has(repair.id)) continue;
      let remaining = repair.workMinutes!;
      const tentative: ProposedSegment[] = [];
      for (const day of days) {
        if (day.date < repair.projectedEarliestDate! || day.date > repair.latestWorkCompletionDate!) continue;
        const available = Math.max(0, day.effectiveRepairCapacityMinutes - day.fixedLoadMinutes
          - day.preservedProvisionalLoadMinutes - day.preservedForApplyLoadMinutes - day.proposedLoadMinutes);
        const minutes = Math.min(remaining, available);
        if (minutes > 0) tentative.push({ repairId: repair.id, workDate: day.date,
          plannedMinutes: minutes, source: "AUTO", sortOrder: 0 });
        remaining -= minutes;
        if (remaining === 0) break;
      }
      if (remaining > 0) {
        repair.unplacedReason = repair.latestWorkCompletionDate! > days.at(-1)!.date
          ? "BEYOND_PREVIEW_HORIZON" : "NO_CAPACITY_IN_WINDOW";
        if (repair.currentPlanClass === "REPLACEABLE_PROVISIONAL") {
          preservedForApply.add(repair.id);
          promoted = true;
        }
        continue;
      }
      repair.proposedSegments = tentative;
      repair.proposedSummaryDate = tentative[0].workDate;
      for (const segment of tentative) byDate.get(segment.workDate)!.proposedLoadMinutes += segment.plannedMinutes;
    }
    if (!promoted) break;
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
  for (const day of days) {
    day.resultingPlanLoadMinutes = day.fixedLoadMinutes + day.preservedProvisionalLoadMinutes +
      day.preservedForApplyLoadMinutes + day.proposedLoadMinutes;
    day.remainingCapacityMinutes = Math.max(0, day.effectiveRepairCapacityMinutes - day.resultingPlanLoadMinutes);
  }
  for (const repair of repairs) repair.futureApplyAction = classifySchedulerV2FutureApply(repair);
  return { days, repairs };
}
