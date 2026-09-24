import assert from "node:assert/strict";
import test from "node:test";
import {
    hasWatchRefOverlap,
    hasPartRefOverlap,
    matchesInternalPartCandidate,
    matchesExteriorPartCandidate,
    matchesStandardPartNameIdentity,
    mergeWatchRefs,
    preserveStandardPartNameId,
    resolvePatchProductRef,
    watchRefsAllowIdentity,
} from "./parts-master-compatibility";
import { getRepairPartType, isExistingRepairPartLink, RepairPartValidationError, validateRepairPartItem, validateRepairPartStandardName } from "./repair-part-validation";
import { createOrUpdatePartsMaster } from "./parts-master";

const part = {
    brandId: 1,
    modelId: 10,
    watchRefs: "16233, 16610",
    standardPartNameId: "crown",
    nameJp: "リューズ",
    movementMakerId: null,
    caliberId: null,
    baseMakerId: null,
    baseCaliberId: null,
};

test("PATCH product Ref distinguishes clearing from omission for exterior part lookup", () => {
    const savedRef = "16233";
    const cleared = resolvePatchProductRef({ ref: "  " }, savedRef);
    assert.deepEqual(cleared, { name: null, supplied: true });
    assert.deepEqual(resolvePatchProductRef({ ref: "" }, savedRef), cleared);
    assert.equal(mergeWatchRefs(cleared.name, null), null);
    assert.equal(mergeWatchRefs(cleared.name, "196.123"), "196.123");
    const modelPart = { ...part, watchRefs: null };
    const selected = { brandId: 1, modelId: 10, standardPartNameId: "crown", standardPartName: "リューズ" };
    assert.equal(matchesExteriorPartCandidate(modelPart, { ...selected, currentRefs: mergeWatchRefs(cleared.name, null) }), true);
    assert.equal(matchesExteriorPartCandidate(modelPart, { ...selected, currentRefs: mergeWatchRefs(cleared.name, "196.123") }), false);

    const omitted = resolvePatchProductRef({}, savedRef);
    assert.deepEqual(omitted, { name: savedRef, supplied: false });
    assert.deepEqual(resolvePatchProductRef(undefined, savedRef), omitted);
    assert.equal(mergeWatchRefs(omitted.name, null), savedRef);

    const replaced = resolvePatchProductRef({ ref: "16610" }, savedRef);
    assert.deepEqual(replaced, { name: "16610", supplied: true });
    assert.equal(mergeWatchRefs(replaced.name, "196.123"), "16610, 196.123");
});

test("watch refs compare normalized whole tokens across supported separators", () => {
    assert.equal(hasWatchRefOverlap("１６２３", "16233, 16610"), false);
    assert.equal(hasWatchRefOverlap("１６２３３", "other、16233\nthird"), true);
});

test("exterior parts accept product or case Ref, and reject mismatches while any current Ref exists", () => {
    const selected = { brandId: 1, modelId: 10, standardPartNameId: "crown", standardPartName: "リューズ" };
    assert.equal(matchesExteriorPartCandidate(part, { ...selected, currentRefs: "16233, other" }), true);
    assert.equal(matchesExteriorPartCandidate(part, { ...selected, currentRefs: "other, 16610" }), true);
    assert.equal(matchesExteriorPartCandidate(part, { ...selected, currentRefs: "1623" }), false);
    assert.equal(matchesExteriorPartCandidate(part, { ...selected, currentRefs: "unrelated" }), false);
    assert.equal(matchesExteriorPartCandidate(part, { ...selected, brandId: 2, currentRefs: "16233" }), false);
    assert.equal(matchesExteriorPartCandidate({ ...part, partType: "interior" }, { ...selected, currentRefs: "16233" }), false);
});

