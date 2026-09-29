import type {
  RepairWorkType, SchedulerActivitySetting, SchedulerAggregationMethod,
  SchedulerSetting, WatchDriveType, WorkTimeActivityType,
} from "@prisma/client";

export type LearningSession = {
  activityType: WorkTimeActivityType;
  repairId: number | null;
  inquiryId: number | null;
  orderRequestId: number | null;
  contextSchemaVersion: number;
  contextSnapshot: unknown;
  startedAt: Date;
  endedAt: Date | null;
  invalidatedAt: Date | null;
};

export type RepairCondition = {
  repairType: RepairWorkType;
  repairWorkCategoryId: number;
  targetPartNameId: string | null;
  repairWorkActionId: number | null;
  detailLabel: string | null;
};

// These are matching dimensions, never components of a logical sample key.
export type RepairMatchingDimensions = {
  brandId: number | null;
  modelId: number | null;
  referenceId: number | null;
  caseReferenceId: number | null;
  movementCaliberId: number | null;
  baseMovementCaliberId: number | null;
  watchCaliberId: number | null;
  watchBaseCaliberId: number | null;
  driveType: WatchDriveType | null;
};

export type LogicalSample = {
  key: string;
  activityType: WorkTimeActivityType;
  condition: RepairCondition | null;
  matchingDimensions: RepairMatchingDimensions[];
  seconds: number;
  minutes: number;
  sampleEndedAt: Date;
  sessionCount: number;
};

export type SessionExclusionReason =
  | "ACTIVE" | "INVALIDATED" | "INVALID_INTERVAL" | "MISSING_ENTITY_ID"
  | "MISSING_REPAIR_CONDITION" | "UNSUPPORTED_CONTEXT_VERSION" | "UNSUPPORTED_ACTIVITY";
export type SampleExclusionReason = "OUTSIDE_LOOKBACK" | "IQR_OUTLIER";
export type AdoptedReason =
  | "ACTUAL_MEDIAN" | "ACTUAL_MEAN" | "ACTUAL_P80"
  | "MANUAL_STANDARD" | "STANDARD_INSUFFICIENT_SAMPLES"
  | "NO_STANDARD" | "UNSUPPORTED_ACTIVITY";

export type LearningResult = {
  activityType: WorkTimeActivityType;
  rawSampleCount: number;
  filteredOutSampleCount: number;
  usableSampleCount: number;
  excludedSampleCount: number;
  mean: number | null;
  median: number | null;
  p80: number | null;
  lookback: { primaryMonths: number; usedMonths: number; since: Date; through: Date; usedFallback: boolean };
  adoptedMinutes: number | null;
  adoptedReason: AdoptedReason;
  adoptedMethod: SchedulerAggregationMethod | null;
  manualStandardMinutes: number | null;
  dailyReservedMinutes: number | null;
  samples: LogicalSample[];
  sessionExclusions: Partial<Record<SessionExclusionReason, number>>;
  sampleExclusions: Partial<Record<SampleExclusionReason, number>>;
};

type LearningBaseInput = {
  sessions: readonly LearningSession[];
  schedulerSetting: Pick<SchedulerSetting,
    "repairLearningMode" | "repairLearningMinimumSamples" | "repairFullSampleThreshold" |
    "repairEarlyAggregationMethod" | "defaultAggregationMethod" | "repairLookbackMonths" | "repairOutlierMethod"> | null;
  activitySetting?: Pick<SchedulerActivitySetting,
    "activityType" | "manualStandardMinutes" | "dailyReservedMinutes" | "learningMode" |
    "aggregationMethod" | "lookbackMonths" | "fallbackLookbackMonths" | "minimumSamples"> | null;
  // The caller may supply an already selected standard. This resolver does not select
  // a RepairWorkTimeStandard among overlapping nullable conditions.
  standardMinutes?: number | null;
  matchingDimensions?: Partial<RepairMatchingDimensions>;
  // OR alternatives within one tier, applied after logical-sample grouping.
  matchingDimensionsAny?: readonly Partial<RepairMatchingDimensions>[];
  now: Date;
};

