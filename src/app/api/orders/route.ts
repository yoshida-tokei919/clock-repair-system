import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAllocateRepairParts, reconcileRepairPartAllocations } from "@/lib/repair-part-allocation";
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
  const { repairId, partsMasterId } = await req.json();
  const normalizedRepairId = Number(repairId);
  const normalizedPartsMasterId = Number(partsMasterId);

  if (!Number.isInteger(normalizedRepairId) || !Number.isInteger(normalizedPartsMasterId)) {
    return NextResponse.json({ error: "repairId and partsMasterId are required" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUnique({
      where: { id: normalizedRepairId },
      select: { status: true, approvalStatus: true, partsAllocationLegacy: true, customer: { select: { type: true } } },
    });
    if (!repair) throw new Error("Repair not found");
    if (!repair.partsAllocationLegacy && !canAllocateRepairParts({
      status: repair.status,
      approvalStatus: repair.approvalStatus,
      customerType: repair.customer.type,
    })) {
      throw new Error("承認前の案件には発注依頼を作成できません。");
    }

    const master = await tx.partsMaster.findUnique({ where: { id: normalizedPartsMasterId } });
    if (!master) throw new Error("partsMaster not found");

    // The reconciliation service computes the pending quantity from the actual
    // requirement minus durable reservations/incoming orders. Never add a
    // client-provided quantity to an existing request.
    let pending = await tx.orderRequest.findFirst({
      where: { repairId: normalizedRepairId, partsMasterId: normalizedPartsMasterId, status: "pending" },
      select: { id: true },
    });
    if (!pending) {
      pending = await tx.orderRequest.create({
        data: {
          repairId: normalizedRepairId,
          partsMasterId: normalizedPartsMasterId,
          quantity: 1,
          partNameJp: master.nameJp,
          partNameEn: master.nameEn,
          partRefs: master.partRefs,
          cousinsNumber: master.cousinsNumber,
          supplierId: master.supplierId,
          searchWordJp: master.nameJp,
          searchWordEn: master.nameEn,
          status: "pending",
        },
        select: { id: true },
      });
    }

    if (repair.partsAllocationLegacy) {
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
    } else {
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
    return order;
  });

  return NextResponse.json({ order: result, created: true, updated: false });
}