test("exterior parts use Model fallback only without a current Ref", () => {
    const selected = { brandId: 1, modelId: 10, standardPartNameId: "crown", standardPartName: "リューズ" };
    assert.equal(matchesExteriorPartCandidate({ ...part, watchRefs: null }, selected), true);
    assert.equal(matchesExteriorPartCandidate({ ...part, modelId: 11 }, selected), false);
    assert.equal(matchesExteriorPartCandidate({ ...part, modelId: 11 }, { ...selected, currentRefs: "16610" }), true);
});

test("standard name requires exact ID, with only exact-name legacy fallback", () => {
    const selected = { brandId: 1, currentRefs: "16233", standardPartNameId: "crown", standardPartName: "リューズ" };
    assert.equal(matchesExteriorPartCandidate({ ...part, standardPartNameId: "tube" }, selected), false);
    assert.equal(matchesExteriorPartCandidate({ ...part, standardPartNameId: null }, selected), true);
    assert.equal(matchesExteriorPartCandidate({ ...part, standardPartNameId: null, nameJp: "リューズ管" }, selected), false);
    assert.equal(matchesExteriorPartCandidate({ ...part, standardPartNameId: null, nameJp: "リューズ管" }, { ...selected, searchTerm: "リューズ管" } as any), false);
    assert.equal(matchesExteriorPartCandidate({ ...part, standardPartNameId: null, nameJp: "リューズ管" }, { ...selected, standardDisplayName: "リューズ管" }), true);
    assert.equal(matchesStandardPartNameIdentity({ standardPartNameId: "tube", nameJp: "リューズ" }, { standardPartNameId: "crown", nameJp: "リューズ" }), false);
    assert.equal(matchesStandardPartNameIdentity({ standardPartNameId: null, nameJp: "リューズ" }, { standardPartNameId: "crown", nameJp: "リューズ" }, ["リューズ", "竜頭"]), true);
    assert.equal(matchesStandardPartNameIdentity({ standardPartNameId: null, nameJp: "リューズ管" }, { standardPartNameId: "crown", nameJp: "リューズ" }), false);
    assert.equal(matchesStandardPartNameIdentity({ standardPartNameId: null, nameJp: "リューズ管" }, { standardPartNameId: "crown", nameJp: "リューズ管" }, ["リューズ", "竜頭"]), false);
    assert.equal(matchesStandardPartNameIdentity({ standardPartNameId: null, nameJp: "リューズ管" }, { standardPartNameId: "crown", nameJp: "リューズ管" }), false);
});

test("new exterior identity requires overlapping nonempty refs before merging", () => {
    assert.equal(watchRefsAllowIdentity("16233", "16610"), false);
    assert.equal(watchRefsAllowIdentity("16233", "16233, 16610"), true);
    assert.equal(watchRefsAllowIdentity("16233", null), true);
    assert.equal(watchRefsAllowIdentity(null, "16610"), true);
    assert.equal(watchRefsAllowIdentity("1623", "16233"), false);
});

test("internal fitment accepts either complete maker and Cal pair with matching standard name", () => {
    const candidate = { partType: "interior", category: "internal", standardPartNameId: "wheel", nameJp: "歯車",
        movementMakerId: 1, caliberId: 10, baseMakerId: 2, baseCaliberId: 20 };
    const name = { standardPartNameId: "wheel" };
    assert.equal(matchesInternalPartCandidate(candidate, { ...name, movementMakerId: 1, movementCaliberId: 10 }), true);
    assert.equal(matchesInternalPartCandidate(candidate, { ...name, baseMovementMakerId: 2, baseMovementCaliberId: 20 }), true);
    assert.equal(matchesInternalPartCandidate(candidate, { ...name, movementMakerId: 1, movementCaliberId: 11,
        baseMovementMakerId: 2, baseMovementCaliberId: 21 }), false);
    assert.equal(matchesInternalPartCandidate(candidate, { ...name, movementMakerId: 1, movementCaliberId: 10,
        baseMovementMakerId: 2, baseMovementCaliberId: 21 }), true);
    assert.equal(matchesInternalPartCandidate(candidate, { ...name, movementMakerId: 1 }), false);
    assert.equal(matchesInternalPartCandidate(candidate, { ...name, movementMakerId: 1, movementCaliberId: 10,
        standardPartNameId: "other" }), false);
});

