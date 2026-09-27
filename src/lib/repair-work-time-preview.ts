import type { PrismaClient } from "@prisma/client";
import { resolveRepairWorkTimePreview } from "@/lib/repair-work-time-preview-domain";

// All queries are reads. The full session history is required before Task190B
// groups split sessions into logical samples and applies the lookback window.
export async function getRepairWorkTimePreview(db: PrismaClient, repairId: number, now = new Date()) {
  const repair = await db.repair.findUnique({ where: { id: repairId }, select: {
    id: true, movementCaliberId: true, baseMovementCaliberId: true,
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
    db.schedulerSetting.findUnique({ where: { id: 1 } }),
    db.repairWorkTimeStandard.findMany({ select: { id: true, repairType: true, categoryId: true,
      targetPartNameId: true, actionId: true, detailLabel: true, driveType: true, standardMinutes: true } }),
    db.workTimeSession.findMany({ where: { activityType: "REPAIR" }, select: {
      activityType: true, repairId: true, inquiryId: true, orderRequestId: true,
      contextSchemaVersion: true, contextSnapshot: true, startedAt: true, endedAt: true, invalidatedAt: true,
    } }),
  ]);
  return resolveRepairWorkTimePreview({ repair, schedulerSetting, standards, sessions, now });
}
