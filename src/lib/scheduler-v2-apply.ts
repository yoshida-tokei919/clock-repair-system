import { Prisma } from "@prisma/client";
import { assertScheduleRevision, StaleScheduleError } from "./auto-schedule-revision";
import { loadSchedulerV2Preview } from "./scheduler-v2-preview";
import { SCHEDULABLE_STATUS } from "./simple-auto-scheduler";
import { parseWorkDate } from "./work-calendar";

type Preview = Awaited<ReturnType<typeof loadSchedulerV2Preview>>;

export function parseSchedulerV2ApplyBody(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length !== 1 || !("revision" in body) ||
    typeof body.revision !== "string" || !/^[0-9a-f]{64}$/.test(body.revision)) {
    throw new Error("Invalid schedule revision.");
  }
  return body.revision;
}

export function isSchedulerV2ApplyConflict(error: unknown): boolean {
  return error instanceof StaleScheduleError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002"));
}

export async function applySchedulerV2Preview(tx: Prisma.TransactionClient,
  preview: Preview, revision: string) {
  assertScheduleRevision(revision, preview.snapshotRevision);
  let changedRepairs = 0;
  let createdSegments = 0;
  for (const repair of preview.repairs) {
    const action = repair.futureApplyAction;
    if (action === "PROTECTED" || action === "PRESERVE_UNPLACED" || action === "NO_CHANGE") continue;
    if (action !== "SUMMARY_ONLY_SYNC" && action !== "CREATE_AUTO" &&
      action !== "CREATE_FROM_LEGACY" && action !== "REPLACE_AUTO") {
      throw new Error(`Unknown Scheduler v2 apply action for repair ${repair.id}.`);
    }

    if (!repair.autoCandidate || repair.scheduleLocked ||
      repair.currentSegments.some(segment => segment.source === "MANUAL")) {
      throw new StaleScheduleError("予定が変更されました。再プレビューしてください。");
    }
    const createsSegments = action === "CREATE_AUTO" || action === "CREATE_FROM_LEGACY" ||
      action === "REPLACE_AUTO";
    const proposed = repair.proposedSegments;
    const dates = proposed.map(segment => segment.workDate).sort();
    if (proposed.length === 0 || proposed.some(segment => segment.repairId !== repair.id ||
      segment.source !== "AUTO" || !Number.isInteger(segment.plannedMinutes) ||
      segment.plannedMinutes <= 0 || !Number.isInteger(segment.sortOrder) || segment.sortOrder < 0) ||
      new Set(dates).size !== dates.length || repair.proposedSummaryDate !== dates[0] ||
      (action === "SUMMARY_ONLY_SYNC" && (repair.currentSegments.length === 0 ||
        repair.currentSegments.map(segment => segment.workDate).sort()[0] !== dates[0] ||
        repair.currentScheduledDate === dates[0])) ||
      (action === "CREATE_AUTO" && repair.currentScheduledDate !== null) ||
      (action === "CREATE_FROM_LEGACY" && repair.currentScheduledDate === null) ||
      (action === "REPLACE_AUTO" && repair.currentSegments.length === 0) ||
      (createsSegments && action !== "REPLACE_AUTO" && repair.currentSegments.length !== 0)) {
      throw new Error(`Invalid Scheduler v2 proposal for repair ${repair.id}.`);
    }
    const summaryDate = parseWorkDate(dates[0]);
    const guard = {
      id: repair.id, status: SCHEDULABLE_STATUS, scheduleLocked: false,
      scheduledDate: repair.currentScheduledDate ? parseWorkDate(repair.currentScheduledDate) : null,
      estimatedWorkMinutes: repair.estimatedWorkMinutes,
    };
    if (repair.currentScheduledDate === dates[0]) {
      const current = await tx.repair.findFirst({ where: guard, select: { id: true } });
      if (!current) throw new StaleScheduleError("予定が変更されました。再プレビューしてください。");
    } else {
      const updated = await tx.repair.updateMany({ where: guard, data: { scheduledDate: summaryDate } });
      if (updated.count !== 1) throw new StaleScheduleError("予定が変更されました。再プレビューしてください。");
    }

    if (action === "REPLACE_AUTO") {
      await tx.repairScheduleSegment.deleteMany({ where: { repairId: repair.id, source: "AUTO" } });
    }
    if (createsSegments) {
      await tx.repairScheduleSegment.createMany({ data: proposed.map(segment => ({
        repairId: repair.id, workDate: parseWorkDate(segment.workDate),
        plannedMinutes: segment.plannedMinutes, source: "AUTO", sortOrder: segment.sortOrder,
      })) });
      createdSegments += proposed.length;
    }
    changedRepairs++;
  }
  return { changedRepairs, createdSegments };
}

export async function applySchedulerV2Revision(tx: Prisma.TransactionClient, revision: string,
  now = new Date()) {
  const preview = await loadSchedulerV2Preview(tx, now);
  return applySchedulerV2Preview(tx, preview, revision);
}
