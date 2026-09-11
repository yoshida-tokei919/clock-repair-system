import assert from "node:assert/strict";
import test from "node:test";

import { getIntakeBrandOptions, searchIntakeBrandOptions } from "./repair-intake-brand-search";

const brands = getIntakeBrandOptions([
  { id: 1, name: "ROLEX", nameEn: "ROLEX", nameJp: "ロレックス", brandKind: "NORMAL", aliases: [] },
  { id: 2, name: "DANIEL WELLINGTON", nameEn: "DANIEL WELLINGTON", nameJp: "ダニエル・ウェリントン", brandKind: "NORMAL", aliases: [{ alias: "DW" }] },
  { id: 3, name: "MUJI", nameEn: "MUJI", nameJp: "無印良品", brandKind: "NORMAL", aliases: [{ alias: "無印" }] },
  { id: 4, name: "VACHERON CONSTANTIN", nameEn: "VACHERON CONSTANTIN", nameJp: "ヴァシュロン・コンスタンタン", brandKind: "NORMAL", aliases: [{ alias: "バセロンコンスタンタン" }] },
  { id: 5, name: "UNKNOWN", nameEn: "UNKNOWN", nameJp: "不明", brandKind: "UNKNOWN", aliases: [{ alias: "不明" }] },
  { id: 6, name: "ROLEX TYPE", nameEn: "ROLEX TYPE", nameJp: "ロレックスタイプ", brandKind: "TYPE", aliases: [{ alias: "ロレックス" }] },
]);

test("searches canonical brand names and aliases with shared normalization", () => {
  assert.deepEqual(searchIntakeBrandOptions(brands, "ロレ").map((brand) => brand.name), ["ROLEX"]);
  assert.deepEqual(searchIntakeBrandOptions(brands, "DW").map((brand) => brand.name), ["DANIEL WELLINGTON"]);
  assert.deepEqual(searchIntakeBrandOptions(brands, "無印").map((brand) => brand.name), ["MUJI"]);
  assert.deepEqual(searchIntakeBrandOptions(brands, "バセロン").map((brand) => brand.name), ["VACHERON CONSTANTIN"]);
  assert.deepEqual(searchIntakeBrandOptions(brands, "不明").map((brand) => brand.name), ["UNKNOWN"]);
});

test("excludes TYPE brands and searches beyond the display limit", () => {
  assert.equal(brands.some((brand) => brand.name === "ROLEX TYPE"), false);
  const manyBrands = getIntakeBrandOptions(Array.from({ length: 101 }, (_, index) => ({
    id: index + 1,
    name: `BRAND ${String(index).padStart(3, "0")}`,
    nameEn: null,
    nameJp: null,
    brandKind: "NORMAL" as const,
    aliases: [],
  })));
  assert.deepEqual(searchIntakeBrandOptions(manyBrands, "BRAND 100").map((brand) => brand.name), ["BRAND 100"]);
});