const crownName = {
    id: "crown", isActive: true, partType: "part_external", nameJa: "リューズ",
    displayJa: "竜頭", category: { partType: "part_external" },
};

test("repair part standard name rejects missing, invalid, wrong type, and conflicting IDs", () => {
    assert.throws(() => getRepairPartType({ partType: "interior", category: "part_external" }), RepairPartValidationError);
    assert.throws(() => getRepairPartType({ category: "unknown" }), RepairPartValidationError);
    assert.throws(() => validateRepairPartStandardName("exterior", null, null, null), RepairPartValidationError);
    assert.throws(() => validateRepairPartStandardName("exterior", "missing", null, null), RepairPartValidationError);
    assert.throws(() => validateRepairPartStandardName("interior", "crown", crownName, null), RepairPartValidationError);
    assert.throws(() => validateRepairPartStandardName("exterior", "crown", { ...crownName, isActive: false }, null), RepairPartValidationError);
    assert.throws(() => validateRepairPartStandardName("exterior", "crown", crownName, { standardPartNameId: "tube", nameJp: "リューズ" }), RepairPartValidationError);
    assert.equal(validateRepairPartStandardName("exterior", undefined, null, { standardPartNameId: "crown", nameJp: "リューズ" }, true), "crown");
});

test("repair part backfills a null legacy ID only from canonical or display Japanese name", () => {
    assert.equal(validateRepairPartStandardName("exterior", "crown", crownName, { standardPartNameId: null, nameJp: "リューズ" }), "crown");
    assert.equal(validateRepairPartStandardName("exterior", "crown", crownName, { standardPartNameId: null, nameJp: "竜頭" }), "crown");
    assert.throws(() => validateRepairPartStandardName("exterior", "crown", crownName, { standardPartNameId: null, nameJp: "リューズ管" }), RepairPartValidationError);
});

test("repair validation requires an active category-matched name for new parts", async () => {
    const db = { partNameMaster: { findUnique: async ({ where }: any) => where.id === "crown" ? crownName : null } } as any;
    const context = { partType: "exterior" as const, brandId: 1, modelId: 10, currentRefs: "16233" };
    await assert.rejects(validateRepairPartItem(db, undefined, null, context), RepairPartValidationError);
    await assert.rejects(validateRepairPartItem(db, "missing", null, context), RepairPartValidationError);
    await assert.rejects(validateRepairPartItem(db, "crown", null, { ...context, partType: "interior" }), RepairPartValidationError);
    assert.equal((await validateRepairPartItem(db, "crown", null, context)).id, "crown");
});

test("repair validation preserves an omitted linked ID and restricts legacy backfill", async () => {
    const db = { partNameMaster: { findUnique: async () => crownName } } as any;
    const context = { partType: "exterior" as const, brandId: 1, modelId: 10, currentRefs: "16233" };
    const linked = { ...part, partType: "exterior", category: "external" };
    await assert.rejects(validateRepairPartItem(db, undefined, linked, context), RepairPartValidationError);
    assert.equal((await validateRepairPartItem(db, undefined, linked, { ...context, allowLegacyResave: true })).id, "crown");
    await assert.rejects(validateRepairPartItem(db, 123, linked, { ...context, allowLegacyResave: true }), RepairPartValidationError);
    await assert.rejects(validateRepairPartItem(db, "crown", { ...linked, standardPartNameId: "tube" }, context), RepairPartValidationError);
    assert.equal((await validateRepairPartItem(db, undefined, { ...linked, standardPartNameId: null }, { ...context, allowLegacyResave: true })).id, null);
    assert.equal((await validateRepairPartItem(db, "crown", { ...linked, standardPartNameId: null }, context)).id, "crown");
    await assert.rejects(validateRepairPartItem(db, "crown", { ...linked, standardPartNameId: null, nameJp: "リューズ管" }, context), RepairPartValidationError);
});

