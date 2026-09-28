import type { Prisma } from "@prisma/client";
import { loadDeadlineCapacityPreview } from "./deadline-capacity-preview";
import type { PreviewDay, PreviewRepairAnalysis } from "./deadline-capacity-preview-domain";
import { todayInJapan } from "./simple-auto-scheduler";
import { serializeWorkDate } from "./work-calendar";

type Segment = { repairId: number; workDate: string; plannedMinutes: number };
type Metadata = { id: number; priorityScore: number; receptionDate: string | null };
export type TodaySection = "ready" | "resume" | "blocked" | "parts" | "status";
export type TodayWorkRow = {
  id: number; inquiryNumber: string; status: string; priorityScore: number;
  receptionDate: string | null; deliveryDateExpected: string | null;
  plannedMinutes: number; planSource: "segment" | "legacy";
  section: TodaySection; blocked: boolean; resumeEligibleDate: string | null;
  reviewDate: string | null; blockReason: string | null;
  partsReadinessState: PreviewRepairAnalysis["partsReadinessState"];
  partsReadyDate: string | null; overdue: boolean; deadlineConflict: boolean;
};

const TERMINAL = new Set(["作業完了", "納品済み", "キャンセル"]);
const compareNullable = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;

export function buildTodayWork(input: {
  today: string; day: Pick<PreviewDay, "grossCapacityMinutes" | "totalReservedMinutes" |
    "effectiveRepairCapacityMinutes" | "overReservedMinutes">;
  repairs: readonly PreviewRepairAnalysis[]; metadata: readonly Metadata[];
  segments: readonly Segment[];
  blockReasons?: ReadonlyMap<number, string | null>;
}) {
  const segmentsByRepair = new Map<number, Segment[]>();
  for (const segment of input.segments) {
    const rows = segmentsByRepair.get(segment.repairId) ?? [];
    rows.push(segment);
    segmentsByRepair.set(segment.repairId, rows);
  }
  const metadata = new Map(input.metadata.map(row => [row.id, row]));
  const rows: TodayWorkRow[] = [];
  for (const repair of input.repairs) {
    if (TERMINAL.has(repair.status)) continue;
    const ownSegments = segmentsByRepair.get(repair.id) ?? [];
    const todaySegment = ownSegments.find(segment => segment.workDate === input.today);
    const legacy = ownSegments.length === 0 && repair.scheduledDate === input.today;
    if (!todaySegment && !legacy) continue;
    const plannedMinutes = todaySegment?.plannedMinutes ?? repair.workMinutes ?? 0;
    const meta = metadata.get(repair.id);
    if (!meta) throw new Error(`Today work metadata missing for repair ${repair.id}.`);
    const partsReady = repair.partsReadinessState === "READY" || repair.partsReadinessState === "NOT_REQUIRED";
    const section: TodaySection = !partsReady ? "parts" : repair.blocked
      ? repair.resumeEligibleDate !== null && repair.resumeEligibleDate <= input.today ? "resume" : "blocked"
      : plannedMinutes > 0 && (repair.status === "作業待ち" || repair.status === "作業中") ? "ready" : "status";
    rows.push({
      id: repair.id, inquiryNumber: repair.inquiryNumber, status: repair.status,
      priorityScore: meta.priorityScore, receptionDate: meta.receptionDate,
      deliveryDateExpected: repair.deliveryDateExpected,
      plannedMinutes, planSource: todaySegment ? "segment" : "legacy", section,
      blocked: repair.blocked, resumeEligibleDate: repair.resumeEligibleDate,
      reviewDate: repair.reviewDate, blockReason: input.blockReasons?.get(repair.id) ?? null,
      partsReadinessState: repair.partsReadinessState, partsReadyDate: repair.partsReadyDate,
      overdue: repair.deliveryDateExpected !== null && repair.deliveryDateExpected < input.today,
      deadlineConflict: repair.latestWorkCompletionDate !== null &&
        input.today > repair.latestWorkCompletionDate,
    });
  }
  rows.sort((a, b) => b.priorityScore - a.priorityScore
    || compareNullable(a.deliveryDateExpected, b.deliveryDateExpected)
    || compareNullable(a.receptionDate, b.receptionDate) || a.id - b.id);
  const plannedMinutes = rows.reduce((sum, row) => sum + row.plannedMinutes, 0);
  const effective = input.day.effectiveRepairCapacityMinutes;
  return {
    date: input.today, rows,
    capacity: {
      grossMinutes: input.day.grossCapacityMinutes,
      reservedMinutes: input.day.totalReservedMinutes,
      effectiveMinutes: effective,
      overReservedMinutes: input.day.overReservedMinutes,
      plannedMinutes, remainingMinutes: Math.max(0, effective - plannedMinutes),
      overbookedMinutes: Math.max(0, plannedMinutes - effective),
    },
  };
}

// A repeatable-read transaction keeps readiness, calendar, and canonical segments in one snapshot.
export async function loadTodayWork(tx: Prisma.TransactionClient, now = new Date()) {
  const today = todayInJapan(now);
  const [base, metadataRows, segmentRows] = await Promise.all([
    loadDeadlineCapacityPreview(tx, now),
    tx.repair.findMany({ orderBy: { id: "asc" }, select: {
      id: true, priorityScore: true, receptionDate: true,
      planningState: { select: { blockReason: true } },
    } }),
    tx.repairScheduleSegment.findMany({ orderBy: [{ repairId: "asc" }, { workDate: "asc" }], select: {
      repairId: true, workDate: true, plannedMinutes: true,
    } }),
  ]);
  const day = base.days[0];
  const blockReasons = new Map(metadataRows.map(row => [row.id, row.planningState?.blockReason ?? null]));
  return buildTodayWork({ today, day, repairs: base.repairs,
    metadata: metadataRows.map(row => ({ id: row.id, priorityScore: row.priorityScore,
      receptionDate: row.receptionDate?.toISOString() ?? null })),
    segments: segmentRows.map(row => ({ repairId: row.repairId,
      workDate: serializeWorkDate(row.workDate), plannedMinutes: row.plannedMinutes })),
    blockReasons });
}
