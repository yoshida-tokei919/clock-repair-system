import assert from "node:assert/strict";
import test from "node:test";

import { canSelectRepairStatusStep, shouldSelectStatusStepOnDateChange } from "./repair-status-step-selection";

test("status step selection preserves shipping and reception restrictions", () => {
    assert.equal(canSelectRepairStatusStep("送付待ち", "受付"), true);
    assert.equal(canSelectRepairStatusStep("送付待ち", "作業中"), false);
    assert.equal(canSelectRepairStatusStep("受付", "送付待ち"), true);
    assert.equal(canSelectRepairStatusStep("作業中", "送付待ち"), false);
    assert.equal(canSelectRepairStatusStep("作業中", "作業完了"), true);
});

test("date selection changes status only for an allowed new date", () => {
    assert.equal(shouldSelectStatusStepOnDateChange("作業中", "作業完了", "2026-10-14", "2026-10-15"), true);
    assert.equal(shouldSelectStatusStepOnDateChange("作業中", "作業完了", "2026-10-14", "2026-10-14"), false);
    assert.equal(shouldSelectStatusStepOnDateChange("作業中", "作業完了", "2026-10-14", ""), false);
    assert.equal(shouldSelectStatusStepOnDateChange("送付待ち", "作業完了", "", "2026-10-15"), false);
    assert.equal(shouldSelectStatusStepOnDateChange("送付待ち", "受付", "", "2026-10-15"), true);
});
