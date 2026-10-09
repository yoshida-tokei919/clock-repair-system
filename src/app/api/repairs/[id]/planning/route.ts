import { requireAdminApi } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRepairPartsReadiness } from "@/lib/repair-parts-readiness";
import { parseRepairPlanningAction, planningStateView, RepairPlanningInputError } from "@/lib/repair-planning";
import { stopWorkTimeSessionInTransaction } from "@/lib/work-time-sessions";

export const dynamic = "force-dynamic";

function repairIdParam(id: string): number | null {
  const value = Number(id);
  return /^\d+$/.test(id) && Number.isSafeInteger(value) && value > 0 && value <= 2147483647 ? value : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const repairId = repairIdParam((await params).id);
  if (repairId === null) return NextResponse.json({ error: "Invalid repair ID" }, { status: 400 });
  try {
    const repair = await prisma.repair.findUnique({
      where: { id: repairId },
      select: {
        id: true, partsAllocationLegacy: true, planningState: true,
        estimate: { select: { items: { select: { type: true, partsMasterId: true, quantity: true } } } },
        partAllocations: { select: { partsMasterId: true, quantity: true, state: true } },
        orderRequests: { select: {
          repairId: true, partsMasterId: true, quantity: true, status: true,
          expectedArrivalDate: true, receivedAt: true,
        } },
      },
    });
    if (!repair) return NextResponse.json({ error: "Repair not found" }, { status: 404 });
    return NextResponse.json({
      planningState: planningStateView(repair.planningState),
      partsReadiness: resolveRepairPartsReadiness({
        repairId, partsAllocationLegacy: repair.partsAllocationLegacy,
        estimateItems: repair.estimate?.items ?? [], allocations: repair.partAllocations, orders: repair.orderRequests,
      }),
    });
  } catch (error) {
    console.error("Repair planning GET failed", error);
    return NextResponse.json({ error: "Repair planning could not be loaded" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const repairId = repairIdParam((await params).id);
  if (repairId === null) return NextResponse.json({ error: "Invalid repair ID" }, { status: 400 });
  let action;
  try {
    action = parseRepairPlanningAction(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof RepairPlanningInputError ? error.message : "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(async tx => {
      const repair = await tx.repair.findUnique({ where: { id: repairId }, select: { id: true } });
      if (!repair) return null;
      if (action.action === "block") {
        const stopped = await stopWorkTimeSessionInTransaction(tx, { repairId });
        const { action: _action, ...data } = action;
        const planningState = await tx.repairPlanningState.upsert({
          where: { repairId }, create: { repairId, blocked: true, ...data },
          update: { blocked: true, ...data },
        });
        return { planningState: planningStateView(planningState), timerStopped: stopped.stopped };
      }
      const planningState = await tx.repairPlanningState.findUnique({ where: { repairId } });
      if (!planningState) return { planningState: planningStateView(null), timerStopped: false };
      const updated = await tx.repairPlanningState.update({ where: { repairId }, data: {
        blocked: false, blockReason: null, blockReasonNote: null, resumeEligibleDate: null, reviewDate: null,
      } });
      return { planningState: planningStateView(updated), timerStopped: false };
    });
    if (!result) return NextResponse.json({ error: "Repair not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Repair planning POST failed", error);
    return NextResponse.json({ error: "Repair planning could not be saved" }, { status: 500 });
  }
}
