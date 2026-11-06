import assert from "node:assert/strict";
import test from "node:test";
import { formatQuantity, normalizeQuantityUnit } from "./quantity-unit";

test("quantity units remain optional and separate from price", () => {
  assert.equal(normalizeQuantityUnit(null), null);
  assert.equal(normalizeQuantityUnit(" か所 "), "か所");
  assert.equal(formatQuantity(2, normalizeQuantityUnit("本")), "2本");
  assert.equal(formatQuantity(2, null), "2");
  assert.throws(() => normalizeQuantityUnit("a".repeat(21)));
});