function fakePartsDb(candidates: any[]) {
    const writes: Array<{ operation: string; id?: number; data: any }> = [];
    const db = {
        brand: { findUnique: async ({ where }: any) => ({ id: where.id }) },
        model: { findUnique: async ({ where }: any) => ({ id: where.id }) },
        caliber: { findUnique: async ({ where }: any) => ({ id: where.id }) },
        partsMaster: {
            findMany: async () => candidates,
            findUnique: async ({ where }: any) => candidates.find((part) => part.id === where.id) ?? null,
            update: async ({ where, data }: any) => { writes.push({ operation: "update", id: where.id, data }); return { id: where.id, ...data }; },
            create: async ({ data }: any) => { writes.push({ operation: "create", data }); return { id: 99, ...data }; },
        },
    } as any;
    return { db, writes };
}

async function saveExteriorAgainst(candidate: any, incoming: { watchRefs: string | null; modelId: number | null; partRefs: string | null }) {
    const { db, writes } = fakePartsDb([candidate]);
    await createOrUpdatePartsMaster({ partType: "exterior", category: "part_external", brandId: 1,
        modelId: incoming.modelId, watchRefs: incoming.watchRefs, nameJp: "リューズ", partRefs: incoming.partRefs,
        standardPartNameId: "crown", standardNameCandidates: ["リューズ", "竜頭"] }, db);
    return writes;
}

test("Ref-less exterior row gains a current Ref only with equal non-null Model and exact partRef", async () => {
    const candidate = { id: 5, ...part, partType: "exterior", category: "external", watchRefs: null,
        gradeId: null, grade: null, partRefs: "24-603-0, 88" };
    const reused = await saveExteriorAgainst(candidate, { watchRefs: "16233", modelId: 10, partRefs: "２４－６０３－０" });
    assert.equal(reused[0].operation, "update");
    assert.equal(reused[0].data.watchRefs, "16233");
    for (const incoming of [
        { watchRefs: "16233", modelId: 10, partRefs: "24-603" },
        { watchRefs: "16233", modelId: 10, partRefs: "unrelated" },
        { watchRefs: "16233", modelId: 10, partRefs: null },
        { watchRefs: "16233", modelId: null, partRefs: "24-603-0" },
        { watchRefs: "16233", modelId: 11, partRefs: "24-603-0" },
    ]) {
        assert.equal((await saveExteriorAgainst(candidate, incoming))[0].operation, "create");
    }
    assert.equal(hasPartRefOverlap("24-603", "24-603-0"), false);
});

test("no-current-Ref Model fallback keeps candidate refs and requires exact partRef when present", async () => {
    const candidate = { id: 5, ...part, partType: "exterior", category: "external",
        gradeId: null, grade: null, partRefs: "24-603-0" };
    const reused = await saveExteriorAgainst(candidate, { watchRefs: null, modelId: 10, partRefs: "24-603-0" });
    assert.equal(reused[0].operation, "update");
    assert.equal(reused[0].data.watchRefs, candidate.watchRefs);
    assert.equal((await saveExteriorAgainst(candidate, { watchRefs: null, modelId: 10, partRefs: "24-603" }))[0].operation, "create");
});

test("repair-driven internal part only reuses a master matching a complete movement or base pair", async () => {
    const candidate = { id: 5, partType: "interior", category: "internal", standardPartNameId: "wheel",
        nameJp: "歯車", movementMakerId: 1, caliberId: 10, baseMakerId: 2, baseCaliberId: 20,
        gradeId: null, grade: null, partRefs: null };
    const input = { partType: "interior", category: "part_internal", standardPartNameId: "wheel",
        nameJp: "歯車", movementMakerId: 1, caliberId: 11, baseMakerId: 2, baseCaliberId: 21 };
    const wrong = fakePartsDb([candidate]);
    await createOrUpdatePartsMaster(input, wrong.db, { strictRepairIdentity: true });
    assert.equal(wrong.writes[0].operation, "create");
    const byBase = fakePartsDb([candidate]);
    await createOrUpdatePartsMaster({ ...input, baseCaliberId: 20 }, byBase.db, { strictRepairIdentity: true });
    assert.equal(byBase.writes[0].operation, "update");
    const noPair = fakePartsDb([candidate]);
    await createOrUpdatePartsMaster({ ...input, movementMakerId: null, caliberId: null,
        baseMakerId: null, baseCaliberId: null }, noPair.db, { strictRepairIdentity: true });
    assert.equal(noPair.writes[0].operation, "create");
});

