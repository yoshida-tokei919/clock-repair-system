import type { RepairWorkTimeStandard, RepairWorkType, WatchDriveType } from "@prisma/client";
import {
  conditionKey, normalizeDetailLabel, resolveWorkTimeLearning,
  type LearningResult, type LearningSession, type RepairCondition, type RepairMatchingDimensions,
} from "@/lib/work-time-learning-domain";

type Standard = Pick<RepairWorkTimeStandard, "id" | "repairType" | "categoryId" | "targetPartNameId" |
  "actionId" | "detailLabel" | "driveType" | "standardMinutes">;
type Line = { id: number; lineType: "LABOR" | "PART"; repairWorkCategoryId: number | null;
  repairWorkCategory: { repairType: RepairWorkType } | null; targetPartNameId: string | null;
  repairWorkActionId: number | null; detailLabelSnapshot: string | null };
type Repair = { id: number; movementCaliberId: number | null; baseMovementCaliberId: number | null;
  watch: { brandId: number; modelId: number | null; referenceId: number | null; caseReferenceId: number | null;
    caliberId: number | null; baseCaliberId: number | null; driveType: WatchDriveType | null };
  repairLineItems: Line[] };
type Setting = NonNullable<Parameters<typeof resolveWorkTimeLearning>[0]["schedulerSetting"]>;
type StandardSelection =
  | { status: "SELECTED"; id: number; minutes: number; candidateIds: number[] }
  | { status: "NONE"; id: null; minutes: null; candidateIds: [] }
  | { status: "AMBIGUOUS_STANDARD"; id: null; minutes: null; candidateIds: number[] };

const optional = ["targetPartNameId", "actionId", "detailLabel", "driveType"] as const;

export function selectWorkTimeStandard(standards: readonly Standard[], condition: RepairCondition,
  driveType: WatchDriveType | null): StandardSelection {
  const matching = standards.filter(row => row.repairType === condition.repairType &&
    row.categoryId === condition.repairWorkCategoryId &&
    (row.targetPartNameId === null || row.targetPartNameId === condition.targetPartNameId) &&
    (row.actionId === null || row.actionId === condition.repairWorkActionId) &&
    (row.detailLabel === null || normalizeDetailLabel(row.detailLabel) === normalizeDetailLabel(condition.detailLabel)) &&
    (condition.repairType === "EXTERNAL" ? row.driveType === null :
      row.driveType === null || row.driveType === driveType));
  const specified = (row: Standard) => optional.filter(key => row[key] !== null);
  const undominated = matching.filter(row => !matching.some(other => {
    if (other.id === row.id) return false;
    const own = specified(row);
    const theirs = specified(other);
    return theirs.length > own.length && own.every(key => theirs.includes(key));
  }));
  if (!undominated.length) return { status: "NONE", id: null, minutes: null, candidateIds: [] };
  if (undominated.length > 1) return { status: "AMBIGUOUS_STANDARD", id: null, minutes: null,
    candidateIds: undominated.map(row => row.id).sort((a, b) => a - b) };
  const winner = undominated[0];
  return { status: "SELECTED", id: winner.id, minutes: winner.standardMinutes, candidateIds: [winner.id] };
}

type Tier = { name: string; filters: Partial<RepairMatchingDimensions>[] };
function actualTiers(condition: RepairCondition, repair: Repair): Tier[] {
  const watch = repair.watch;
  if (condition.repairType === "EXTERNAL") {
    const refs = Array.from(new Set([watch.referenceId, watch.caseReferenceId].filter((id): id is number => id !== null)));
    return [
      ...(refs.length ? [{ name: "REF", filters: refs.flatMap(id => [{ referenceId: id }, { caseReferenceId: id }]) }] : []),
      ...(watch.modelId !== null ? [{ name: "MODEL", filters: [{ modelId: watch.modelId }] }] : []),
      { name: "BRAND", filters: [{ brandId: watch.brandId }] },
    ];
  }
  const fields = [
    ["MOVEMENT_CALIBER", "movementCaliberId", repair.movementCaliberId],
    ["BASE_MOVEMENT_CALIBER", "baseMovementCaliberId", repair.baseMovementCaliberId],
    ["WATCH_CALIBER", "watchCaliberId", watch.caliberId],
    ["WATCH_BASE_CALIBER", "watchBaseCaliberId", watch.baseCaliberId],
  ] as const;
  return fields.filter(([, , id]) => id !== null).map(([name, field, id]) =>
    ({ name, filters: [{ [field]: id }] }));
}

function attemptSummary(name: string, result: LearningResult) {
  return { tier: name, rawSampleCount: result.rawSampleCount,
    filteredOutSampleCount: result.filteredOutSampleCount, usableSampleCount: result.usableSampleCount,
    excludedSampleCount: result.excludedSampleCount, mean: result.mean, median: result.median, p80: result.p80,
    lookback: result.lookback, adoptedReason: result.adoptedReason, adoptedMinutes: result.adoptedMinutes,
    adoptedMethod: result.adoptedMethod, sessionExclusions: result.sessionExclusions,
    sampleExclusions: result.sampleExclusions };
}

