import type { Prisma } from "@prisma/client";
import { scheduleRevision } from "./auto-schedule-revision";
import { loadDeadlineCapacityPreview } from "./deadline-capacity-preview";
import { resolveSchedulerV2Planner, SCHEDULER_V2_PLANNER_VERSION } from "./scheduler-v2-planner-domain";
import { serializeWorkDate } from "./work-calendar";

type SegmentRow = { id: number; repairId: number; workDate: Date; plannedMinutes: number;
  source: "AUTO" | "MANUAL"; sortOrder: number; updatedAt: Date };

export function schedulerV2SnapshotRevision(input: { plannerVersion: string;
  deadlineCapacitySnapshotRevision: string; metadata: unknown; segments: unknown }) {
  return scheduleRevision(input);
}

// The caller supplies the same repeatable-read transaction for all three reads.
export async function loadSchedulerV2Preview(tx: Prisma.TransactionClient, now = new Date()) {
  const [base, metadataRows, segmentRows] = await Promise.all([
    loadDeadlineCapacityPreview(tx, now),
    tx.repair.findMany({ orderBy: { id: "asc" }, select: {
      id: true, priorityScore: true, receptionDate: true,
    } }),
    // Task193A's generated client can lag the schema in a local checkout; production build regenerates it.
    (tx as unknown as { repairScheduleSegment: { findMany(args: unknown): Promise<SegmentRow[]> } })
      .repairScheduleSegment.findMany({ orderBy: [{ repairId: "asc" }, { workDate: "asc" }], select: {
      id: true, repairId: true, workDate: true, plannedMinutes: true, source: true,
      sortOrder: true, updatedAt: true,
    } }),
  ]);
  const metadata = metadataRows.map(row => ({ id: row.id, priorityScore: row.priorityScore,
    receptionDate: row.receptionDate ? row.receptionDate.toISOString() : null }));
  const currentSegments = segmentRows.map(row => ({ id: row.id, repairId: row.repairId,
    workDate: serializeWorkDate(row.workDate), plannedMinutes: row.plannedMinutes,
    source: row.source, sortOrder: row.sortOrder }));
  const planned = resolveSchedulerV2Planner({ repairs: base.repairs, days: base.days,
    metadata, currentSegments });
  const snapshotRevision = schedulerV2SnapshotRevision({ plannerVersion: SCHEDULER_V2_PLANNER_VERSION,
    deadlineCapacitySnapshotRevision: base.snapshotRevision, metadata: metadataRows,
    segments: segmentRows });
  return { plannerVersion: SCHEDULER_V2_PLANNER_VERSION, snapshotRevision,
    asOfDate: base.asOfDate, horizonEndDate: base.horizonEndDate, ...planned };
}
