import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { findOrCreateCaliber, normalizeBrandName } from "./master-normalize";
import { resolveRepairMovementMaker } from "./repair-movement-maker";

function fakeDb() {
    const brands: any[] = [
        { id: 1, name: "ETA", nameEn: "ETA", nameJp: "ETA", brandKind: "NORMAL", isWatchBrand: false, isMovementMaker: true },
        { id: 2, name: "ROLEX", nameEn: "ROLEX", nameJp: "ロレックス", brandKind: "NORMAL", isWatchBrand: true, isMovementMaker: false },
        { id: 3, name: "TYPE", nameEn: "TYPE", nameJp: "種別", brandKind: "TYPE", isWatchBrand: true, isMovementMaker: false },
    ];
    const aliases: any[] = [{ normalizedAlias: normalizeBrandName("ETA SA"), brandId: 1 }];
    const calibers: any[] = [{ id: 1, brandId: 1, name: "2892.A2" }];
    const db = {
        brandAlias: {
            findUnique: async ({ where }: any) => {
                const alias = aliases.find((item) => item.normalizedAlias === where.normalizedAlias);
                return alias ? { ...alias, brand: brands.find((brand) => brand.id === alias.brandId) } : null;
            },
        },
        brand: {
            findMany: async () => brands,
            create: async ({ data }: any) => {
                const brand = { id: brands.length + 1, brandKind: "NORMAL", ...data };
                brands.push(brand);
                aliases.push({ normalizedAlias: data.aliases.create.normalizedAlias, brandId: brand.id });
                return brand;
            },
            update: async ({ where, data }: any) => {
                const brand = brands.find((item) => item.id === where.id);
                Object.assign(brand, data);
                return brand;
            },
        },
        caliber: {
            findMany: async ({ where }: any) => calibers.filter((caliber) => caliber.brandId === where.brandId),
            create: async ({ data }: any) => {
                const caliber = { id: calibers.length + 1, ...data };
                calibers.push(caliber);
                return caliber;
            },
        },
    };
    return { db, brands, aliases, calibers };
}

test("repair maker reuses canonical and alias names, preserving existing maker IDs", async () => {
    const { db, brands } = fakeDb();
    assert.equal(await resolveRepairMovementMaker(db as any, " ETA "), 1);
    assert.equal(await resolveRepairMovementMaker(db as any, "eta sa"), 1);
    assert.equal(brands.length, 3);
    assert.equal(brands[0].isWatchBrand, false);
});

test("new repair maker and Cal are scoped to the created movement-only Brand", async () => {
    const { db, brands, aliases, calibers } = fakeDb();
    const makerId = await resolveRepairMovementMaker(db as any, " Sellita ");
    const caliber = await findOrCreateCaliber(db as any, " Cal. SW200 ", makerId);
    assert.equal(brands.find((brand) => brand.id === makerId)?.isMovementMaker, true);
    assert.equal(brands.find((brand) => brand.id === makerId)?.isWatchBrand, false);
    assert.equal(aliases.at(-1)?.normalizedAlias, normalizeBrandName("Sellita"));
    assert.equal(caliber.brandId, makerId);
    assert.equal((await findOrCreateCaliber(db as any, "SW200", makerId)).id, caliber.id);
    assert.equal(await resolveRepairMovementMaker(db as any, "SELLITA"), makerId);
    assert.equal(brands.length, 4);
    assert.equal(calibers.length, 2);
});

test("base maker uses the same resolution and keeps Cal under its own Brand", async () => {
    const { db, calibers } = fakeDb();
    const baseMakerId = await resolveRepairMovementMaker(db as any, "ETA SA");
    const baseCal = await findOrCreateCaliber(db as any, "2892.A2", baseMakerId);
    assert.equal(baseMakerId, 1);
    assert.equal(baseCal.id, 1);
    assert.equal(calibers.length, 1);
});

test("TYPE maker collision rejects before mutation and empty maker resolves to null", async () => {
    const { db, brands } = fakeDb();
    await assert.rejects(resolveRepairMovementMaker(db as any, "type"), /種別ブランド/);
    assert.equal(await resolveRepairMovementMaker(db as any, "  "), null);
    assert.equal(brands.length, 3);
});

test("existing watch Brand becomes a movement maker without losing its watch role", async () => {
    const { db, brands } = fakeDb();
    assert.equal(await resolveRepairMovementMaker(db as any, "ロレックス"), 2);
    assert.equal(brands[1].isMovementMaker, true);
    assert.equal(brands[1].isWatchBrand, true);
    assert.equal(brands.length, 3);
});

test("repair form keeps both maker fields free-entry with selected-maker Cal options", () => {
    const source = ts.createSourceFile(
        "RepairEntryForm.tsx",
        readFileSync("src/components/repairs/RepairEntryForm.tsx", "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
    );
    const inputs = new Map<string, Map<string, string>>();
    const visit = (node: ts.Node) => {
        if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "AdvancedCombobox") {
            const props = new Map(node.attributes.properties
                .filter(ts.isJsxAttribute)
                .map((attribute) => [attribute.name.getText(source), attribute.initializer?.getText(source) ?? ""]));
            const value = props.get("value")?.replace(/[{}]/g, "");
            if (value) inputs.set(value, props);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);

    for (const [maker, change, calOptions] of [
        ["movementMaker", "handleMovementMakerChange", "filteredMovementCalOpts"],
        ["baseMovementMaker", "handleBaseMovementMakerChange", "filteredBaseMovementCalOpts"],
    ]) {
        const input = inputs.get(maker);
        assert.equal(input?.get("onChange"), `{${change}}`);
        assert.equal(input?.get("options"), "{movementMakerOpts}");
        assert.equal(input?.has("requireSelection"), false);
        assert.equal(inputs.get(maker === "movementMaker" ? "movementCaliber" : "baseMovementCaliber")?.get("options"), `{${calOptions}}`);
    }
    assert.equal(inputs.get("brand")?.has("requireSelection"), true);
});