export function resolveRepairWorkTimePreview(input: { repair: Repair; standards: readonly Standard[];
  schedulerSetting: Setting | null; sessions: readonly LearningSession[]; now: Date }) {
  const { repair, standards, schedulerSetting, sessions, now } = input;
  if (!schedulerSetting) throw new Error("SchedulerSetting is missing.");
  let resolvedMinutes = 0;
  let structuredLaborLineCount = 0;
  let unstructuredLaborLineCount = 0;
  let unresolvedWorkUnitCount = 0;
  const grouped = new Map<string, { key: string; memberLineItemIds: number[]; condition: RepairCondition }>();
  const lines = repair.repairLineItems.map(line => {
    if (line.lineType === "PART") return { lineItemId: line.id, status: "IGNORED" as const, reason: "PART" as const };
    const categoryId = line.repairWorkCategoryId;
    const repairType = line.repairWorkCategory?.repairType;
    if (categoryId === null || !Number.isSafeInteger(categoryId) || categoryId <= 0 ||
        (repairType !== "INTERNAL" && repairType !== "EXTERNAL")) {
      unstructuredLaborLineCount++;
      return { lineItemId: line.id, status: "UNRESOLVED" as const, reason: "UNSTRUCTURED_LABOR" as const,
        adoptedMinutes: null };
    }
    structuredLaborLineCount++;
    const condition: RepairCondition = { repairType, repairWorkCategoryId: categoryId,
      targetPartNameId: line.targetPartNameId, repairWorkActionId: line.repairWorkActionId,
      detailLabel: normalizeDetailLabel(line.detailLabelSnapshot) };
    const key = conditionKey(condition);
    const existing = grouped.get(key);
    if (existing) existing.memberLineItemIds.push(line.id);
    else grouped.set(key, { key, memberLineItemIds: [line.id], condition });
    return { lineItemId: line.id, status: "WORK_UNIT" as const, workUnitKey: key };
  });
  const workUnits = Array.from(grouped.values(), ({ key, memberLineItemIds, condition }) => {
    const standard = selectWorkTimeStandard(standards, condition, repair.watch.driveType);
    const attempts = [];
    let adoptedMinutes: number | null = null;
    let adoptedReason: string | null = null;
    let adoptedTier: string | null = null;
    if (schedulerSetting.repairLearningMode === "AUTO") {
      for (const tier of actualTiers(condition, repair)) {
        const result = resolveWorkTimeLearning({ activityType: "REPAIR", repairCondition: condition,
          matchingDimensionsAny: tier.filters, sessions, schedulerSetting, now, standardMinutes: null });
        attempts.push(attemptSummary(tier.name, result));
        if (result.adoptedReason.startsWith("ACTUAL_")) {
          adoptedMinutes = result.adoptedMinutes;
          adoptedReason = result.adoptedReason;
          adoptedTier = tier.name;
          break;
        }
      }
    }
    if (adoptedMinutes === null) {
      if (standard.status === "SELECTED") {
        const fallback = resolveWorkTimeLearning({ activityType: "REPAIR", repairCondition: condition,
          sessions: [], schedulerSetting, now, standardMinutes: standard.minutes });
        adoptedMinutes = fallback.adoptedMinutes;
        adoptedReason = fallback.adoptedReason;
      } else adoptedReason = standard.status === "AMBIGUOUS_STANDARD" ? "AMBIGUOUS_STANDARD" : "NO_STANDARD";
    }
    if (adoptedMinutes === null) unresolvedWorkUnitCount++;
    else resolvedMinutes += adoptedMinutes;
    return { key, memberLineItemIds, status: adoptedMinutes === null ? "UNRESOLVED" as const : "RESOLVED" as const,
      condition, standard, attempts, adoptedMinutes, adoptedReason, adoptedTier };
  });
  const noStructuredLabor = structuredLaborLineCount === 0;
  const complete = !noStructuredLabor && unresolvedWorkUnitCount === 0 && unstructuredLaborLineCount === 0;
  return { repairId: repair.id, repairLearningMode: schedulerSetting.repairLearningMode, lines, workUnits,
    structuredLaborLineCount, logicalWorkUnitCount: workUnits.length, unstructuredLaborLineCount,
    unresolvedWorkUnitCount, resolvedMinutes,
    previewStatus: noStructuredLabor ? "NO_STRUCTURED_LABOR" as const :
      complete ? "COMPLETE" as const : "INCOMPLETE" as const,
    complete, estimatedTotalMinutes: complete ? resolvedMinutes : null,
    notApplied: ["COMPOSITE_WORK_REDUCTION", "ADDITIONAL_FUNCTIONS", "EXTERIOR_WORK_RISK_FACTOR"] as const };
}
