import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findOrCreateBrand, matchesBrandSearch, normalizeBrandName } from "../src/lib/master-normalize";
import { CANONICAL_BRANDS } from "../src/lib/canonical-brands";
import { filterCalibersForMaker, filterModelsForBrand } from "../src/lib/brand-drilldown";

assert.equal(normalizeBrandName("BELL＆ROSS"), normalizeBrandName("BELL & ROSS"));
assert.equal(normalizeBrandName("GLASHÜTTE"), normalizeBrandName("GLASHUTTE"));
assert.equal(normalizeBrandName("AGNÈS B."), normalizeBrandName("AGNES B"));
assert.equal(normalizeBrandName("アニエスベー"), "アニエスベー");
assert.equal(normalizeBrandName("ジーショック"), "ジーショック");
assert.equal(normalizeBrandName("ヴァシュロン"), "ヴァシュロン");
assert.notEqual(normalizeBrandName("ROLEX"), normalizeBrandName("ROLEX TYPE"));
assert.notEqual(normalizeBrandName("CHRISTIAN DIOR"), normalizeBrandName("DIOR"));

const rolex = CANONICAL_BRANDS.find((brand) => brand.name === "ROLEX");
const rolexType = CANONICAL_BRANDS.find((brand) => brand.name === "ROLEX TYPE");
const eta = CANONICAL_BRANDS.find((brand) => brand.name === "ETA");
assert.ok(rolex && matchesBrandSearch("ROL", [rolex.name, rolex.nameEn, rolex.nameJp, ...rolex.aliases]));
assert.ok(rolex && matchesBrandSearch("ロレ", [rolex.name, rolex.nameEn, rolex.nameJp, ...rolex.aliases]));
assert.ok(rolex && matchesBrandSearch("ロレッ", [rolex.name, rolex.nameEn, rolex.nameJp, ...rolex.aliases]));
assert.ok(matchesBrandSearch("オメ", ["OMEGA", "OMEGA", "オメガ"]));
assert.ok(matchesBrandSearch("バセロン", ["VACHERON CONSTANTIN", "ヴァシュロン・コンスタンタン", "バセロンコンスタンタン"]));
assert.ok(rolexType?.isWatchBrand && rolexType.brandKind === "TYPE");
assert.ok(!rolexType || rolexType.brandKind === "TYPE");
assert.ok(eta?.isMovementMaker && !eta.isWatchBrand);
assert.deepEqual(filterModelsForBrand([{ id: 1, brandId: 10 }, { id: 2, brandId: 20 }], 10).map((model) => model.id), [1]);
assert.deepEqual(filterCalibersForMaker([{ id: 1, brandId: 10 }, { id: 2, brandId: 20 }], 20).map((caliber) => caliber.id), [2]);

const migrationSql = readFileSync("prisma/migrations/20260910_add_brand_aliases_and_kinds/migration.sql", "utf8");
for (const field of ["movementMakerId", "baseMovementMakerId", "baseMakerId"]) {
    assert.match(migrationSql, new RegExp(`"${field}"`));
}
assert.match(migrationSql, /SET "isMovementMaker" = true/);

async function testMovementMakerRoles() {
    const brands: any[] = [{ id: 1, name: "ROLEX", nameEn: "ROLEX", nameJp: "ロレックス", isWatchBrand: true, isMovementMaker: false }];
    const db: any = {
        brandAlias: { findUnique: async () => null },
        brand: {
            findMany: async () => brands,
            create: async ({ data }: any) => {
                const created = { id: brands.length + 1, ...data, aliases: undefined };
                brands.push(created);
                return created;
            },
            update: async ({ where, data }: any) => {
                const brand = brands.find((item) => item.id === where.id);
                Object.assign(brand, data);
                return brand;
            },
        },
    };

    const sellita = await findOrCreateBrand(db, "SELLITA", { isWatchBrand: false, isMovementMaker: true });
    assert.equal(sellita.isWatchBrand, false);
    assert.equal(sellita.isMovementMaker, true);

    const rolexAsMaker = await findOrCreateBrand(db, "ROLEX", { isWatchBrand: false, isMovementMaker: true });
    assert.equal(rolexAsMaker.isWatchBrand, true);
    assert.equal(rolexAsMaker.isMovementMaker, true);
}

testMovementMakerRoles()
    .then(() => console.log("brand normalization tests passed"))
    .catch((error) => { console.error(error); process.exitCode = 1; });
