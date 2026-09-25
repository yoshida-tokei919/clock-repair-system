import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
    getRepairPartAllocationPlan,
    getRequiredAllocationForReceivedOrder,
    canAllocateRepairParts,
    shouldReconcileRepairPartAllocations,
    shouldAllocateForOrderStatus,
    shouldReceiveOrderIntoStock,
    getPendingOrderTarget,
    getPreapprovalPendingOrderTarget,
    syncExistingPendingRepairOrders,
    reconcileRepairPartAllocations,
} from "./repair-part-allocation";

test("pending quantity is the shortage target, including multi-unit and incoming orders", () => {
    assert.equal(getPendingOrderTarget({ requiredQuantity: 4, allocatedQuantity: 0, availableStock: 1, incomingQuantity: 0 }), 3);
    assert.equal(getPendingOrderTarget({ requiredQuantity: 4, allocatedQuantity: 0, availableStock: 1, incomingQuantity: 2 }), 1);
    assert.equal(getPendingOrderTarget({ requiredQuantity: 2, allocatedQuantity: 0, availableStock: 2, incomingQuantity: 1 }), 0);
});

test("preapproval retry preserves an existing server-synchronized pending quantity", () => {
    assert.equal(getPreapprovalPendingOrderTarget({
        pendingQuantity: 2,
        totalRequiredQuantity: 1, // The client still has an older estimate.
        availableStock: 0,
        orderedQuantity: 0,
    }), 2);
});

test("preapproval retry after ordered or received creates only the uncovered shortage", () => {
    assert.equal(getPreapprovalPendingOrderTarget({
        totalRequiredQuantity: 3,
        availableStock: 0,
        orderedQuantity: 3,
    }), 0);
    assert.equal(getPreapprovalPendingOrderTarget({
        totalRequiredQuantity: 3,
        availableStock: 1, // A received unit is already in physical stock.
        orderedQuantity: 2,
    }), 0);
    assert.equal(getPreapprovalPendingOrderTarget({
        totalRequiredQuantity: 4,
        availableStock: 1,
        orderedQuantity: 2,
    }), 1);
});

test("preapproval save synchronizes only existing pending orders from persisted requirements", async () => {
    const updates: Array<{ id: number; data: { quantity?: number; status?: string } }> = [];
    const tx = {
        orderRequest: {
            findMany: async ({ where }: { where: { status: unknown } }) =>
                where.status === "pending"
                    ? [{ id: 10, partsMasterId: 1 }, { id: 11, partsMasterId: 2 }]
                    : [{ partsMasterId: 1, quantity: 1, status: "ordered" }],
            update: async ({ where, data }: { where: { id: number }; data: { quantity?: number; status?: string } }) => {
                updates.push({ id: where.id, data });
            },
        },
        estimateItem: {
            findMany: async () => [{ partsMasterId: 1, quantity: 3 }, { partsMasterId: 3, quantity: 2 }],
        },
        repairPartAllocation: { findMany: async () => [] },
        partsMaster: { findUnique: async ({ where }: { where: { id: number } }) =>
            ({ stockQuantity: where.id === 1 ? 1 : 0 }) },
    } as unknown as Prisma.TransactionClient;

    await syncExistingPendingRepairOrders(tx, 7);
    assert.deepEqual(updates, [
        { id: 10, data: { quantity: 1 } },
        { id: 11, data: { status: "cancelled" } },
    ]);
    updates.length = 0;
    await syncExistingPendingRepairOrders(tx, 7);
    assert.deepEqual(updates, [
        { id: 10, data: { quantity: 1 } },
        { id: 11, data: { status: "cancelled" } },
    ]);
    // The persisted part 3 has no explicit pending request and is untouched.
});

test("preapproval save with no explicit pending does not create one", async () => {
    const tx = {
        orderRequest: { findMany: async () => [], create: () => { throw new Error("unexpected order creation"); } },
    } as unknown as Prisma.TransactionClient;
    await syncExistingPendingRepairOrders(tx, 7);
});