test("new exterior entry never auto-merges disjoint nonempty watch Refs", async () => {
    const candidate = { id: 5, ...part, partType: "exterior", category: "external", watchRefs: "16610", gradeId: null, grade: null, partRefs: "24-603-0" };
    const { db, writes } = fakePartsDb([candidate]);
    await createOrUpdatePartsMaster({ partType: "exterior", category: "part_external", brandId: 1,
        modelId: 10, watchRefs: "16233", nameJp: "リューズ", partRefs: "24-603-0", standardPartNameId: "crown",
        standardNameCandidates: ["リューズ", "竜頭"] }, db);
    assert.equal(writes[0].operation, "create");
    assert.equal(candidate.watchRefs, "16610");
});

test("safe exterior reuse merges overlapping watch Refs after identity checks", async () => {
    const candidate = { id: 5, ...part, partType: "exterior", category: "external", watchRefs: "16233, 16610", gradeId: null, grade: null, partRefs: "24-603-0" };
    const { db, writes } = fakePartsDb([candidate]);
    await createOrUpdatePartsMaster({ partType: "exterior", category: "part_external", brandId: 1,
        modelId: 10, watchRefs: "１６２３３, 116610", nameJp: "リューズ", partRefs: "24-603-0", standardPartNameId: "crown",
        standardNameCandidates: ["リューズ", "竜頭"] }, db);
    assert.deepEqual(writes.map(({ operation, id }) => ({ operation, id })), [{ operation: "update", id: 5 }]);
    assert.equal(writes[0].data.watchRefs, "16233, 16610, 116610");
});

test("legacy Ref-less exterior candidate with a different Model stays separate", async () => {
    const candidate = { id: 5, ...part, partType: "exterior", category: "external", modelId: 11,
        watchRefs: null, gradeId: null, grade: null, partRefs: "24-603-0" };
    const { db, writes } = fakePartsDb([candidate]);
    await createOrUpdatePartsMaster({ partType: "exterior", category: "part_external", brandId: 1,
        modelId: 10, watchRefs: "16233", nameJp: "リューズ", partRefs: "24-603-0", standardPartNameId: "crown",
        standardNameCandidates: ["リューズ", "竜頭"] }, db);
    assert.equal(writes[0].operation, "create");
});

test("editable part name cannot authorize a null-ID legacy merge", async () => {
    const candidate = { id: 5, ...part, partType: "exterior", category: "external", standardPartNameId: null,
        nameJp: "リューズ管", gradeId: null, grade: null, partRefs: "24-603-0" };
    const { db, writes } = fakePartsDb([candidate]);
    await createOrUpdatePartsMaster({ partType: "exterior", category: "part_external", brandId: 1,
        modelId: 10, watchRefs: "16233", nameJp: "リューズ管", partRefs: "24-603-0", standardPartNameId: "crown",
        standardNameCandidates: ["リューズ", "竜頭"] }, db);
    assert.equal(writes[0].operation, "create");
});

