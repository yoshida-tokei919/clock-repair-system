import type { Prisma } from "@prisma/client";
import {
    canApplyPartsOrderStatus,
    getRepairStatusAfterPartsFlowCompletion,
    getRepairStatusFromActiveOrderStatuses,
    type RepairPartsOrderStatus,
} from "@/lib/repair-parts-status";

const ACTIVE_ORDER_STATUSES = ["pending", "ordered", "received"] as const;

type AllocationState = "RESERVED" | "CONSUMED" | "RELEASED";
type AllocationRow = { partsMasterId: number; quantity: number; state: AllocationState };
const PRE_ALLOCATION_REPAIR_STATUSES = new Set(["受付", "見積中", "承認待ち"]);

export type AllocationPlanInput = {
    requiredQuantity: number;
    reservedQuantity: number;
    availableStock: number;
};

export type AllocationPlan = {
    reserveQuantity: number;
    releaseQuantity: number;
    nextReservedQuantity: number;
    orderShortage: number;
};

export class RepairPartAssignmentError extends Error {
    constructor(message = "案件へ割当できません。利用可能在庫が不足しています。") {
        super(message);
        this.name = "RepairPartAssignmentError";
    }
}

/**
 * Estimate editing must not reserve physical stock before a repair enters its
 * parts/work flow. Individual customers additionally require the actual
 * customer approval; the approval endpoint opts in explicitly inside its
 * transaction.
 */
export function canAllocateRepairParts({
    status,
    approvalStatus,
    customerType,
    allowAdvanceFromApproval = false,
}: {
    status: string;
    approvalStatus: string | null;
    customerType: string;
    allowAdvanceFromApproval?: boolean;
}): boolean {
    if (allowAdvanceFromApproval) return true;
    if (customerType === "individual" && approvalStatus !== "approved") return false;
    return !PRE_ALLOCATION_REPAIR_STATUSES.has(status);
}

/** Legacy repairs have no trustworthy allocation ledger and must not be reconciled. */
export function shouldReconcileRepairPartAllocations(partsAllocationLegacy: boolean): boolean {
    return !partsAllocationLegacy;
}

/** Only assignment transfers physical stock into a repair reservation. */
export function shouldAllocateForOrderStatus(status: string): boolean {
    return status === "assigned";
}

/** A physical receipt reaches stock exactly once, for both legacy and new repairs. */
export function shouldReceiveOrderIntoStock(previousStatus: string, nextStatus: string): boolean {
    return previousStatus !== "received" && nextStatus === "received";
}

/**
 * The quantity a received order must be able to reserve when it is assigned.
 * Existing reservations cover the same repair/part first, so repeat handling
 * never consumes stock twice.
 */
export function getRequiredAllocationForReceivedOrder({
    requiredQuantity,
    alreadyAllocatedQuantity,
    receivedOrderQuantity,
}: {
    requiredQuantity: number;
    alreadyAllocatedQuantity: number;
    receivedOrderQuantity: number;
}): number {
    return Math.min(
        Math.max(0, receivedOrderQuantity),
        Math.max(0, requiredQuantity - alreadyAllocatedQuantity),
    );
}

/** Pure, per-part allocation calculation. stockQuantity is always unreserved stock. */
export function getRepairPartAllocationPlan({
    requiredQuantity,
    reservedQuantity,
    availableStock,
}: AllocationPlanInput): AllocationPlan {
    const required = Math.max(0, requiredQuantity);
    const reserved = Math.max(0, reservedQuantity);
    const stock = Math.max(0, availableStock);

    if (required < reserved) {
        const releaseQuantity = reserved - required;
        return {
            reserveQuantity: 0,
            releaseQuantity,
            nextReservedQuantity: required,
            orderShortage: 0,
        };
    }

    const additionalRequired = required - reserved;
    const reserveQuantity = Math.min(additionalRequired, stock);
    const nextReservedQuantity = reserved + reserveQuantity;
    return {
        reserveQuantity,
        releaseQuantity: 0,
        nextReservedQuantity,
        orderShortage: required - nextReservedQuantity,
    };
}

