import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRepairListWhere, normalizeRepairListParams, repairListPage, tokyoDayRange } from "./repair-list-filters";

test("normalizes allowlisted, bounded URL parameters", () => {
    const filters = normalizeRepairListParams({ customer: "2,2,0,abc,3", brand: "1,4", status: "受付,承認待ち,unknown", type: "bad", page: "9999999", q: "x".repeat(200) });
    assert.equal(filters.customer, "2,3");
    assert.equal(filters.brand, "1,4");
    assert.equal(filters.status, "受付,承認待ち");
    assert.equal(filters.type, "");
    assert.equal(filters.page, 1);
    assert.equal(filters.q.length, 100);
});

test("different criteria form AND and same-category selections form IN", () => {
    const filters = normalizeRepairListParams({ type: "business", customer: "2,3", brand: "4,5", status: "受付,承認待ち", delivery: "undelivered", amountMin: "1000", amountMax: "9000", pendingFrom: "2026-11-06" });
    const where = buildRepairListWhere(filters);
    assert.ok(Array.isArray(where.AND));
    const conditions = where.AND as Exclude<typeof where.AND, undefined> & unknown[];
    assert.deepEqual(conditions.slice(0, 5), [
        { customer: { type: "business" } }, { customerId: { in: [2, 3] } },
        { watch: { brandId: { in: [4, 5] } } }, { status: { in: ["受付", "承認待ち"] } },
        { status: { not: "納品済み" } },
    ]);
    assert.deepEqual(conditions.at(-1), { estimate: { totalAmount: { gte: 1000, lte: 9000 } } });
    assert.deepEqual(conditions.at(-2), { logs: { some: { status: "承認待ち", changedAt: { gte: new Date("2026-11-05T15:00:00.000Z") } } } });
});

test("Tokyo date bounds include the end calendar day", () => {
    assert.deepEqual(tokyoDayRange("2026-11-06", "2026-11-07"), {
        gte: new Date("2026-11-05T15:00:00.000Z"), lt: new Date("2026-11-07T15:00:00.000Z"),
    });
    const invalid = normalizeRepairListParams({ receptionFrom: "2026-02-30", approvalFrom: "2026-11-08", approvalTo: "2026-11-06", amountMin: "100", amountMax: "50" });
    assert.equal(invalid.receptionFrom, "");
    assert.equal(invalid.approvalFrom, "");
    assert.equal(invalid.approvalTo, "");
    assert.equal(invalid.amountMin, "");
    assert.equal(invalid.amountMax, "");
});

test("pagination clamps empty and out-of-range pages", () => {
    assert.deepEqual(repairListPage(99, 0), { currentPage: 1, totalPages: 1, skip: 0 });
    assert.deepEqual(repairListPage(99, 101), { currentPage: 3, totalPages: 3, skip: 100 });
});
