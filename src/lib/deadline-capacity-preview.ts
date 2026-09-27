import type { Prisma } from "@prisma/client";
import { scheduleRevision } from "./auto-schedule-revision";
import { resolveDeadlineCapacityPreview, type PreviewRepair } from "./deadline-capacity-preview-domain";
import { resolveRepairPartsReadiness } from "./repair-parts-readiness";
import { SCHEDULE_HORIZON_DAYS, todayInJapan } from "./simple-auto-scheduler";
import { parseWorkDate, serializeWorkDate } from "./work-calendar";

const date = (value: Date | null) => value ? serializeWorkDate(value) : null;

export function deadlineCapacitySnapshotRevision(snapshot: unknown): string {
  return scheduleRevision(snapshot);
}

// The caller provides a repeatable-read transaction so every source belongs to one snapshot.
export async function loadDeadlineCapacityPreview(tx: Prisma.TransactionClient, now = new Date()) {
  const asOfDate = todayInJapan(now);
  const end = parseWorkDate(asOfDate);
  end.setUTCDate(end.getUTCDate() + SCHEDULE_HORIZON_DAYS);
  const [repairs, workCalendar, schedulerSetting, activitySettings] = await Promise.all([
    tx.repair.findMany({ orderBy: { id: "asc" }, select: {
      id: true, inquiryNumber: true, status: true, scheduledDate: true, scheduleLocked: true,
      estimatedWorkMinutes: true, deliveryDateExpected: true, partsAllocationLegacy: true,
      updatedAt: true,
      planningState: { select: { blocked: true, blockReason: true, blockReasonNote: true,
        remainingWorkMinutes: true, resumeEligibleDate: true, reviewDate: true, updatedAt: true } },
      estimate: { select: { items: { orderBy: { id: "asc" }, select: {
        id: true, type: true, partsMasterId: true, quantity: true,
      } } } },
      partAllocations: { orderBy: { id: "asc" }, select: {
        id: true, partsMasterId: true, quantity: true, state: true, updatedAt: true,
      } },
      orderRequests: { orderBy: { id: "asc" }, select: {
        id: true, repairId: true, partsMasterId: true, quantity: true, status: true,
        expectedArrivalDate: true, receivedAt: true, updatedAt: true,
      } },
    } }),
    tx.workCalendar.findMany({ where: { workDate: { gte: parseWorkDate(asOfDate), lt: end } },
      orderBy: { workDate: "asc" }, select: { workDate: true, availableMinutes: true, note: true, updatedAt: true } }),
    tx.schedulerSetting.findUnique({ where: { id: 1 }, select: {
      dailyScheduleReviewMinutes: true, runningTestDays: true, reworkBufferDays: true,
      shippingBufferDays: true, updatedAt: true,
    } }),
    tx.schedulerActivitySetting.findMany({ orderBy: { activityType: "asc" }, select: {
      activityType: true, dailyReservedMinutes: true, updatedAt: true,
    } }),
  ]);
  if (!schedulerSetting) throw new Error("SchedulerSetting(id=1) is missing.");
  const derivedRepairs: PreviewRepair[] = repairs.map(repair => {
    const readiness = resolveRepairPartsReadiness({
      repairId: repair.id, partsAllocationLegacy: repair.partsAllocationLegacy,
      estimateItems: repair.estimate?.items ?? [], allocations: repair.partAllocations,
      orders: repair.orderRequests,
    });
    return {
      id: repair.id, inquiryNumber: repair.inquiryNumber, status: repair.status,
      scheduledDate: date(repair.scheduledDate), scheduleLocked: repair.scheduleLocked,
      estimatedWorkMinutes: repair.estimatedWorkMinutes,
      remainingWorkMinutes: repair.planningState?.remainingWorkMinutes ?? null,
      deliveryDateExpected: date(repair.deliveryDateExpected),
      partsReadinessState: readiness.state, partsReadyDate: readiness.partsReadyDate,
      blocked: repair.planningState?.blocked ?? false,
      resumeEligibleDate: date(repair.planningState?.resumeEligibleDate ?? null),
      reviewDate: date(repair.planningState?.reviewDate ?? null),
    };
  });
  const preview = resolveDeadlineCapacityPreview({ asOfDate, repairs: derivedRepairs,
    workCalendar, settings: {
      dailyScheduleReviewMinutes: schedulerSetting.dailyScheduleReviewMinutes,
      activityReservedMinutes: activitySettings.reduce((sum, row) => sum + row.dailyReservedMinutes, 0),
      runningTestDays: schedulerSetting.runningTestDays,
      reworkBufferDays: schedulerSetting.reworkBufferDays,
      shippingBufferDays: schedulerSetting.shippingBufferDays,
    } });
  // Informational only. Task193 can define a separate apply token and stale check.
  const snapshotRevision = deadlineCapacitySnapshotRevision({ asOfDate, workCalendar, schedulerSetting,
    activitySettings, repairs, derivedRepairs });
  return { ...preview, snapshotRevision };
}
