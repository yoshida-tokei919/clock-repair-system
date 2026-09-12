import assert from "node:assert/strict";
import test from "node:test";
import {
    getRepairStatusAfterOrderAssignment,
    getRepairStatusFromActiveOrderStatuses,
} from "./repair-parts-status";

test("Case A: last received order assignment advances received repair to work waiting", () => {
    assert.equal(
        getRepairStatusAfterOrderAssignment("部品入荷済み", ["assigned"]),
        "作業待ち",
    );
});

test("Case B: assigned-only order history does not roll work waiting back to received", () => {
    assert.equal(getRepairStatusFromActiveOrderStatuses(["assigned"]), null);
});

test("Case C: assigned-only order history does not roll work in progress back to received", () => {
    assert.equal(getRepairStatusFromActiveOrderStatuses(["assigned"]), null);
});

test("Case D: a new pending order remains eligible to return work in progress to parts waiting", () => {
    assert.equal(
        getRepairStatusFromActiveOrderStatuses(["assigned", "pending"]),
        "部品待ち(未注文)",
    );
});

test("Case E: ordered takes precedence until every active order is received", () => {
    assert.equal(
        getRepairStatusFromActiveOrderStatuses(["received", "ordered"]),
        "部品待ち(注文済み)",
    );
});
