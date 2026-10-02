import { Prisma } from "@prisma/client";
import { resolveRepairPartsReadiness } from "./repair-parts-readiness";
import { resolveStorageZoneRecommendation } from "./storage-zone-recommendation";

export const storageZoneRepairSelect = {
  id: true,
  status: true,
  approvalStatus: true,
  partsAllocationLegacy: true,
  customer: { select: { type: true } },
  planningState: { select: { blocked: true, blockReason: true } },
  estimate: { select: { items: { select: { type: true, partsMasterId: true, quantity: true } } } },
  partAllocations: { select: { partsMasterId: true, quantity: true, state: true } },
  orderRequests: { select: {
    repairId: true, partsMasterId: true, quantity: true, status: true,
    expectedArrivalDate: true, receivedAt: true,
  } },
} satisfies Prisma.RepairSelect;

type StorageZoneRepair = Prisma.RepairGetPayload<{ select: typeof storageZoneRepairSelect }>;

export function recommendZoneForRepair(repair: StorageZoneRepair) {
  return resolveStorageZoneRecommendation({
    status: repair.status,
    approvalStatus: repair.approvalStatus,
    customerType: repair.customer.type,
    planningState: repair.planningState,
    partsReadiness: resolveRepairPartsReadiness({
      repairId: repair.id,
      partsAllocationLegacy: repair.partsAllocationLegacy,
      estimateItems: repair.estimate?.items ?? [],
      allocations: repair.partAllocations,
      orders: repair.orderRequests,
    }),
  });
}
