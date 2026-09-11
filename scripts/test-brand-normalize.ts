import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findOrCreateBrand, matchesBrandSearch, normalizeBrandName } from "../src/lib/master-normalize";
import { CANONICAL_BRANDS, canonicalBrandUpdateData } from "../src/lib/canonical-brands";
import { filterCalibersForMaker, filterModelsForBrand } from "../src/lib/brand-drilldown";

assert.equal(normalizeBrandName("BELL＆ROSS"), normalizeBrandName("BELL & ROSS"));
assert.equal(normalizeBrandName("GLASHÜTTE"), normalizeBrandName("GLASHUTTE"));
assert.equal(normalizeBrandName("AGNÈS B."), normalizeBrandName("AGNES B"));
assert.equal(normalizeBrandName("アニエスベー"), "アニエスベー");
assert.equal(normalizeBrandName("ジーショック"), "ジーショック");
assert.equal(normalizeBrandName("ヴァシュロン"), "ヴァシュロン");
assert.notEqual(normalizeBrandName("ROLEX"), normalizeBrandName("ROLEX TYPE"));
assert.notEqual(normalizeBrandName("CHRISTIAN DIOR"), normalizeBrandName("DIOR"));

const canonicalOwnerByNormalizedAlias = new Map<string, string>();
for (const brand of CANONICAL_BRANDS) {
    for (const alias of [brand.name, brand.nameEn, brand.nameJp, ...brand.aliases]) {
        const normalized = normalizeBrandName(alias);
        const owner = canonicalOwnerByNormalizedAlias.get(normalized);
        assert.ok(!owner || owner === brand.name, `${alias} conflicts with ${owner}`);
        canonicalOwnerByNormalizedAlias.set(normalized, brand.name);
    }
}

const rolex = CANONICAL_BRANDS.find((brand) => brand.name === "ROLEX");
const rolexType = CANONICAL_BRANDS.find((brand) => brand.name === "ROLEX TYPE");
const eta = CANONICAL_BRANDS.find((brand) => brand.name === "ETA");
const dior = CANONICAL_BRANDS.find((brand) => brand.name === "DIOR");
const christianDior = CANONICAL_BRANDS.find((brand) => brand.name === "CHRISTIAN DIOR");
const seiko = CANONICAL_BRANDS.find((brand) => brand.name === "SEIKO");
const gShock = CANONICAL_BRANDS.find((brand) => brand.name === "G-SHOCK");
const danielWellington = CANONICAL_BRANDS.find((brand) => brand.name === "DANIEL WELLINGTON");
const tiffany = CANONICAL_BRANDS.find((brand) => brand.name === "TIFFANY & CO.");
const jacob = CANONICAL_BRANDS.find((brand) => brand.name === "JACOB & CO.");
const vanCleef = CANONICAL_BRANDS.find((brand) => brand.name === "VAN CLEEF & ARPELS");
const baume = CANONICAL_BRANDS.find((brand) => brand.name === "BAUME & MERCIER");
const gc = CANONICAL_BRANDS.find((brand) => brand.name === "Gc");
const heuer = CANONICAL_BRANDS.find((brand) => brand.name === "HEUER");
const tagHeuer = CANONICAL_BRANDS.find((brand) => brand.name === "TAG HEUER");
assert.ok(rolex && matchesBrandSearch("ROL", [rolex.name, rolex.nameEn, rolex.nameJp, ...rolex.aliases]));
assert.ok(rolex && matchesBrandSearch("ロレ", [rolex.name, rolex.nameEn, rolex.nameJp, ...rolex.aliases]));
assert.ok(rolex && matchesBrandSearch("ロレッ", [rolex.name, rolex.nameEn, rolex.nameJp, ...rolex.aliases]));
assert.ok(matchesBrandSearch("オメ", ["OMEGA", "OMEGA", "オメガ"]));
assert.ok(matchesBrandSearch("バセロン", ["VACHERON CONSTANTIN", "ヴァシュロン・コンスタンタン", "バセロンコンスタンタン"]));
assert.ok(rolexType?.isWatchBrand && rolexType.brandKind === "TYPE");
assert.ok(!rolexType || rolexType.brandKind === "TYPE");
assert.ok(eta?.isMovementMaker && !eta.isWatchBrand);
assert.ok(dior && christianDior && dior.name !== christianDior.name);
assert.ok(seiko?.aliases.includes("LOOGER"));
assert.ok(gShock?.aliases.includes("GーSHOCK"));
assert.ok(danielWellington?.aliases.includes("DW"));
assert.ok(tiffany?.aliases.includes("TIFFANY") && tiffany.aliases.includes("TIFFANY&CO"));
assert.ok(jacob?.aliases.includes("JACOB ＆ CO") && jacob.aliases.includes("JACOB & CO"));
assert.ok(vanCleef?.aliases.includes("VAN CLEEF＆ARPELS"));
assert.ok(baume?.aliases.includes("BAUME&MERCIER"));
assert.ok(gc?.aliases.includes("GC") && gc.name !== "GUESS");
assert.ok(heuer && tagHeuer && heuer.name !== tagHeuer.name);
for (const excluded of ["ALAX", "Bando", "KCB", "MTY NETWORKS", "ROYAL NATURE", "バンド", "懐中時計", "掛時計", "置時計", "ドイツ掛時計", "ハンドメイド時計"]) {
    assert.equal(CANONICAL_BRANDS.some((brand) => brand.name === excluded), false, `${excluded} must not be a canonical brand`);
}
for (const brand of CANONICAL_BRANDS) {
    assert.equal(brand.aliases.some((alias) => /掛時計|置時計|懐中時計|ドイツ掛時計|ハンドメイド時計|バンド/.test(alias)), false, `${brand.name} has a non-brand alias`);
}
assert.equal(canonicalBrandUpdateData({ ...rolex!, isMovementMaker: false }).isMovementMaker, undefined);
assert.equal(canonicalBrandUpdateData({ ...eta!, isMovementMaker: true }).isMovementMaker, true);
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