test("new repair creates only explicitly requested persisted parts using current stock", async () => {
    for (const [stockQuantity, expectedQuantity] of [[1, 1], [2, 0]]) {
        const created: Array<{ partsMasterId: number; quantity: number }> = [];
        const tx = {
            orderRequest: {
                findMany: async () => [],
                create: async ({ data }: { data: { partsMasterId: number; quantity: number } }) => {
                    created.push({ partsMasterId: data.partsMasterId, quantity: data.quantity });
                },
            },
            estimateItem: { findMany: async () => [{ partsMasterId: 1, quantity: 2 }] },
            repairPartAllocation: { findMany: async () => [] },
            partsMaster: { findUnique: async () => ({
                stockQuantity, nameJp: "部品", nameEn: null, partRefs: null,
                cousinsNumber: null, supplierId: null,
            }) },
        } as unknown as Prisma.TransactionClient;

        await syncExistingPendingRepairOrders(tx, 7, [1, 2, 1]);
        assert.deepEqual(created, expectedQuantity ? [{ partsMasterId: 1, quantity: expectedQuantity }] : []);
    }
});

test("received stock and received order quantity are counted only once", async () => {
    const updates: Array<{ id: number; data: { quantity?: number; status?: string } }> = [];
    const tx = {
        orderRequest: {
            findMany: async ({ where }: { where: { status: unknown } }) =>
                where.status === "pending"
                    ? [{ id: 10, partsMasterId: 1 }]
                    : where.status === "ordered" ? [] : (() => { throw new Error("unexpected order status query"); })(),
            update: async ({ where, data }: { where: { id: number }; data: { quantity?: number; status?: string } }) => {
                updates.push({ id: where.id, data });
            },
        },
        estimateItem: { findMany: async () => [{ partsMasterId: 1, quantity: 2 }] },
        repairPartAllocation: { findMany: async () => [] },
        partsMaster: { findUnique: async () => ({ stockQuantity: 1 }) },
    } as unknown as Prisma.TransactionClient;

    await syncExistingPendingRepairOrders(tx, 7);
    assert.deepEqual(updates, [{ id: 10, data: { quantity: 1 } }]);
});

test("preapproval reconciliation leaves allocation, stock and repair status unchanged", async () => {
    const tx = {
        repair: {
            findUnique: async () => ({ status: "承認待ち", approvalStatus: "pending", partsAllocationLegacy: false, customer: { type: "individual" } }),
            update: () => { throw new Error("unexpected repair status update"); },
        },
        orderRequest: {
            findMany: async ({ where }: { where: { status: unknown } }) =>
                where.status === "pending" ? [{ id: 10, partsMasterId: 1 }] :
                    typeof where.status === "object" && where.status !== null &&
                    "in" in where.status && (where.status as { in: string[] }).in.includes("pending")
                        ? [{ status: "pending" }] : [],
            update: async () => undefined,
            create: () => { throw new Error("unexpected order creation"); },
        },
        estimateItem: { findMany: async () => [{ partsMasterId: 1, quantity: 2 }] },
        repairPartAllocation: {
            findMany: async () => [],
            upsert: () => { throw new Error("unexpected allocation"); },
        },
        partsMaster: {
            findUnique: async () => ({ stockQuantity: 0 }),
            update: () => { throw new Error("unexpected stock update"); },
        },
    } as unknown as Prisma.TransactionClient;
    const result = await reconcileRepairPartAllocations(tx, 7);
    assert.equal(result.status, "承認待ち");
});

