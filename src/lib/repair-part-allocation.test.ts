import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
    getRepairPartAllocationPlan,
    getRequiredAllocationForReceivedOrder,
    canAllocateRepairParts,
    shouldReconcileRepairPartAllocations,
    shouldAllocateForOrderStatus,
    shouldReceiveOrderIntoStock,
} from "./repair-part-allocation";

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

test("B2C approval-waiting repair does not allocate stock or create pending orders", () => {
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
