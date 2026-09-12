import assert from "node:assert/strict";
import test from "node:test";

import { CANONICAL_BRANDS } from "./canonical-brands";
import { normalizeBrandName } from "./master-normalize";
import { getIntakeBrandOptions, searchIntakeBrandOptions } from "./repair-intake-brand-search";

const brands = getIntakeBrandOptions([
  { id: 1, name: "ROLEX", nameEn: "ROLEX", nameJp: "ロレックス", brandKind: "NORMAL", isWatchBrand: true, aliases: [] },
  { id: 2, name: "DANIEL WELLINGTON", nameEn: "DANIEL WELLINGTON", nameJp: "ダニエル・ウェリントン", brandKind: "NORMAL", isWatchBrand: true, aliases: [{ alias: "DW" }] },
  { id: 3, name: "MUJI", nameEn: "MUJI", nameJp: "無印良品", brandKind: "NORMAL", isWatchBrand: true, aliases: [{ alias: "無印" }] },
  { id: 4, name: "VACHERON CONSTANTIN", nameEn: "VACHERON CONSTANTIN", nameJp: "ヴァシュロン・コンスタンタン", brandKind: "NORMAL", isWatchBrand: true, aliases: [{ alias: "バセロンコンスタンタン" }] },
  { id: 5, name: "UNKNOWN", nameEn: "UNKNOWN", nameJp: "不明", brandKind: "UNKNOWN", isWatchBrand: true, aliases: [{ alias: "不明" }] },
  { id: 6, name: "ROLEX TYPE", nameEn: "ROLEX TYPE", nameJp: "ロレックスタイプ", brandKind: "TYPE", isWatchBrand: true, aliases: [{ alias: "ロレックス" }] },
  { id: 7, name: "ETA", nameEn: "ETA", nameJp: "ETA", brandKind: "NORMAL", isWatchBrand: false, aliases: [] },
]);

test("searches canonical brand names and aliases with shared normalization", () => {
  assert.deepEqual(searchIntakeBrandOptions(brands, "ロレ").map((brand) => brand.name), ["ROLEX"]);
  assert.deepEqual(searchIntakeBrandOptions(brands, "DW").map((brand) => brand.name), ["DANIEL WELLINGTON"]);
  assert.deepEqual(searchIntakeBrandOptions(brands, "無印").map((brand) => brand.name), ["MUJI"]);
  assert.deepEqual(searchIntakeBrandOptions(brands, "バセロン").map((brand) => brand.name), ["VACHERON CONSTANTIN"]);
  assert.deepEqual(searchIntakeBrandOptions(brands, "不明").map((brand) => brand.name), ["UNKNOWN"]);
});

test("uses all matching brands without a display limit", () => {
  assert.equal(brands.some((brand) => brand.name === "ROLEX TYPE"), false);
  assert.equal(brands.some((brand) => brand.name === "ETA"), false);
  const manyBrands = getIntakeBrandOptions(Array.from({ length: 101 }, (_, index) => ({
    id: index + 1,
    name: `BRAND ${String(index).padStart(3, "0")}`,
    nameEn: null,
    nameJp: null,
    brandKind: "NORMAL" as const,
    isWatchBrand: true,
    aliases: [],
  })));
  assert.equal(searchIntakeBrandOptions(manyBrands, "").length, 101);
  assert.deepEqual(searchIntakeBrandOptions(manyBrands, "BRAND 100").map((brand) => brand.name), ["BRAND 100"]);
});

test("uses exactly the canonical B2C brand population", () => {
  assert.equal(CANONICAL_BRANDS.length, 297);
  assert.equal(CANONICAL_BRANDS.filter((brand) => brand.brandKind === "NORMAL").length, 292);
  assert.equal(CANONICAL_BRANDS.filter((brand) => brand.brandKind === "TYPE").length, 4);
  assert.equal(CANONICAL_BRANDS.filter((brand) => brand.brandKind === "UNKNOWN").length, 1);

  const options = getIntakeBrandOptions(CANONICAL_BRANDS.map((brand, index) => ({
    ...brand,
    id: index + 1,
    aliases: brand.aliases.map((alias) => ({ alias })),
  })));
  assert.equal(options.length, 292);
  assert.equal(options[0]?.name, "UNKNOWN");
  assert.deepEqual(options.slice(1).map((brand) => brand.name), [...options.slice(1)]
    .sort((left, right) => normalizeBrandName(left.sortName).localeCompare(normalizeBrandName(right.sortName), "en"))
    .map((brand) => brand.name));
  assert.equal(options.some((brand) => brand.name === "ETA"), false);
  assert.equal(options.some((brand) => brand.name.endsWith(" TYPE")), false);
});