test("approval reconciliation counts received units through current stock only", async () => {
    for (const scenario of [
        { required: 1, stock: 0, allocated: 0, pending: 1 },
        { required: 2, stock: 1, allocated: 1, pending: 1 },
    ]) {
        let stock = scenario.stock;
        let allocated = 0;
        let pending = 0;
        const tx = {
            repair: {
                findUnique: async () => ({ status: "承認待ち", approvalStatus: "approved", partsAllocationLegacy: false, customer: { type: "individual" } }),
                update: async () => undefined,
            },
            estimateItem: { findMany: async () => [{ partsMasterId: 1, quantity: scenario.required }] },
            repairPartAllocation: {
                findMany: async () => [],
                upsert: async ({ create }: { create: { quantity: number } }) => { allocated = create.quantity; },
                findUnique: async () => ({ quantity: allocated, state: "RESERVED" }),
            },
            partsMaster: {
                findUnique: async () => ({
                    stockQuantity: stock, nameJp: "部品", nameEn: null, partRefs: null,
                    cousinsNumber: null, supplierId: null,
                }),
                updateMany: async ({ data }: { data: { stockQuantity: { decrement: number } } }) => {
                    stock -= data.stockQuantity.decrement;
                    return { count: 1 };
                },
            },
            orderRequest: {
                findMany: async () => [
                    { id: 10, partsMasterId: 1, quantity: 1, status: "received" },
                    ...(pending ? [{ id: 11, partsMasterId: 1, quantity: pending, status: "pending" }] : []),
                ],
                create: async ({ data }: { data: { quantity: number } }) => { pending = data.quantity; },
            },
            repairStatusLog: {
                findFirst: async () => ({ status: "承認待ち" }),
                create: async () => undefined,
            },
        } as unknown as Prisma.TransactionClient;

        await reconcileRepairPartAllocations(tx, 7, { allowAdvanceFromApproval: true });
        assert.equal(allocated, scenario.allocated);
        assert.equal(pending, scenario.pending);
        assert.equal(stock, 0);
    }
});

test("stock 2 / required 1 reserves exactly one", () => {
    assert.deepEqual(getRepairPartAllocationPlan({ requiredQuantity: 1, reservedQuantity: 0, availableStock: 2 }), {
        reserveQuantity: 1, releaseQuantity: 0, nextReservedQuantity: 1, orderShortage: 0,
    });
});

test("re-saving unchanged requirement neither reserves nor releases", () => {
    assert.deepEqual(getRepairPartAllocationPlan({ requiredQuantity: 1, reservedQuantity: 1, availableStock: 1 }), {
        reserveQuantity: 0, releaseQuantity: 0, nextReservedQuantity: 1, orderShortage: 0,
    });
});

test("increasing quantity reserves only the delta", () => {
    assert.deepEqual(getRepairPartAllocationPlan({ requiredQuantity: 3, reservedQuantity: 1, availableStock: 1 }), {
        reserveQuantity: 1, releaseQuantity: 0, nextReservedQuantity: 2, orderShortage: 1,
    });
});

test("decreasing quantity releases the excess reservation", () => {
    assert.deepEqual(getRepairPartAllocationPlan({ requiredQuantity: 1, reservedQuantity: 2, availableStock: 0 }), {
        reserveQuantity: 0, releaseQuantity: 1, nextReservedQuantity: 1, orderShortage: 0,
    });
});

test("zero stock leaves the full quantity for a pending order", () => {
    assert.deepEqual(getRepairPartAllocationPlan({ requiredQuantity: 1, reservedQuantity: 0, availableStock: 0 }), {
        reserveQuantity: 0, releaseQuantity: 0, nextReservedQuantity: 0, orderShortage: 1,
    });
});

test("received leaves physical stock unreserved; only assigned allocates it", () => {
    assert.equal(shouldAllocateForOrderStatus("received"), false);
    assert.equal(shouldAllocateForOrderStatus("assigned"), true);
});

test("assigning a received order requires its unallocated quantity", () => {
    assert.equal(getRequiredAllocationForReceivedOrder({
        requiredQuantity: 1,
        alreadyAllocatedQuantity: 0,
        receivedOrderQuantity: 1,
    }), 1);
    assert.equal(getRepairPartAllocationPlan({
        requiredQuantity: 1,
        reservedQuantity: 0,
        availableStock: 1,
    }).orderShortage, 0);
});