test("repair-linked update preserves old Ref and ID, and rejects a conflicting ID", async () => {
    const candidate = { id: 5, ...part, partType: "exterior", category: "external", watchRefs: "16233, 16610",
        gradeId: null, grade: null, partRefs: "24-603-0" };
    const { db, writes } = fakePartsDb([candidate]);
    await createOrUpdatePartsMaster({ id: 5, repairLinkedMaster: true, partType: "exterior", category: "external",
        brandId: 1, modelId: 10, watchRefs: "１６２３３, 116610", nameJp: "リューズ" }, db);
    assert.equal(writes[0].data.standardPartNameId, "crown");
    assert.equal(writes[0].data.watchRefs, "16233, 16610, 116610");
    await assert.rejects(createOrUpdatePartsMaster({ id: 5, repairLinkedMaster: true, partType: "exterior",
        category: "external", brandId: 1, modelId: 10, watchRefs: "16233", nameJp: "リューズ",
        standardPartNameId: "tube" }, db), RepairPartValidationError);
    assert.equal(writes.length, 1);
});

test("repair save rejects a linked exterior part with an incompatible current Ref", async () => {
    const db = { partNameMaster: { findUnique: async () => crownName } } as any;
    const linked = { ...part, partType: "exterior", category: "external" };
    await assert.rejects(
        validateRepairPartItem(db, "crown", linked, { partType: "exterior", brandId: 1, modelId: 10, currentRefs: "1623" }),
        RepairPartValidationError
    );
    const valid = await validateRepairPartItem(db, "crown", linked, { partType: "exterior", brandId: 1, modelId: 10, currentRefs: "16610" });
    assert.equal(valid.id, "crown");
});

test("repair save checks linked internal movement or base Cal and preserves no-context resave", async () => {
    const internalName = { id: "wheel", isActive: true, partType: "part_internal", nameJa: "歯車",
        displayJa: null, category: { partType: "part_internal" } };
    const db = { partNameMaster: { findUnique: async () => internalName } } as any;
    const linked = { ...part, partType: "interior", category: "internal", standardPartNameId: "wheel", nameJp: "歯車",
        movementMakerId: 1, caliberId: 10, baseMakerId: 2, baseCaliberId: 20 };
    const context = { partType: "interior" as const, brandId: null, modelId: null, currentRefs: null };
    assert.equal((await validateRepairPartItem(db, "wheel", linked,
        { ...context, movementMakerId: 1, movementCaliberId: 10 })).id, "wheel");
    assert.equal((await validateRepairPartItem(db, "wheel", linked,
        { ...context, baseMovementMakerId: 2, baseMovementCaliberId: 20 })).id, "wheel");
    await assert.rejects(validateRepairPartItem(db, "wheel", linked,
        { ...context, movementMakerId: 1, movementCaliberId: 11,
            baseMovementMakerId: 2, baseMovementCaliberId: 21 }), RepairPartValidationError);
    // Existing repair lines with no complete current pair remain saveable without inventing a Cal.
    assert.equal((await validateRepairPartItem(db, "wheel", linked,
        { ...context, movementMakerId: 1, allowLegacyResave: true })).id, "wheel");
    await assert.rejects(validateRepairPartItem(db, "wheel", linked,
        { ...context, movementMakerId: 1 }), RepairPartValidationError);
});

test("only a persisted PART line of this Repair with the same part is a legacy resave", async () => {
    // PATCH queries these links with repairId and lineType=PART before replacement.
    const links = new Map<number, number | null>([[12, 5], [13, null]]);
    for (const [lineId, partId, expected] of [
        ["12", 5, true], [12, "5", true], ["12", 6, false],
        ["auto-12", 5, false], ["12x", 5, false], ["0", 5, false],
        [undefined, 5, false], ["13", 5, false], ["99", 5, false],
    ] as const) {
        assert.equal(isExistingRepairPartLink(lineId, partId, links), expected);
    }
    const db = { partNameMaster: { findUnique: async () => crownName } } as any;
    const linked = { ...part, partType: "exterior", category: "external" };
    const context = { partType: "exterior" as const, brandId: 1, modelId: 10, currentRefs: "16233" };
    // POST has no persisted links, regardless of an incoming line id.
    assert.equal(isExistingRepairPartLink("12", 5, new Map()), false);
    await assert.rejects(validateRepairPartItem(db, undefined, linked, context), RepairPartValidationError);
    // PATCH with the same persisted line and part preserves an existing ID or old null.
    assert.equal((await validateRepairPartItem(db, undefined, linked, { ...context, allowLegacyResave: true })).id, "crown");
    assert.equal((await validateRepairPartItem(db, undefined, { ...linked, standardPartNameId: null },
        { ...context, allowLegacyResave: true })).id, null);
    // Changing the part on the same line, or using any new line, requires selection.
    assert.equal(isExistingRepairPartLink("12", 6, links), false);
    for (const lineId of ["auto-1", undefined, "99"]) {
        assert.equal(isExistingRepairPartLink(lineId, 5, links), false);
        await assert.rejects(validateRepairPartItem(db, undefined, linked, context), RepairPartValidationError);
    }
});