/** A pending order is a shortage target, never an increment on every save. */
export function getPendingOrderTarget({
    requiredQuantity,
    allocatedQuantity,
    availableStock,
    incomingQuantity,
}: {
    requiredQuantity: number;
    allocatedQuantity: number;
    availableStock: number;
    incomingQuantity: number;
}): number {
    return Math.max(0, requiredQuantity - allocatedQuantity - availableStock - incomingQuantity);
}

/** A retry cannot replace a pending quantity already synchronized by Repair save. */
export function getPreapprovalPendingOrderTarget({
    pendingQuantity,
    totalRequiredQuantity,
    availableStock,
    orderedQuantity,
}: {
    pendingQuantity?: number;
    totalRequiredQuantity: number;
    availableStock: number;
    orderedQuantity: number;
}): number {
    return pendingQuantity ?? getPendingOrderTarget({
        requiredQuantity: totalRequiredQuantity,
        allocatedQuantity: 0,
        availableStock,
        incomingQuantity: orderedQuantity,
    });
}

/** Before allocation is allowed, synchronize only orders that were explicitly requested. */
export async function syncExistingPendingRepairOrders(
    tx: Prisma.TransactionClient,
    repairId: number,
    explicitlyRequestedPartIds: readonly number[] = [],
) {
    const pendingOrders = await tx.orderRequest.findMany({
        where: { repairId, status: "pending" },
        select: { id: true, partsMasterId: true },
    });
    if (pendingOrders.length === 0 && explicitlyRequestedPartIds.length === 0) return;

    const [estimateItems, activeOrders, allocations] = await Promise.all([
        tx.estimateItem.findMany({
            where: { estimate: { repairId }, type: "part", partsMasterId: { not: null } },
            select: { partsMasterId: true, quantity: true },
        }),
        tx.orderRequest.findMany({
            where: { repairId, status: "ordered" },
            select: { partsMasterId: true, quantity: true, status: true },
        }),
        tx.repairPartAllocation.findMany({
            where: { repairId },
            select: { partsMasterId: true, quantity: true, state: true },
        }),
    ]);

    const seenParts = new Set<number>();
    for (const pending of pendingOrders) {
        if (!pending.partsMasterId) continue;
        if (seenParts.has(pending.partsMasterId)) {
            await tx.orderRequest.update({ where: { id: pending.id }, data: { status: "cancelled" } });
            continue;
        }
        seenParts.add(pending.partsMasterId);
        const requiredQuantity = estimateItems
            .filter(item => item.partsMasterId === pending.partsMasterId)
            .reduce((total, item) => total + Math.max(0, item.quantity ?? 1), 0);
        const orderedQuantity = activeOrders
            .filter(order => order.partsMasterId === pending.partsMasterId && order.status === "ordered")
            .reduce((total, order) => total + Math.max(0, order.quantity), 0);
        const allocatedQuantity = allocations
            .filter(row => row.partsMasterId === pending.partsMasterId && (row.state === "RESERVED" || row.state === "CONSUMED"))
            .reduce((total, row) => total + row.quantity, 0);
        const master = await tx.partsMaster.findUnique({
            where: { id: pending.partsMasterId },
            select: { stockQuantity: true },
        });
        const target = getPendingOrderTarget({
            requiredQuantity,
            allocatedQuantity,
            // Received units are already reflected in available physical stock.
            availableStock: master?.stockQuantity ?? 0,
            incomingQuantity: orderedQuantity,
        });
        await tx.orderRequest.update({
            where: { id: pending.id },
            data: target > 0 ? { quantity: target } : { status: "cancelled" },
        });
    }

    // A new repair only creates requests the user explicitly selected and
    // that survived validation as persisted PART estimate items.
    for (const partsMasterId of Array.from(new Set(explicitlyRequestedPartIds))) {
        if (seenParts.has(partsMasterId) || !estimateItems.some(item => item.partsMasterId === partsMasterId)) continue;
        const requiredQuantity = estimateItems
            .filter(item => item.partsMasterId === partsMasterId)
            .reduce((total, item) => total + Math.max(0, item.quantity ?? 1), 0);
        const orderedQuantity = activeOrders
            .filter(order => order.partsMasterId === partsMasterId && order.status === "ordered")
            .reduce((total, order) => total + Math.max(0, order.quantity), 0);
        const allocatedQuantity = allocations
            .filter(row => row.partsMasterId === partsMasterId && (row.state === "RESERVED" || row.state === "CONSUMED"))
            .reduce((total, row) => total + row.quantity, 0);
        const master = await tx.partsMaster.findUnique({ where: { id: partsMasterId } });
        if (!master) throw new Error("partsMaster not found");
        const target = getPendingOrderTarget({
            requiredQuantity,
            allocatedQuantity,
            availableStock: master.stockQuantity,
            incomingQuantity: orderedQuantity,
        });
        if (target === 0) continue;
        await tx.orderRequest.create({
            data: {
                repairId,
                partsMasterId,
                quantity: target,
                partNameJp: master.nameJp,
                partNameEn: master.nameEn,
                partRefs: master.partRefs,
                cousinsNumber: master.cousinsNumber,
                supplierId: master.supplierId,
                searchWordJp: master.nameJp,
                searchWordEn: master.nameEn,
                status: "pending",
            },
        });
    }
}

