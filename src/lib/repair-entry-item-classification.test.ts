import assert from "node:assert/strict";
import test from "node:test";
import { getNewItemClassification } from "./repair-entry-item-classification";
import { getRepairPartType, RepairPartValidationError } from "./repair-part-validation";

test("manual interior and exterior parts carry matching classification to server validation", () => {
    const internal = getNewItemClassification("part_external", "part_internal");
    assert.deepEqual(internal, { category: "part_internal", partType: "interior" });
    assert.equal(getRepairPartType(internal), "interior");

    const external = getNewItemClassification("part_external", "part_external");
    assert.deepEqual(external, { category: "part_external", partType: "exterior" });
    assert.equal(getRepairPartType(external), "exterior");
});

test("conflicting part rows remain rejected", () => {
    assert.throws(
        () => getRepairPartType({ category: "part_external", partType: "interior" }),
        RepairPartValidationError
    );
});

test("technical labor classification stays unchanged without partType", () => {
    assert.deepEqual(getNewItemClassification("internal", "part_internal"), { category: "internal" });
    assert.deepEqual(getNewItemClassification("external_labor", "part_external"), { category: "external_labor" });
});
