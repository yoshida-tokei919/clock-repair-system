import assert from "node:assert/strict";
import test from "node:test";
import {
    getRepairStatusAfterOrderAssignment,
    getRepairStatusAfterPartsFlowCompletion,
    getRepairStatusFromActiveOrderStatuses,
} from "./repair-parts-status";

test("Case A: pending active order keeps repair parts waiting unordered", () => {
    assert.equal(getRepairStatusFromActiveOrderStatuses(["pending"]), "部品待ち(未注文)");
});

test("Case B: ordered active order keeps repair parts waiting ordered", () => {
    assert.equal(getRepairStatusFromActiveOrderStatuses(["ordered"]), "部品待ち(注文済み)");
});

test("Case C: received active order keeps repair parts received", () => {
    assert.equal(getRepairStatusFromActiveOrderStatuses(["received"]), "部品入荷済み");
});

test("Case D: last received order assignment advances received repair to work waiting", () => {
    assert.equal(
        getRepairStatusAfterOrderAssignment("部品入荷済み", ["assigned"]),
        "作業待ち",
    );
});

test("Case E: stock allocation completes a parts-waiting repair with no active order", () => {
    assert.equal(
        getRepairStatusAfterPartsFlowCompletion("部品待ち(未注文)", []),
        "作業待ち",
    );
});

test("Case F: estimating repair with no active order does not advance", () => {
    assert.equal(getRepairStatusAfterPartsFlowCompletion("見積中", []), null);
});

test("Case G: approval-waiting repair with no active order does not advance", () => {
    assert.equal(getRepairStatusAfterPartsFlowCompletion("承認待ち", []), null);
});

test("Case H: assigned-only order history does not roll work in progress back to received", () => {
    assert.equal(getRepairStatusFromActiveOrderStatuses(["assigned"]), null);
    assert.equal(getRepairStatusAfterPartsFlowCompletion("作業中", ["assigned"]), null);
});

test("a new pending order remains eligible to return work in progress to parts waiting", () => {
    assert.equal(
        getRepairStatusFromActiveOrderStatuses(["assigned", "pending"]),
        "部品待ち(未注文)",
    );
});

test("ordered takes precedence until every active order is received", () => {
    assert.equal(
        getRepairStatusFromActiveOrderStatuses(["received", "ordered"]),
        "部品待ち(注文済み)",
    );
});