type ReconcileOptions = {
    /** Requested UI status. It is normalized against the actual allocation/order state. */
    requestedStatus?: string | null;
    /** Customer approval may enter the parts/work flow, but estimating/approval states otherwise remain unchanged. */
    allowAdvanceFromApproval?: boolean;
    /** Parts that must be fully reservable; used by atomic received -> assigned. */
    requiredAllocationPartsMasterIds?: readonly number[];
};

export type ReconcileResult = {
    status: string;
    activeOrderStatuses: RepairPartsOrderStatus[];
    allRequiredPartsAllocated: boolean;
    skippedForLegacy: boolean;
};

export async function addConfirmedRepairStatusLog(
    tx: Prisma.TransactionClient,
    repairId: number,
    status: string,
) {
    const latest = await tx.repairStatusLog.findFirst({
        where: { repairId },
        orderBy: { id: "desc" },
        select: { status: true },
    });
    if (latest?.status !== status) {
        await tx.repairStatusLog.create({ data: { repairId, status } });
    }
}

export async function assertReceivedOrderCanBeAssigned(
    tx: Prisma.TransactionClient,
    input: { repairId: number; partsMasterId: number; quantity: number },
) {
    const [master, estimateItems, allocation] = await Promise.all([
        tx.partsMaster.findUnique({
            where: { id: input.partsMasterId },
            select: { stockQuantity: true },
        }),
        tx.estimateItem.findMany({
            where: { estimate: { repairId: input.repairId }, type: "part", partsMasterId: input.partsMasterId },
            select: { quantity: true },
        }),
        tx.repairPartAllocation.findUnique({
            where: { repairId_partsMasterId: { repairId: input.repairId, partsMasterId: input.partsMasterId } },
            select: { quantity: true, state: true },
        }),
    ]);
    if (!master) throw new RepairPartAssignmentError("案件へ割当できません。対象部品が見つかりません。");

    const requiredQuantity = estimateItems.reduce((total, item) => total + Math.max(0, item.quantity ?? 1), 0);
    const alreadyAllocated = allocation?.state === "RESERVED" || allocation?.state === "CONSUMED"
        ? allocation.quantity
        : 0;
    const requiredForThisAssignment = getRequiredAllocationForReceivedOrder({
        requiredQuantity,
        alreadyAllocatedQuantity: alreadyAllocated,
        receivedOrderQuantity: input.quantity,
    });

    if (master.stockQuantity < requiredForThisAssignment) {
        throw new RepairPartAssignmentError();
    }
}

/**
 * Reconciles the durable per-repair allocation ledger with the current part
 * estimate. This is intentionally the only place that reserves/releases
 * PartsMaster stock or creates/adjusts repair-specific pending orders.
 */
