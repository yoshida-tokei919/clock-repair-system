import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertShippingMethodChangeAllowed, getOrderArrivalUpdate, OrderExpectedArrivalError, parseOrderUpdateInput, shouldRecalculateOrderArrival } from "@/lib/order-expected-arrival";
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
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  try {
    const input = parseOrderUpdateInput(await req.json());
    const order = await prisma.$transaction(async (tx) => {
      const previous = await tx.orderRequest.findUnique({
        where: { id: orderId },
        select: { status: true, repairId: true, partsMasterId: true, quantity: true,
          supplierId: true, procurementShippingMethodId: true, orderedAt: true },
      });
      if (!previous) throw new OrderExpectedArrivalError("発注が見つかりません。", 404);
      const status = input.status ?? previous.status;
      const methodProvided = Object.prototype.hasOwnProperty.call(input, "procurementShippingMethodId");
      const methodId = methodProvided ? input.procurementShippingMethodId ?? null : previous.procurementShippingMethodId;
      const shouldRecalculate = shouldRecalculateOrderArrival({
        previousStatus: previous.status, status, previousOrderedAt: previous.orderedAt,
        previousMethodId: previous.procurementShippingMethodId, methodId, methodProvided,
      });
      const methodChanged = methodProvided && methodId !== previous.procurementShippingMethodId;
      const method = methodId === null || (!methodChanged && !shouldRecalculate) ? null : await tx.procurementShippingMethod.findUnique({
        where: { id: methodId }, select: { id: true, isActive: true, manualTransitLeadDays: true },
      });
      if (methodId !== null && (methodChanged || shouldRecalculate) && !method)
        throw new OrderExpectedArrivalError("配送方法が見つかりません。", 404);
      assertShippingMethodChangeAllowed(previous.status, status, previous.procurementShippingMethodId,
        methodId, methodProvided, method?.isActive ?? null);
      const supplierSetting = shouldRecalculate && methodId !== null && previous.supplierId !== null
        ? await tx.supplierLeadTimeSetting.findUnique({
          where: { supplierId: previous.supplierId }, select: { manualProcessingLeadDays: true },
        }) : null;
      const arrivalUpdate = getOrderArrivalUpdate({ previousStatus: previous.status, status, previousOrderedAt: previous.orderedAt,
        previousMethodId: previous.procurementShippingMethodId, methodId, methodProvided,
        processingDays: supplierSetting?.manualProcessingLeadDays ?? null,
        transitDays: method?.manualTransitLeadDays ?? null, now: new Date() });
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
        ...arrivalUpdate,
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
    if (error instanceof OrderExpectedArrivalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "JSONの入力形式が正しくありません。" }, { status: 400 });
    }
    if (error instanceof RepairPartAssignmentError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
