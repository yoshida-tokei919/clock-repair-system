import type { PrismaClient } from "@prisma/client";

export type DeadlineFeedbackReadiness = {
  currentBuffers: {
    runningTestDays: number | null;
    reworkBufferDays: number | null;
    shippingBufferDays: number | null;
  };
  repairCounts: {
    total: number;
    expectedDeliveryDate: number;
    actualDeliveryDate: number;
    bothDeliveryDates: number;
  };
};

export async function loadDeadlineFeedbackReadiness(db: PrismaClient): Promise<DeadlineFeedbackReadiness> {
  const [setting, total, expectedDeliveryDate, actualDeliveryDate, bothDeliveryDates] = await Promise.all([
    db.schedulerSetting.findUnique({ where: { id: 1 }, select: {
      runningTestDays: true, reworkBufferDays: true, shippingBufferDays: true,
    } }),
    db.repair.count(),
    db.repair.count({ where: { deliveryDateExpected: { not: null } } }),
    db.repair.count({ where: { deliveryDateActual: { not: null } } }),
    db.repair.count({ where: {
      deliveryDateExpected: { not: null }, deliveryDateActual: { not: null },
    } }),
  ]);
  if (!setting) throw new Error("SchedulerSetting(id=1) is missing.");
  return { currentBuffers: setting, repairCounts: {
    total, expectedDeliveryDate, actualDeliveryDate, bothDeliveryDates,
  } };
}