export async function reconcileRepairPartAllocations(
    tx: Prisma.TransactionClient,
    repairId: number,
    options: ReconcileOptions = {},
): Promise<ReconcileResult> {
    const repair = await tx.repair.findUnique({
        where: { id: repairId },
        select: { status: true, approvalStatus: true, partsAllocationLegacy: true, customer: { select: { type: true } } },
    });
    if (!repair) throw new Error("Repair not found");

    if (!shouldReconcileRepairPartAllocations(repair.partsAllocationLegacy)) {
        return {
            status: repair.status,
            activeOrderStatuses: [],
            allRequiredPartsAllocated: false,
            skippedForLegacy: true,
        };
    }

    if (!canAllocateRepairParts({
        status: options.requestedStatus ?? repair.status,
        approvalStatus: repair.approvalStatus,
        customerType: repair.customer.type,
        allowAdvanceFromApproval: options.allowAdvanceFromApproval,
    })) {
        await syncExistingPendingRepairOrders(tx, repairId);
        const activeOrders = await tx.orderRequest.findMany({
            where: { repairId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
            select: { status: true },
        });
        return {
            status: repair.status,
            activeOrderStatuses: activeOrders.map(order => order.status as RepairPartsOrderStatus),
            allRequiredPartsAllocated: false,
            skippedForLegacy: false,
        };
    }

    const estimateItems = await tx.estimateItem.findMany({
        where: { estimate: { repairId }, type: "part", partsMasterId: { not: null } },
        select: { partsMasterId: true, quantity: true },
    });
    const requiredByPart = new Map<number, number>();
    for (const item of estimateItems) {
        if (!item.partsMasterId) continue;
        requiredByPart.set(
            item.partsMasterId,
            (requiredByPart.get(item.partsMasterId) ?? 0) + Math.max(0, item.quantity ?? 1),
        );
    }

    const allocations = await tx.repairPartAllocation.findMany({
        where: { repairId },
        select: { partsMasterId: true, quantity: true, state: true },
    }) as AllocationRow[];
    const allocationByPart = new Map(allocations.map(row => [row.partsMasterId, row]));
    const partIds = new Set<number>([
        ...Array.from(requiredByPart.keys()),
        ...allocations.map(row => row.partsMasterId),
    ]);

    const strictlyRequiredPartIds = new Set(options.requiredAllocationPartsMasterIds ?? []);
    for (const partsMasterId of Array.from(partIds)) {
        const requiredQuantity = requiredByPart.get(partsMasterId) ?? 0;
        const current = allocationByPart.get(partsMasterId);
        // CONSUMED is historical and must not be silently released by an edit.
        if (current?.state === "CONSUMED") {
            if (requiredQuantity !== current.quantity) {
                throw new Error("Consumed repair part allocations cannot be changed");
            }
            continue;
        }
        const reservedQuantity = current?.state === "RESERVED" ? current.quantity : 0;
        const master = await tx.partsMaster.findUnique({
            where: { id: partsMasterId },
            select: { stockQuantity: true },
        });
        if (!master) continue;

        const plan = getRepairPartAllocationPlan({
            requiredQuantity,
            reservedQuantity,
            availableStock: master.stockQuantity,
        });

        if (strictlyRequiredPartIds.has(partsMasterId) && plan.orderShortage > 0) {
            throw new RepairPartAssignmentError();
        }

        if (plan.releaseQuantity > 0) {
            await tx.partsMaster.update({
                where: { id: partsMasterId },
                data: { stockQuantity: { increment: plan.releaseQuantity } },
            });
        } else if (plan.reserveQuantity > 0) {
            const stockUpdate = await tx.partsMaster.updateMany({
                where: { id: partsMasterId, stockQuantity: { gte: plan.reserveQuantity } },
                data: { stockQuantity: { decrement: plan.reserveQuantity } },
            });
            if (stockUpdate.count !== 1) {
                if (strictlyRequiredPartIds.has(partsMasterId)) {
                    throw new RepairPartAssignmentError();
                }
                throw new Error("Parts master stock changed while reserving repair allocation");
            }
        }

        if (requiredQuantity === 0 && current?.state === "RESERVED") {
            await tx.repairPartAllocation.update({
                where: { repairId_partsMasterId: { repairId, partsMasterId } },
                data: { quantity: 0, state: "RELEASED", releasedAt: new Date() },
            });
        } else if (requiredQuantity > 0) {
            await tx.repairPartAllocation.upsert({
                where: { repairId_partsMasterId: { repairId, partsMasterId } },
                create: {
                    repairId,
                    partsMasterId,
                    quantity: plan.nextReservedQuantity,
                    state: "RESERVED",
                },
                update: {
                    quantity: plan.nextReservedQuantity,
                    state: "RESERVED",
                    releasedAt: null,
                },
            });
        }
    }

    const orders = await tx.orderRequest.findMany({
        where: { repairId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
        select: { id: true, partsMasterId: true, quantity: true, status: true, partNameJp: true, partNameEn: true, partRefs: true, cousinsNumber: true, supplierId: true, searchWordJp: true, searchWordEn: true },
    });

    for (const partsMasterId of Array.from(partIds)) {
        const requiredQuantity = requiredByPart.get(partsMasterId) ?? 0;
        const allocation = await tx.repairPartAllocation.findUnique({
            where: { repairId_partsMasterId: { repairId, partsMasterId } },
            select: { quantity: true, state: true },
        });
        const allocatedQuantity = allocation?.state === "RESERVED" || allocation?.state === "CONSUMED"
            ? allocation.quantity
            : 0;
        const partOrders = orders.filter(order => order.partsMasterId === partsMasterId);
        const incomingQuantity = partOrders
            .filter(order => order.status === "ordered")
            .reduce((total, order) => total + Math.max(0, order.quantity), 0);
        const pending = partOrders.find(order => order.status === "pending");
        const pendingTarget = Math.max(0, requiredQuantity - allocatedQuantity - incomingQuantity);

        if (pending) {
            if (pendingTarget > 0) {
                await tx.orderRequest.update({ where: { id: pending.id }, data: { quantity: pendingTarget } });
            } else {
                await tx.orderRequest.update({ where: { id: pending.id }, data: { status: "cancelled" } });
            }
        } else if (pendingTarget > 0) {
            const master = await tx.partsMaster.findUnique({
                where: { id: partsMasterId },
                select: { nameJp: true, nameEn: true, partRefs: true, cousinsNumber: true, supplierId: true },
            });
            if (master) {
                await tx.orderRequest.create({
                    data: {
                        repairId,
                        partsMasterId,
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
                });
            }
        }
    }

    const activeOrders = await tx.orderRequest.findMany({
        where: { repairId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
        select: { status: true },
    });
    const activeOrderStatuses = activeOrders.map(order => order.status as RepairPartsOrderStatus);
    const activeStatus = getRepairStatusFromActiveOrderStatuses(activeOrderStatuses);
    const statusBasis = options.requestedStatus ?? repair.status;
    const allRequiredPartsAllocated = activeOrderStatuses.length === 0;

    let nextStatus = statusBasis;
    if (activeStatus && canApplyPartsOrderStatus(statusBasis)) {
        nextStatus = activeStatus;
    } else if (options.allowAdvanceFromApproval) {
        nextStatus = activeStatus ?? "作業待ち";
    } else {
        nextStatus = getRepairStatusAfterPartsFlowCompletion(statusBasis, activeOrderStatuses) ?? statusBasis;
    }

    if (nextStatus !== repair.status) {
        await tx.repair.update({ where: { id: repairId }, data: { status: nextStatus } });
        await addConfirmedRepairStatusLog(tx, repairId, nextStatus);
    }

    return { status: nextStatus, activeOrderStatuses, allRequiredPartsAllocated, skippedForLegacy: false };
}

/**
 * Synchronize only the parts status from active orders. Receiving a part is a
 * physical-stock event; it must not reserve stock for a repair until assigned.
 */
export async function syncRepairPartsStatusFromActiveOrders(
    tx: Prisma.TransactionClient,
    repairId: number,
) {
    const repair = await tx.repair.findUnique({
        where: { id: repairId },
        select: { status: true, approvalStatus: true, partsAllocationLegacy: true, customer: { select: { type: true } } },
    });
    if (!repair) throw new Error("Repair not found");

    if (!shouldReconcileRepairPartAllocations(repair.partsAllocationLegacy)) {
        return [];
    }

    if (!canAllocateRepairParts({
        status: repair.status,
        approvalStatus: repair.approvalStatus,
        customerType: repair.customer.type,
    })) {
        return [];
    }

    const activeOrders = await tx.orderRequest.findMany({
        where: { repairId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
        select: { status: true },
    });
    const activeOrderStatuses = activeOrders.map(order => order.status as RepairPartsOrderStatus);
    const nextStatus = getRepairStatusFromActiveOrderStatuses(activeOrderStatuses);

    if (nextStatus && nextStatus !== repair.status && canApplyPartsOrderStatus(repair.status)) {
        await tx.repair.update({ where: { id: repairId }, data: { status: nextStatus } });
        await addConfirmedRepairStatusLog(tx, repairId, nextStatus);
    }

    return activeOrderStatuses;
}
