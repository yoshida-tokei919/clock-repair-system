import type { Prisma } from "@prisma/client";
import { resolveRepairWorkTimePreview } from "./repair-work-time-preview-domain";
import { roundedPreviewMinutes } from "./repair-work-time-preview";

type WorkTimePreview = ReturnType<typeof resolveRepairWorkTimePreview>;

export function resolveSchedulerV2WorkTimeFeedback(preview: WorkTimePreview,
  currentEstimatedWorkMinutes: number) {
  const rounded = roundedPreviewMinutes(preview);
  const recommendedEstimatedWorkMinutes = rounded !== null && Number.isSafeInteger(rounded) &&
    rounded > 0 && rounded <= 2147483647 ? rounded : null;
  return {
    currentEstimatedWorkMinutes,
    recommendedEstimatedWorkMinutes,
    deltaMinutes: recommendedEstimatedWorkMinutes === null ? null :
      recommendedEstimatedWorkMinutes - currentEstimatedWorkMinutes,
    status: recommendedEstimatedWorkMinutes === null ? "UNAVAILABLE" as const :
      recommendedEstimatedWorkMinutes === currentEstimatedWorkMinutes ? "UP_TO_DATE" as const :
        "RECOMMENDED_CHANGE" as const,
    previewStatus: preview.previewStatus,
    evidence: preview.workUnits.map(unit => {
      const adoptedAttempt = unit.adoptedTier === null ? null :
        unit.attempts.find(attempt => attempt.tier === unit.adoptedTier &&
          attempt.adoptedReason === unit.adoptedReason);
      return { adoptedReason: unit.adoptedReason, adoptedTier: unit.adoptedTier,
        usableSampleCount: adoptedAttempt?.usableSampleCount ?? null };
    }),
  };
}

// Use the same selected inputs and full REPAIR session history as Task190's per-Repair preview.
// One query per source covers all preview repairs; no feedback input enters the schedule revision.
export async function loadSchedulerV2WorkTimeFeedback(tx: Prisma.TransactionClient,
  repairIds: number[], now: Date) {
  if (repairIds.length === 0) return {};
  const [repairs, schedulerSetting, standards, sessions] = await Promise.all([
    tx.repair.findMany({ where: { id: { in: repairIds } }, orderBy: { id: "asc" }, select: {
      id: true, estimatedWorkMinutes: true, movementCaliberId: true, baseMovementCaliberId: true,
      watch: { select: { brandId: true, modelId: true, referenceId: true, caseReferenceId: true,
        caliberId: true, baseCaliberId: true, driveType: true } },
      repairLineItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: {
        id: true, lineType: true, repairWorkCategoryId: true,
        repairWorkCategory: { select: { repairType: true } },
        targetPartNameId: true, repairWorkActionId: true, detailLabelSnapshot: true,
      } },
    } }),
    tx.schedulerSetting.findUnique({ where: { id: 1 }, select: {
      repairLearningMode: true, repairLearningMinimumSamples: true,
      repairFullSampleThreshold: true, repairEarlyAggregationMethod: true,
      defaultAggregationMethod: true, repairLookbackMonths: true, repairOutlierMethod: true,
    } }),
    tx.repairWorkTimeStandard.findMany({ orderBy: { id: "asc" }, select: {
      id: true, repairType: true, categoryId: true, targetPartNameId: true,
      actionId: true, detailLabel: true, driveType: true, standardMinutes: true,
    } }),
    tx.workTimeSession.findMany({ where: { activityType: "REPAIR" }, orderBy: { id: "asc" }, select: {
      activityType: true, repairId: true, inquiryId: true, orderRequestId: true,
      contextSchemaVersion: true, contextSnapshot: true, startedAt: true, endedAt: true, invalidatedAt: true,
    } }),
  ]);
  if (!schedulerSetting) throw new Error("SchedulerSetting is missing.");
  return Object.fromEntries(repairs.map(repair => [repair.id,
    resolveSchedulerV2WorkTimeFeedback(resolveRepairWorkTimePreview({
      repair, schedulerSetting, standards, sessions, now,
    }), repair.estimatedWorkMinutes)]));
}