export type LearningInput = LearningBaseInput & (
  { activityType: "REPAIR"; repairCondition: RepairCondition } |
  { activityType: Exclude<WorkTimeActivityType, "REPAIR">; repairCondition?: never }
);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function id(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nullableId(value: unknown): number | null | undefined {
  return value === null ? null : id(value) ?? undefined;
}

export function normalizeDetailLabel(value: string | null): string | null {
  return value?.trim() || null;
}

function repairContext(session: LearningSession): { condition: RepairCondition; dimensions: RepairMatchingDimensions } | null {
  if (session.contextSchemaVersion !== 1) return null;
  const snapshot = record(session.contextSnapshot);
  const work = record(snapshot?.work);
  const repair = record(snapshot?.repair);
  if (!work || work.lineType !== "LABOR" || !repair ||
      (work.repairType !== "INTERNAL" && work.repairType !== "EXTERNAL") ||
      id(work.repairWorkCategoryId) === null ||
      nullableId(work.repairWorkActionId) === undefined ||
      (work.targetPartNameId !== null && typeof work.targetPartNameId !== "string") ||
      (work.detailLabel !== null && typeof work.detailLabel !== "string")) return null;
  const drive = repair.driveType;
  const dimensions: RepairMatchingDimensions = {
    brandId: id(repair.brandId), modelId: id(repair.modelId),
    referenceId: id(repair.referenceId), caseReferenceId: id(repair.caseReferenceId),
    movementCaliberId: id(repair.movementCaliberId),
    baseMovementCaliberId: id(repair.baseMovementCaliberId),
    watchCaliberId: id(repair.watchCaliberId), watchBaseCaliberId: id(repair.watchBaseCaliberId),
    driveType: drive === "QUARTZ" || drive === "MECHANICAL" || drive === "UNKNOWN" ? drive : null,
  };
  return { condition: {
    repairType: work.repairType,
    repairWorkCategoryId: work.repairWorkCategoryId as number,
    targetPartNameId: work.targetPartNameId as string | null,
    repairWorkActionId: work.repairWorkActionId as number | null,
    detailLabel: normalizeDetailLabel(work.detailLabel as string | null),
  }, dimensions };
}

function increment<K extends string>(counts: Partial<Record<K, number>>, reason: K) {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

export function conditionKey(condition: RepairCondition): string {
  return JSON.stringify([condition.repairType, condition.repairWorkCategoryId,
    condition.targetPartNameId, condition.repairWorkActionId, normalizeDetailLabel(condition.detailLabel)]);
}

function sameCondition(a: RepairCondition, b: RepairCondition): boolean {
  return conditionKey(a) === conditionKey(b);
}

function matchesDimensions(sample: LogicalSample, filter: Partial<RepairMatchingDimensions>): boolean {
  return sample.matchingDimensions.some(dimensions =>
    (Object.keys(filter) as (keyof RepairMatchingDimensions)[]).every(key => dimensions[key] === filter[key]));
}

function median(sorted: readonly number[]): number | null {
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function statistics(samples: readonly LogicalSample[]) {
  const sorted = samples.map(sample => sample.seconds).sort((a, b) => a - b);
  return {
    mean: sorted.length ? sorted.reduce((sum, seconds) => sum + seconds, 0) / sorted.length / 60 : null,
    median: median(sorted) === null ? null : median(sorted)! / 60,
    p80: sorted.length ? sorted[Math.ceil(sorted.length * 0.8) - 1] / 60 : null,
  };
}

function filterIqr(samples: readonly LogicalSample[]): LogicalSample[] {
  if (samples.length < 4) return [...samples];
  const sorted = samples.map(sample => sample.seconds).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  // Tukey hinges: include the middle observation in both halves for odd n.
  const q1 = median(sorted.slice(0, middle + (sorted.length % 2)))!;
  const q3 = median(sorted.slice(middle))!;
  const spread = q3 - q1;
  return samples.filter(sample => sample.seconds >= q1 - 1.5 * spread && sample.seconds <= q3 + 1.5 * spread);
}

export function monthsBefore(now: Date, months: number): Date {
  const result = new Date(now);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function resolveWorkTimeLearning(input: LearningInput): LearningResult {
  const { activityType, schedulerSetting, activitySetting, now } = input;
  if (activityType === "REPAIR") {
    const condition = record(input.repairCondition);
    if (!condition || (condition.repairType !== "INTERNAL" && condition.repairType !== "EXTERNAL") ||
        id(condition.repairWorkCategoryId) === null ||
        nullableId(condition.repairWorkActionId) === undefined ||
        (condition.targetPartNameId !== null && typeof condition.targetPartNameId !== "string") ||
        (condition.detailLabel !== null && typeof condition.detailLabel !== "string")) {
      throw new Error("A valid repairCondition is required for REPAIR learning.");
    }
  }
  if (!schedulerSetting) throw new Error("SchedulerSetting is missing.");
  if (activityType !== "REPAIR" && (!activitySetting || activitySetting.activityType !== activityType)) {
    throw new Error(`SchedulerActivitySetting is missing for ${activityType}.`);
  }
  if (Number.isNaN(now.getTime())) throw new Error("Invalid resolver time.");
  const setting = activityType === "REPAIR" ? null : activitySetting!;
  const primaryMonths = setting?.lookbackMonths ?? schedulerSetting.repairLookbackMonths;
  const fallbackMonths = setting?.fallbackLookbackMonths ?? null;
  const minimum = setting?.minimumSamples ?? schedulerSetting.repairLearningMinimumSamples;
  const outlierMethod = activityType === "REPAIR" ? schedulerSetting.repairOutlierMethod : "NONE";
  const standard = activityType === "REPAIR" ? input.standardMinutes ?? null : setting!.manualStandardMinutes;
  const sessionExclusions: LearningResult["sessionExclusions"] = {};
  const sampleExclusions: LearningResult["sampleExclusions"] = {};
  const grouped = new Map<string, LogicalSample>();
  const supported = ["REPAIR", "ESTIMATE", "INQUIRY", "PARTS_ORDER"].includes(activityType);

  for (const session of input.sessions) {
    if (session.activityType !== activityType) continue;
    let reason: SessionExclusionReason | null = null;
    if (session.invalidatedAt !== null) reason = "INVALIDATED";
    else if (session.endedAt === null) reason = "ACTIVE";
    else if (!Number.isFinite(session.startedAt.getTime()) || !Number.isFinite(session.endedAt.getTime()) ||
             session.endedAt < session.startedAt) reason = "INVALID_INTERVAL";
    else if (!supported) reason = "UNSUPPORTED_ACTIVITY";
    else if (session.contextSchemaVersion !== 1) reason = "UNSUPPORTED_CONTEXT_VERSION";
    if (reason) { increment(sessionExclusions, reason); continue; }

    let condition: RepairCondition | null = null;
    let dimensions: RepairMatchingDimensions | null = null;
    let entityId: number | null;
    if (activityType === "REPAIR") {
      entityId = id(session.repairId);
      const context = repairContext(session);
      if (!context) reason = "MISSING_REPAIR_CONDITION";
      else { condition = context.condition; dimensions = context.dimensions; }
    } else if (activityType === "ESTIMATE") entityId = id(session.repairId);
    else if (activityType === "INQUIRY") entityId = id(session.inquiryId);
    else entityId = id(session.orderRequestId);
    if (entityId === null) reason = "MISSING_ENTITY_ID";
    if (reason) { increment(sessionExclusions, reason); continue; }

    const key = JSON.stringify([activityType, entityId, condition ? conditionKey(condition) : null]);
    const existing = grouped.get(key);
    const seconds = (session.endedAt!.getTime() - session.startedAt.getTime()) / 1000;
    if (existing) {
      existing.seconds += seconds;
      existing.minutes = existing.seconds / 60;
      existing.sessionCount++;
      if (session.endedAt! > existing.sampleEndedAt) existing.sampleEndedAt = session.endedAt!;
      if (dimensions && !existing.matchingDimensions.some(item => JSON.stringify(item) === JSON.stringify(dimensions))) {
        existing.matchingDimensions.push(dimensions);
      }
    } else {
      grouped.set(key, { key, activityType, condition, matchingDimensions: dimensions ? [dimensions] : [],
        seconds, minutes: seconds / 60, sampleEndedAt: session.endedAt!, sessionCount: 1 });
    }
  }

  const candidates = Array.from(grouped.values()).filter(sample => {
    if (input.repairCondition && (!sample.condition || !sameCondition(sample.condition, input.repairCondition))) {
      return false;
    }
    if (input.matchingDimensions && !matchesDimensions(sample, input.matchingDimensions)) {
      return false;
    }
    if (input.matchingDimensionsAny && !input.matchingDimensionsAny.some(filter => matchesDimensions(sample, filter))) {
      return false;
    }
    return true;
  });
  const windowSamples = (months: number) => {
    const since = monthsBefore(now, months);
    return candidates.filter(sample => sample.sampleEndedAt >= since && sample.sampleEndedAt <= now);
  };
  let usedMonths = primaryMonths;
  let window = windowSamples(usedMonths);
  let usable = outlierMethod === "IQR" ? filterIqr(window) : window;
  if (fallbackMonths !== null && usable.length < minimum) {
    usedMonths = fallbackMonths;
    window = windowSamples(usedMonths);
    usable = outlierMethod === "IQR" ? filterIqr(window) : window;
  }
  incrementBy(sampleExclusions, "OUTSIDE_LOOKBACK", candidates.length - window.length);
  incrementBy(sampleExclusions, "IQR_OUTLIER", window.length - usable.length);
  const measures = statistics(usable);
  const learningMode = setting?.learningMode ?? schedulerSetting.repairLearningMode;
  let adoptedMinutes: number | null = standard;
  let adoptedReason: AdoptedReason = standard === null ? "NO_STANDARD" : "MANUAL_STANDARD";
  let adoptedMethod: SchedulerAggregationMethod | null = null;
  if (!supported && learningMode === "AUTO") {
    adoptedMinutes = null;
    adoptedReason = "UNSUPPORTED_ACTIVITY";
  }
  else if (supported && learningMode === "AUTO") {
    if (usable.length >= minimum) {
      adoptedMethod = activityType === "REPAIR"
        ? usable.length >= schedulerSetting.repairFullSampleThreshold
          ? schedulerSetting.defaultAggregationMethod : schedulerSetting.repairEarlyAggregationMethod
        : setting!.aggregationMethod;
      adoptedMinutes = adoptedMethod === "MEAN" ? measures.mean : adoptedMethod === "MEDIAN" ? measures.median : measures.p80;
      adoptedReason = `ACTUAL_${adoptedMethod}` as AdoptedReason;
    } else if (standard !== null) adoptedReason = "STANDARD_INSUFFICIENT_SAMPLES";
  }
  return { activityType, rawSampleCount: candidates.length,
    filteredOutSampleCount: grouped.size - candidates.length, usableSampleCount: usable.length,
    excludedSampleCount: candidates.length - usable.length, ...measures,
    lookback: { primaryMonths, usedMonths, since: monthsBefore(now, usedMonths), through: now,
      usedFallback: usedMonths !== primaryMonths },
    adoptedMinutes, adoptedReason, adoptedMethod, manualStandardMinutes: standard,
    dailyReservedMinutes: setting?.dailyReservedMinutes ?? null, samples: usable,
    sessionExclusions, sampleExclusions };
}

function incrementBy<K extends string>(counts: Partial<Record<K, number>>, reason: K, amount: number) {
  if (amount) counts[reason] = amount;
}
