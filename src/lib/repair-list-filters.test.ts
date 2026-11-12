import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRepairListWhere, normalizeRepairListParams, repairListPage, repairListUrl, tokyoDayRange } from "./repair-list-filters";

test("normalizes allowlisted, bounded URL parameters", () => {
    const filters = normalizeRepairListParams({ customer: "2,2,0,abc,3", brand: "1,4", status: "受付,承認待ち,unknown", type: "bad", partEntries: "with,without", orderRequest: "assigned", page: "9999999", q: "x".repeat(200) });
    assert.equal(filters.customer, "2,3");
    assert.equal(filters.brand, "1,4");
    assert.equal(filters.status, "受付,承認待ち");
    assert.equal(filters.type, "");
    assert.equal(filters.partEntries, "");
    assert.equal(filters.orderRequest, "");
    assert.equal(filters.page, 1);
    assert.equal(filters.q.length, 100);
});

test("bare and empty-only URLs default to undelivered", () => {
    for (const raw of [{}, { q: "  ", page: "1" }, { type: "bad", status: "unknown" }]) {
        const filters = normalizeRepairListParams(raw);
        assert.equal(filters.delivery, "undelivered");
        assert.deepEqual(buildRepairListWhere(filters), { AND: [{ status: { not: "納品済み" } }] });
        assert.equal(repairListUrl(filters), "/repairs");
    }
});

test("delivery choices and legacy links preserve their meaning", () => {
    assert.deepEqual(buildRepairListWhere(normalizeRepairListParams({ delivery: "all" })), {});
    assert.deepEqual(buildRepairListWhere(normalizeRepairListParams({ delivery: "" })), {});
    assert.deepEqual(buildRepairListWhere(normalizeRepairListParams({ delivery: "delivered" })), { AND: [{ status: "納品済み" }] });
    assert.deepEqual(buildRepairListWhere(normalizeRepairListParams({ delivery: "undelivered" })), { AND: [{ status: { not: "納品済み" } }] });
    assert.equal(normalizeRepairListParams({ q: "watch" }).delivery, "all");
    assert.equal(normalizeRepairListParams({ q: "watch", delivery: "" }).delivery, "all");
    for (const delivery of ["all", "delivered", "undelivered"] as const) {
        const filters = normalizeRepairListParams({ q: "watch", delivery });
        const url = repairListUrl(filters);
        assert.equal(new URL(url, "https://example.test").searchParams.get("delivery"), delivery);
        assert.deepEqual(normalizeRepairListParams(Object.fromEntries(new URL(url, "https://example.test").searchParams)), filters);
    }
});

test("recorded part lines match either source, while without excludes both", () => {
    assert.deepEqual(buildRepairListWhere(normalizeRepairListParams({ partEntries: "with" })), { AND: [{ OR: [
        { repairLineItems: { some: { lineType: "PART" } } },
        { estimate: { items: { some: { type: "part" } } } },
    ] }] });
    assert.deepEqual(buildRepairListWhere(normalizeRepairListParams({ partEntries: "without" })), { AND: [{
        repairLineItems: { none: { lineType: "PART" } },
        NOT: { estimate: { items: { some: { type: "part" } } } },
    }] });
});

test("order request filters use request rows, with partial requiring separate statuses", () => {
    for (const status of ["pending", "ordered", "received"] as const) {
        assert.deepEqual(buildRepairListWhere(normalizeRepairListParams({ orderRequest: status })), {
            AND: [{ orderRequests: { some: { status } } }],
        });
    }
    assert.deepEqual(buildRepairListWhere(normalizeRepairListParams({ orderRequest: "partial" })), { AND: [{ AND: [
        { orderRequests: { some: { status: "pending" } } },
        { orderRequests: { some: { status: { in: ["ordered", "received"] } } } },
    ] }] });
    assert.deepEqual(buildRepairListWhere(normalizeRepairListParams({ orderRequest: "noRequest" })), {
        AND: [{ orderRequests: { none: {} } }],
    });
});

test("part and request filters combine with customer and status", () => {
    assert.deepEqual(buildRepairListWhere(normalizeRepairListParams({ customer: "2", status: "受付,承認待ち", partEntries: "with", orderRequest: "pending" })), { AND: [
        { customerId: { in: [2] } },
        { status: { in: ["受付", "承認待ち"] } },
        { OR: [
            { repairLineItems: { some: { lineType: "PART" } } },
            { estimate: { items: { some: { type: "part" } } } },
        ] },
        { orderRequests: { some: { status: "pending" } } },
    ] });
});

test("new selections round-trip through the saved URL and reset the page", () => {
    const selected = normalizeRepairListParams({ partEntries: "with", orderRequest: "partial", page: "3" });
    const url = repairListUrl(selected);
    assert.equal(url, "/repairs?delivery=all&partEntries=with&orderRequest=partial");
    assert.deepEqual(normalizeRepairListParams(Object.fromEntries(new URL(url, "https://example.test").searchParams)), {
        ...selected, page: 1,
    });
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