test("omitted non-null standard ID on true resave is revalidated against the current master", async () => {
    const linked = { ...part, partType: "exterior", category: "external" };
    const context = { partType: "exterior" as const, brandId: 1, modelId: 10, currentRefs: "16233", allowLegacyResave: true };
    for (const name of [null, { ...crownName, isActive: false },
        { ...crownName, partType: "part_internal" },
        { ...crownName, category: { partType: "part_internal" } }]) {
        const db = { partNameMaster: { findUnique: async () => name } } as any;
        await assert.rejects(validateRepairPartItem(db, null, linked, context), RepairPartValidationError);
    }
});

test("no-Cal exemption belongs only to same-link resave; complete context checks fitment", async () => {
    const internalName = { id: "wheel", isActive: true, partType: "part_internal", nameJa: "歯車",
        displayJa: null, category: { partType: "part_internal" } };
    const db = { partNameMaster: { findUnique: async () => internalName } } as any;
    const linked = { ...part, partType: "interior", category: "internal", standardPartNameId: "wheel", nameJp: "歯車",
        movementMakerId: 1, caliberId: 10, baseMakerId: 2, baseCaliberId: 20 };
    const context = { partType: "interior" as const, brandId: null, modelId: null, currentRefs: null };
    assert.equal((await validateRepairPartItem(db, null, linked, { ...context, allowLegacyResave: true })).id, "wheel");
    await assert.rejects(validateRepairPartItem(db, "wheel", linked, context), RepairPartValidationError);
    await assert.rejects(validateRepairPartItem(db, "wheel", linked,
        { ...context, movementMakerId: 1, movementCaliberId: 11 }), RepairPartValidationError);
    assert.equal((await validateRepairPartItem(db, "wheel", linked,
        { ...context, movementMakerId: 1, movementCaliberId: 10 })).id, "wheel");
});

test("generic PartsMaster without repair option retains no-complete-pair candidate reuse", async () => {
    const candidate = { id: 5, partType: "interior", category: "internal", standardPartNameId: "wheel",
        nameJp: "歯車", movementMakerId: 1, caliberId: 10, baseMakerId: null, baseCaliberId: null,
        gradeId: null, grade: null, partRefs: null };
    const input = { partType: "interior", category: "part_internal", standardPartNameId: "wheel",
        nameJp: "歯車", movementMakerId: null, caliberId: null, baseMakerId: null, baseCaliberId: null };
    const generic = fakePartsDb([candidate]);
    await createOrUpdatePartsMaster(input, generic.db);
    assert.equal(generic.writes[0].operation, "update");
    const repair = fakePartsDb([candidate]);
    await createOrUpdatePartsMaster(input, repair.db, { strictRepairIdentity: true });
    assert.equal(repair.writes[0].operation, "create");
});

test("merging refs preserves old tokens and avoids normalized duplicates", () => {
    assert.equal(mergeWatchRefs("16233、16610", "１６２３３, 116610"), "16233, 16610, 116610");
    assert.equal(mergeWatchRefs("16233", null), "16233");
    assert.equal(preserveStandardPartNameId("crown", undefined), "crown");
    assert.equal(preserveStandardPartNameId(null, "crown"), "crown");
});
