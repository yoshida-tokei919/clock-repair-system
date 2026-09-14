import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  addConfirmedRepairStatusLog,
  reconcileRepairPartAllocations,
  RepairPartAssignmentError,
  assertReceivedOrderCanBeAssigned,
  canAllocateRepairParts,
  shouldAllocateForOrderStatus,
  shouldReceiveOrderIntoStock,
  syncRepairPartsStatusFromActiveOrders,
} from "@/lib/repair-part-allocation";
import {
  canApplyPartsOrderStatus,
  getRepairStatusAfterOrderAssignment,
  getRepairStatusFromOrderStatuses,
  type RepairPartsOrderStatus,
} from "@/lib/repair-parts-status";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const orderId = Number(params.id);
  const { status } = await req.json();

  if (!Number.isInteger(orderId) || typeof status !== "string") {
    return NextResponse.json({ error: "Invalid order or status" }, { status: 400 });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const previous = await tx.orderRequest.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true, repairId: true, partsMasterId: true, quantity: true },
      });
      if (shouldAllocateForOrderStatus(status)) {
        if (previous.status !== "received") {
          throw new RepairPartAssignmentError("案件へ割当できません。入荷済みの発注だけを割り当てできます。");
        }
        if (!previous.repairId || !previous.partsMasterId) {
          throw new RepairPartAssignmentError("案件へ割当できません。案件または部品の情報が不足しています。");
        }
        const repair = await tx.repair.findUniqueOrThrow({
          where: { id: previous.repairId },
          select: { status: true, approvalStatus: true, partsAllocationLegacy: true, customer: { select: { type: true } } },
        });
        if (!repair.partsAllocationLegacy && !canAllocateRepairParts({
          status: repair.status,
          approvalStatus: repair.approvalStatus,
          customerType: repair.customer.type,
        })) {
          throw new RepairPartAssignmentError("承認前の案件へ入荷部品を割り当てることはできません。");
        }
        if (!repair.partsAllocationLegacy) {
          await assertReceivedOrderCanBeAssigned(tx, {
            repairId: previous.repairId,
            partsMasterId: previous.partsMasterId,
            quantity: previous.quantity,
          });
        }
      }
      const updated = await tx.orderRequest.update({
      where: { id: orderId },
      data: {
        status,
        orderedAt: status === "ordered" ? new Date() : undefined,
        receivedAt: status === "received" ? new Date() : undefined,
      },
      include: { repair: { select: { id: true } } },
    });

      // A received order enters physical stock exactly once. This predates
      // Task166F and remains the same for legacy and new repairs.
      if (shouldReceiveOrderIntoStock(previous.status, status) && updated.partsMasterId) {
        await tx.partsMaster.update({
          where: { id: updated.partsMasterId },
          data: { stockQuantity: { increment: updated.quantity } },
        });
      }

      if (updated.repairId) {
      const repair = await tx.repair.findUniqueOrThrow({
        where: { id: updated.repairId },
        select: { status: true, partsAllocationLegacy: true },
      });

      if (repair.partsAllocationLegacy) {
        // Preserve the pre-Task166F order-status flow without deriving any
        // allocation or pending order from legacy data.
        const activeOrders = await tx.orderRequest.findMany({
          where: { repairId: updated.repairId, status: { in: ["pending", "ordered", "received"] } },
          select: { status: true },
        });
        const activeStatuses = activeOrders.map(order => order.status as RepairPartsOrderStatus);
        const nextStatus = shouldAllocateForOrderStatus(status)
          ? getRepairStatusAfterOrderAssignment(repair.status, activeStatuses)
          : getRepairStatusFromOrderStatuses(activeStatuses);

        if (nextStatus && nextStatus !== repair.status && canApplyPartsOrderStatus(repair.status)) {
          await tx.repair.update({ where: { id: updated.repairId }, data: { status: nextStatus } });
          await addConfirmedRepairStatusLog(tx, updated.repairId, nextStatus);
        }
      } else if (shouldAllocateForOrderStatus(status)) {
        // Assignment is the only order-state transition that consumes physical
        // stock into this repair's durable allocation ledger.
          await reconcileRepairPartAllocations(tx, updated.repairId, {
            requiredAllocationPartsMasterIds: updated.partsMasterId ? [updated.partsMasterId] : [],
          });
      } else {
        // ordered/received only affect active-order status. In particular,
        // received must leave the newly received stock unreserved.
        await syncRepairPartsStatusFromActiveOrders(tx, updated.repairId);
      }
      }

      return updated;
    });

    return NextResponse.json(order);
  } catch (error) {
    if (error instanceof RepairPartAssignmentError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
