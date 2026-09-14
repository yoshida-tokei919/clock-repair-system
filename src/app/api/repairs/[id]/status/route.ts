import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addConfirmedRepairStatusLog, reconcileRepairPartAllocations } from "@/lib/repair-part-allocation";
import { getRepairStatusTransition } from "@/lib/repair-status-transition";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const repairId = Number(params.id);
  const { status } = await req.json();

  if (!Number.isInteger(repairId) || typeof status !== "string") {
    return NextResponse.json({ error: "Invalid repair or status" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUniqueOrThrow({
      where: { id: repairId },
      select: { status: true },
    });

    // A manual status is only a requested state. Allocation and active orders
    // determine the persisted parts status in the same transaction.
    if (status !== repair.status) {
      await tx.repair.update({
        where: { id: repairId },
        data: { status, ...getRepairStatusTransition(repair.status, status) },
      });
    }
    const reconciliation = await reconcileRepairPartAllocations(tx, repairId, {
      requestedStatus: status,
    });
    await addConfirmedRepairStatusLog(tx, repairId, reconciliation.status);
    const updatedRepair = await tx.repair.findUniqueOrThrow({ where: { id: repairId } });
    return { repair: updatedRepair, warnings: [], reconciliation };
  });

  return NextResponse.json(result);
}
