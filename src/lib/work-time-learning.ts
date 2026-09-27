import type { PrismaClient, WorkTimeActivityType } from "@prisma/client";
import { resolveWorkTimeLearning, type LearningInput } from "@/lib/work-time-learning-domain";

export type WorkTimeLearningQuery = LearningInput extends infer Input
  ? Input extends LearningInput
    ? Omit<Input, "sessions" | "schedulerSetting" | "activitySetting" | "now"> & { now?: Date }
    : never
  : never;

// Fetch the full history: filtering sessions by date before grouping would lose
// older seconds belonging to an in-window logical sample.
export async function getWorkTimeLearning(db: PrismaClient, query: WorkTimeLearningQuery) {
  const [schedulerSetting, activitySetting, sessions] = await Promise.all([
    db.schedulerSetting.findUnique({ where: { id: 1 } }),
    query.activityType === "REPAIR" ? Promise.resolve(null) :
      db.schedulerActivitySetting.findUnique({ where: { activityType: query.activityType as WorkTimeActivityType } }),
    db.workTimeSession.findMany({
      where: { activityType: query.activityType },
      select: { activityType: true, repairId: true, inquiryId: true, orderRequestId: true,
        contextSchemaVersion: true, contextSnapshot: true, startedAt: true, endedAt: true, invalidatedAt: true },
    }),
  ]);
  return resolveWorkTimeLearning({ ...query, now: query.now ?? new Date(),
    schedulerSetting, activitySetting, sessions });
}
