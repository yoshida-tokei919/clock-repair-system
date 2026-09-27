import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { resolveRepairWorkTimePreview } from "@/lib/repair-work-time-preview-domain";

type PreviewDb = Pick<Prisma.TransactionClient, "repair" | "schedulerSetting" |
  "repairWorkTimeStandard" | "workTimeSession">;

function revisionFor(inputs: unknown, preview: unknown): string {
  // The resolver's lookback.since/through are calculated from `now`. Its
  // counts, exclusions, and adopted result still change when membership does.
  return createHash("sha256").update(JSON.stringify(inputs)).update("\n")
    .update(JSON.stringify(preview, (key, value) =>
      key === "since" || key === "through" ? undefined : value)).digest("hex");
}

export function roundedPreviewMinutes(preview: { complete: boolean; estimatedTotalMinutes: number | null }) {
  return preview.complete && preview.estimatedTotalMinutes !== null
    ? Math.round(preview.estimatedTotalMinutes) : null;
}

// All queries are reads. The full session history is required before Task190B
// groups split sessions into logical samples and applies the lookback window.
export async function getRepairWorkTimePreview(db: PreviewDb, repairId: number, now = new Date()) {
  const repair = await db.repair.findUnique({ where: { id: repairId }, select: {
    id: true, estimatedWorkMinutes: true, movementCaliberId: true, baseMovementCaliberId: true,
    watch: { select: { brandId: true, modelId: true, referenceId: true, caseReferenceId: true,
      caliberId: true, baseCaliberId: true, driveType: true } },
    repairLineItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: {
      id: true, lineType: true, repairWorkCategoryId: true,
      repairWorkCategory: { select: { repairType: true } },
      targetPartNameId: true, repairWorkActionId: true, detailLabelSnapshot: true,
    } },
  } });
  if (!repair) return null;
  const [schedulerSetting, standards, sessions] = await Promise.all([
    db.schedulerSetting.findUnique({ where: { id: 1 }, select: {
      repairLearningMode: true, repairLearningMinimumSamples: true,
      repairFullSampleThreshold: true, repairEarlyAggregationMethod: true,
      defaultAggregationMethod: true, repairLookbackMonths: true, repairOutlierMethod: true,
    } }),
    db.repairWorkTimeStandard.findMany({ orderBy: { id: "asc" }, select: { id: true, repairType: true, categoryId: true,
      targetPartNameId: true, actionId: true, detailLabel: true, driveType: true, standardMinutes: true } }),
    db.workTimeSession.findMany({ where: { activityType: "REPAIR" }, orderBy: { id: "asc" }, select: {
      activityType: true, repairId: true, inquiryId: true, orderRequestId: true,
      contextSchemaVersion: true, contextSnapshot: true, startedAt: true, endedAt: true, invalidatedAt: true,
    } }),
  ]);
  const preview = resolveRepairWorkTimePreview({ repair, schedulerSetting, standards, sessions, now });
  const roundedEstimatedWorkMinutes = roundedPreviewMinutes(preview);
  return { ...preview, currentEstimatedWorkMinutes: repair.estimatedWorkMinutes,
    roundedEstimatedWorkMinutes,
    revision: revisionFor({ repair, schedulerSetting, standards, sessions }, preview) };
}