test("assignment cannot substitute a pending order when received stock is unavailable", () => {
    assert.equal(getRequiredAllocationForReceivedOrder({
        requiredQuantity: 1,
        alreadyAllocatedQuantity: 0,
        receivedOrderQuantity: 1,
    }), 1);
    assert.equal(getRepairPartAllocationPlan({
        requiredQuantity: 1,
        reservedQuantity: 0,
        availableStock: 0,
    }).orderShortage, 1);
});

test("B2C approval-waiting repair remains ineligible for allocation", () => {
    assert.equal(canAllocateRepairParts({
        status: "承認待ち",
        approvalStatus: "pending",
        customerType: "individual",
    }), false);
});

test("customer approval makes a B2C repair eligible for allocation", () => {
    assert.equal(canAllocateRepairParts({
        status: "承認待ち",
        approvalStatus: "approved",
        customerType: "individual",
    }), false);
    assert.equal(canAllocateRepairParts({
        status: "承認待ち",
        approvalStatus: "approved",
        customerType: "individual",
        allowAdvanceFromApproval: true,
    }), true);
});

test("pre-allocation B2B statuses remain ineligible while work phases remain eligible", () => {
    assert.equal(canAllocateRepairParts({
        status: "見積中",
        approvalStatus: null,
        customerType: "business",
    }), false);
    assert.equal(canAllocateRepairParts({
        status: "作業中",
        approvalStatus: null,
        customerType: "business",
    }), true);
});

test("legacy ordered -> received adds stock once without entering allocation", () => {
    assert.equal(shouldReceiveOrderIntoStock("ordered", "received"), true);
    assert.equal(shouldReconcileRepairPartAllocations(true), false);
});

test("legacy re-saving received does not add stock twice", () => {
    assert.equal(shouldReceiveOrderIntoStock("received", "received"), false);
});

test("legacy received -> assigned preserves the status flow without allocation", () => {
    assert.equal(shouldAllocateForOrderStatus("assigned"), true);
    assert.equal(shouldReconcileRepairPartAllocations(true), false);
});

test("non-legacy repairs retain the Task166F allocation path", () => {
    assert.equal(shouldReconcileRepairPartAllocations(false), true);
    assert.equal(shouldReceiveOrderIntoStock("ordered", "received"), true);
    assert.deepEqual(getRepairPartAllocationPlan({ requiredQuantity: 1, reservedQuantity: 0, availableStock: 1 }), {
        reserveQuantity: 1, releaseQuantity: 0, nextReservedQuantity: 1, orderShortage: 0,
    });
});

test("legacy guard migration marks existing repairs without touching allocation data", () => {
    const sql = readFileSync(
        resolve(process.cwd(), "prisma/migrations/20260914_add_repair_parts_allocation_legacy_guard/migration.sql"),
        "utf8",
    );

    assert.match(sql, /ADD COLUMN "partsAllocationLegacy" BOOLEAN NOT NULL DEFAULT true/);
    assert.doesNotMatch(sql, /UPDATE[\s\S]*"Repair"/);
    assert.doesNotMatch(sql, /"PartsMaster"|"OrderRequest"|"RepairPartAllocation"|"RepairStatusLog"/);
});

test("Task166F-aware Repair creation opts out of the fail-safe legacy default", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const repairCreateRoute = readFileSync(resolve(process.cwd(), "src/app/api/repairs/route.ts"), "utf8");
    const repairIntake = readFileSync(resolve(process.cwd(), "src/lib/repair-intake.ts"), "utf8");

    assert.match(schema, /partsAllocationLegacy\s+Boolean\s+@default\(true\)/);
    assert.match(repairCreateRoute, /partsAllocationLegacy:\s*false/);
    assert.match(repairIntake, /partsAllocationLegacy:\s*false/);
});
