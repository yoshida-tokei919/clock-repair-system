import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleRevision } from "@/lib/auto-schedule-revision";
import { buildSchedulePreview, SCHEDULE_HORIZON_DAYS, todayInJapan } from "@/lib/simple-auto-scheduler";
import { parseWorkDate } from "@/lib/work-calendar";
import { resolveRepairPartsReadiness } from "@/lib/repair-parts-readiness";

export const dynamic = "force-dynamic";

async function loadSchedule(tx: Prisma.TransactionClient, startDate: string) {
  const start = parseWorkDate(startDate);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + SCHEDULE_HORIZON_DAYS);
  const [repairs, exceptions] = await Promise.all([
    tx.repair.findMany({
      select: {
        id: true, inquiryNumber: true, status: true, scheduleLocked: true,
        scheduledDate: true, estimatedWorkMinutes: true, priorityScore: true,
        deliveryDateExpected: true, receptionDate: true, updatedAt: true,
        partsAllocationLegacy: true,
        planningState: { select: { blocked: true, updatedAt: true } },
        estimate: { select: { items: {
          select: { id: true, type: true, partsMasterId: true, quantity: true },
          orderBy: { id: "asc" },
        } } },
        partAllocations: {
          select: { id: true, partsMasterId: true, quantity: true, state: true, updatedAt: true },
          orderBy: { id: "asc" },
        },
        orderRequests: {
          select: {
            id: true, repairId: true, partsMasterId: true, quantity: true, status: true,
            expectedArrivalDate: true, receivedAt: true, updatedAt: true,
          },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { id: "asc" },
    }),
    tx.workCalendar.findMany({
      where: { workDate: { gte: start, lt: end } },
      select: { workDate: true, availableMinutes: true, note: true, updatedAt: true },
      orderBy: { workDate: "asc" },
    }),
  ]);
  const scheduleRepairs = repairs.map(repair => ({
    id: repair.id, inquiryNumber: repair.inquiryNumber, status: repair.status,
    scheduleLocked: repair.scheduleLocked, scheduledDate: repair.scheduledDate,
    estimatedWorkMinutes: repair.estimatedWorkMinutes, priorityScore: repair.priorityScore,
    deliveryDateExpected: repair.deliveryDateExpected, receptionDate: repair.receptionDate,
    planningBlocked: repair.planningState?.blocked ?? false,
    partsReadinessState: resolveRepairPartsReadiness({
      repairId: repair.id, partsAllocationLegacy: repair.partsAllocationLegacy,
      estimateItems: repair.estimate?.items ?? [], allocations: repair.partAllocations,
      orders: repair.orderRequests,
    }).state,
  }));
  const preview = buildSchedulePreview(startDate, scheduleRepairs, exceptions);
  const schedulerEligibility = scheduleRepairs.map(({ id, planningBlocked, partsReadinessState }) => ({
    id, planningBlocked, partsReadinessState,
  }));
  const revision = scheduleRevision({ startDate, repairs, schedulerEligibility, exceptions });
  return { preview, revision };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const startDate = todayInJapan(new Date());
  const result = await prisma.$transaction(tx => loadSchedule(tx, startDate), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
  return NextResponse.json(result);
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "旧自動スケジューラーの反映は終了しました。Scheduler v2 分割予定案を確認して反映してください。" }, { status: 409 });
}
