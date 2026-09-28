import type { Prisma } from "@prisma/client";
import type { RepairScheduleInput } from "./repair-schedule";

export class ScheduleSummaryConflictError extends Error {}
export class RepairScheduleNotFoundError extends Error {}

export async function updateRepairSchedule(tx: Prisma.TransactionClient, repairId: number,
  input: RepairScheduleInput) {
  const current = await tx.repair.findUnique({
    where: { id: repairId }, select: { scheduledDate: true },
  });
  if (!current) throw new RepairScheduleNotFoundError();

  const segment = await tx.repairScheduleSegment.findFirst({
    where: { repairId }, select: { id: true },
  });
  const dateChanged = current.scheduledDate?.toISOString().slice(0, 10) !==
    input.scheduledDate?.toISOString().slice(0, 10);
  if (segment && dateChanged) {
    throw new ScheduleSummaryConflictError();
  }

  const { scheduledDate, ...otherFields } = input;
  const updated = await tx.repair.updateMany({
    where: {
      id: repairId, scheduledDate: current.scheduledDate,
      ...(dateChanged ? { scheduleSegments: { none: {} } } : {}),
    },
    data: segment ? otherFields : { ...otherFields, scheduledDate },
  });
  if (updated.count !== 1) throw new ScheduleSummaryConflictError();

  return tx.repair.findUniqueOrThrow({
    where: { id: repairId },
    select: {
      scheduledDate: true, estimatedWorkMinutes: true,
      deliveryDateExpected: true, scheduleLocked: true, priorityScore: true,
    },
  });
}
