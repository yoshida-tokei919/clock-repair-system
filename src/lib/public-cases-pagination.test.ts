import assert from "node:assert/strict";
import test from "node:test";
import {
  buildB2CGalleryWhere,
  buildPublicCaseBizWhere,
  normalizePublicCasePage,
  normalizePublicCasePageSize,
  normalizePublicCaseSearchQuery,
  parsePublicCaseGalleryOffset,
} from "./public-cases";

test("page and page size reject invalid or excessive values", () => {
  assert.equal(normalizePublicCasePage("-1"), 1);
  assert.equal(normalizePublicCasePage("3.5"), 1);
  assert.equal(normalizePublicCasePage("100001"), 100000);
  assert.equal(normalizePublicCasePage("2"), 2);
  assert.equal(normalizePublicCasePageSize("50"), 50);
  assert.equal(normalizePublicCasePageSize("100"), 100);
  assert.equal(normalizePublicCasePageSize("500"), 30);
  assert.equal(normalizePublicCaseSearchQuery("  A　 B  "), "A B");
  assert.equal(parsePublicCaseGalleryOffset(null), 0);
  assert.equal(parsePublicCaseGalleryOffset("30"), 30);
  assert.equal(parsePublicCaseGalleryOffset("-1"), null);
  assert.equal(parsePublicCaseGalleryOffset("100001"), null);
});

test("gallery query keeps filters and publication guards in the same where", () => {
  const where = buildB2CGalleryWhere("cal 123", "OMEGA");
  const encoded = JSON.stringify(where);
  assert.match(encoded, /"b2cPublishStatus":"PUBLISHED"/);
  assert.match(encoded, /"reviewStatus":"APPROVED"/);
  assert.match(encoded, /"showPriceB2c":false/);
  assert.match(encoded, /"brandName":"OMEGA"/);
  assert.match(encoded, /"searchText"/);
  assert.match(encoded, /"NOT"/);
});

test("business lookup combines focused fields instead of widening them", () => {
  const where = buildPublicCaseBizWhere({
    q: "時計", brand: "OMEGA", model: "Speedmaster", ref: "123", cal: "321", work: "OH",
  });
  const clauses = where.AND;
  assert.ok(Array.isArray(clauses));
  assert.equal(clauses.length, 6);
  const encoded = JSON.stringify(where);
  for (const value of ["OMEGA", "Speedmaster", "123", "321", "OH"]) {
    assert.ok(encoded.includes(value));
  }
  assert.match(encoded, /"workItems"/);
  assert.match(encoded, /"partItems"/);
});
