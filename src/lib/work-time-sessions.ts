import { Prisma, PrismaClient, WorkTimeActivityType } from "@prisma/client";
import {
  closedAt,
  correctionData,
  isActive,
  repairSnapshot,
  secondPrecision,
  StartInput,
  WorkTimeInputError,
  workLabel,
  workSnapshot,
} from "@/lib/work-time-session-domain";

// LINE inquiry locks use namespace 726001. The timer has one global key.
export const WORK_TIME_ADVISORY_LOCK_NAMESPACE = 726_188;
const WORK_TIME_ADVISORY_LOCK_KEY = 1;
const activeWhere = { endedAt: null, invalidatedAt: null } as const;

async function lockTimer(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      ${WORK_TIME_ADVISORY_LOCK_NAMESPACE}::int,
      ${WORK_TIME_ADVISORY_LOCK_KEY}::int
    )
  `;
}

export async function getActiveWorkTimeSession(db: PrismaClient) {
  return db.workTimeSession.findFirst({ where: activeWhere });
}

const repairSelect = {
  inquiryNumber: true,
  movementMakerId: true,
  movementMaker: { select: { name: true } },
  movementCaliberId: true,
  movementCaliber: { select: { name: true } },
  baseMovementMakerId: true,
  baseMovementMaker: { select: { name: true } },
  baseMovementCaliberId: true,
  baseMovementCaliber: { select: { name: true } },
  watchId: true,
  watch: { select: {
    brandId: true, brand: { select: { name: true } },
    modelId: true, model: { select: { name: true } },
    referenceId: true, reference: { select: { name: true } },
    caseReferenceId: true, caseReference: { select: { name: true } },
    caliberId: true, caliber: { select: { name: true } },
    baseCaliberId: true, baseCaliber: { select: { name: true } },
    driveType: true,
  } },
} satisfies Prisma.RepairSelect;

const lineSelect = {
  lineType: true,
  itemNameSnapshot: true,
  estimateDisplayNameSnapshot: true,
  repairWorkCategoryId: true,
  categoryNameSnapshot: true,
  repairWorkCategory: { select: { repairType: true, displayName: true } },
  targetPartNameId: true,
  targetPartNameSnapshot: true,
  targetPartName: { select: { nameJa: true } },
  repairWorkActionId: true,
  actionNameSnapshot: true,
  repairWorkAction: { select: { displayName: true } },
  detailLabelSnapshot: true,
} satisfies Prisma.RepairLineItemSelect;

export async function startWorkTimeSession(db: PrismaClient, input: StartInput) {
  const [repair, inquiry, orderRequest, line] = await Promise.all([
    input.repairId ? db.repair.findUnique({ where: { id: input.repairId }, select: repairSelect }) : null,
    input.inquiryId ? db.inquiry.findUnique({ where: { id: input.inquiryId }, select: { id: true } }) : null,
    input.orderRequestId ? db.orderRequest.findUnique({ where: { id: input.orderRequestId }, select: { repairId: true } }) : null,
    input.repairLineItemId ? db.repairLineItem.findFirst({
      where: { id: input.repairLineItemId, repairId: input.repairId! }, select: lineSelect,
    }) : null,
  ]);
  if (input.repairId && !repair) throw new WorkTimeInputError("repairId does not exist.");
  if (input.inquiryId && !inquiry) throw new WorkTimeInputError("inquiryId does not exist.");
  if (input.orderRequestId && !orderRequest) throw new WorkTimeInputError("orderRequestId does not exist.");
  if (input.repairLineItemId && !line) throw new WorkTimeInputError("repairLineItemId does not belong to repairId.");
  if (orderRequest && input.repairId && orderRequest.repairId !== input.repairId) {
    throw new WorkTimeInputError("orderRequestId belongs to a different repair.");
  }
  const snapshot = repair || line ? {
    ...(repair ? { repair: repairSnapshot(repair) } : {}),
    ...(line ? { work: workSnapshot(line) } : {}),
  } : null;
  const label = line ? workLabel(line) : input.label;

  return db.$transaction(async tx => {
    await lockTimer(tx);
    const active = await tx.workTimeSession.findFirst({ where: activeWhere });
    const now = secondPrecision(new Date());
    const startedAt = active ? closedAt(active.startedAt, now) : now;
    if (active) {
      await tx.workTimeSession.update({ where: { id: active.id }, data: { endedAt: startedAt } });
    }
    return tx.workTimeSession.create({ data: {
      activityType: input.activityType as WorkTimeActivityType,
      repairId: input.repairId,
      inquiryId: input.inquiryId,
      orderRequestId: input.orderRequestId,
      workLabelSnapshot: label,
      contextSchemaVersion: 1,
      contextSnapshot: snapshot ? snapshot as Prisma.InputJsonValue : Prisma.JsonNull,
      startedAt,
    } });
  });
}

export async function stopWorkTimeSession(db: PrismaClient) {
  return db.$transaction(async tx => {
    await lockTimer(tx);
    const active = await tx.workTimeSession.findFirst({ where: activeWhere });
    if (!active) return { stopped: false, session: null };
    const session = await tx.workTimeSession.update({
      where: { id: active.id }, data: { endedAt: closedAt(active.startedAt, new Date()) },
    });
    return { stopped: true, session };
  });
}

export async function correctWorkTimeSession(
  db: PrismaClient, id: number, input: { startedAt: Date; endedAt: Date; reason: string },
) {
  return db.$transaction(async tx => {
    await lockTimer(tx);
    const current = await tx.workTimeSession.findUnique({ where: { id } });
    if (!current) return null;
    const data = correctionData(current, input, new Date());
    return tx.workTimeSession.update({ where: { id }, data });
  });
}

export async function invalidateWorkTimeSession(db: PrismaClient, id: number, reason: string) {
  return db.$transaction(async tx => {
    await lockTimer(tx);
    const current = await tx.workTimeSession.findUnique({ where: { id } });
    if (!current) return null;
    if (current.invalidatedAt) return current;
    const now = secondPrecision(new Date());
    return tx.workTimeSession.update({ where: { id }, data: {
      invalidatedAt: now,
      invalidationReason: reason,
      ...(isActive(current) ? { endedAt: closedAt(current.startedAt, now) } : {}),
    } });
  });
}
