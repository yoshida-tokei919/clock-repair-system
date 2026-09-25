import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAllocateRepairParts, getPreapprovalPendingOrderTarget, reconcileRepairPartAllocations } from "@/lib/repair-part-allocation";
import {
  canApplyPartsOrderStatus,
  getRepairStatusFromOrderStatuses,
  type RepairPartsOrderStatus,
} from "@/lib/repair-parts-status";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const repairId = searchParams.get("repairId");
  const orders = await prisma.orderRequest.findMany({
    where: repairId
      ? { repairId: Number(repairId) }
      : { status: { in: ["pending", "ordered", "received"] } },
    include: {
      partsMaster: { select: { nameJp: true, nameEn: true, partRefs: true, cousinsNumber: true } },
      supplier: { select: { name: true } },
      repair: { select: { inquiryNumber: true, customer: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(orders);
}

export async function POST(req: Request) {
  const { repairId, partsMasterId, quantity, totalRequiredQuantity } = await req.json();
  const normalizedRepairId = Number(repairId);
  const normalizedPartsMasterId = Number(partsMasterId);
  const requestedQuantity = quantity === undefined ? 1 : Number(quantity);
  const requiredQuantity = Number(totalRequiredQuantity);

  if (!Number.isInteger(normalizedRepairId) || !Number.isInteger(normalizedPartsMasterId) ||
      !Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    return NextResponse.json({ error: "repairId and partsMasterId are required" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Serialize requests for this repair/part before checking for a pending row.
    // The lock is released with the transaction and needs no schema change.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${normalizedRepairId}::integer, ${normalizedPartsMasterId}::integer)::text AS locked`;
    const repair = await tx.repair.findUnique({
      where: { id: normalizedRepairId },
      select: { status: true, approvalStatus: true, partsAllocationLegacy: true, customer: { select: { type: true } } },
    });
    if (!repair) throw new Error("Repair not found");
    const canAllocate = canAllocateRepairParts({
      status: repair.status,
      approvalStatus: repair.approvalStatus,
      customerType: repair.customer.type,
    });

    const master = await tx.partsMaster.findUnique({ where: { id: normalizedPartsMasterId } });
    if (!master) throw new Error("partsMaster not found");

    // The UI sends a shortage target, not an increment. Repair save derives
    // existing preapproval pending quantities from persisted requirements.
    let pending = await tx.orderRequest.findFirst({
      where: { repairId: normalizedRepairId, partsMasterId: normalizedPartsMasterId, status: "pending" },
      select: { id: true, quantity: true },
    });
    const previousPending = pending;
    let created = false;
    let pendingTarget = requestedQuantity;
    if (!canAllocate) {
      if (!pending && (!Number.isInteger(requiredQuantity) || requiredQuantity <= 0)) {
        return { error: "必要数量を指定してください。" };
      }
      const ordered = pending ? [] : await tx.orderRequest.findMany({
        where: { repairId: normalizedRepairId, partsMasterId: normalizedPartsMasterId, status: "ordered" },
        select: { quantity: true },
      });
      pendingTarget = getPreapprovalPendingOrderTarget({
        pendingQuantity: pending?.quantity,
        totalRequiredQuantity: requiredQuantity,
        availableStock: master.stockQuantity,
        orderedQuantity: ordered.reduce((total, order) => total + Math.max(0, order.quantity), 0),
      });
      if (!pending && pendingTarget === 0) {
        return { order: null, created: false, updated: false };
      }
    }
    if (!pending) {
      created = true;
      pending = await tx.orderRequest.create({
        data: {
          repairId: normalizedRepairId,
          partsMasterId: normalizedPartsMasterId,
          quantity: pendingTarget,
          partNameJp: master.nameJp,
          partNameEn: master.nameEn,
          partRefs: master.partRefs,
          cousinsNumber: master.cousinsNumber,
          supplierId: master.supplierId,
          searchWordJp: master.nameJp,
          searchWordEn: master.nameEn,
          status: "pending",
        },
        select: { id: true, quantity: true },
      });
    }

    if (repair.partsAllocationLegacy && canAllocate) {
      // This remains a user-created legacy order. Keep the pre-Task166F
      // parts-status synchronization, but never derive allocation work from it.
      const activeOrders = await tx.orderRequest.findMany({
        where: { repairId: normalizedRepairId, status: { in: ["pending", "ordered", "received"] } },
        select: { status: true },
      });
      const nextStatus = getRepairStatusFromOrderStatuses(
        activeOrders.map(order => order.status as RepairPartsOrderStatus),
      );
      if (nextStatus && nextStatus !== repair.status && canApplyPartsOrderStatus(repair.status)) {
        await tx.repair.update({ where: { id: normalizedRepairId }, data: { status: nextStatus } });
      }
    } else if (canAllocate) {
      await reconcileRepairPartAllocations(tx, normalizedRepairId);
    }
    const order = await tx.orderRequest.findUniqueOrThrow({
      where: { id: pending.id },
      include: {
        supplier: { select: { name: true } },
        repair: { select: { inquiryNumber: true, customer: { select: { name: true } } } },
        partsMaster: { select: { nameJp: true, nameEn: true, partRefs: true, cousinsNumber: true } },
      },
    });
    return {
      order,
      created,
      updated: !created && previousPending !== null &&
        (order.quantity !== previousPending.quantity || order.status !== "pending"),
    };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
