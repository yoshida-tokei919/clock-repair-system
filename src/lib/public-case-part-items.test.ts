import assert from "node:assert/strict";
import test from "node:test";
import { partItemInputs } from "./public-case-part-items";

test("part inputs retain existing IDs and ignore blank new rows", () => {
  assert.deepEqual(partItemInputs([{ id: 3, displayName: "  風防  " }, { displayName: " " }, { displayName: " 竜頭 " }]), [
    { id: 3, displayName: "風防" },
    { displayName: "竜頭" },
  ]);
  assert.deepEqual(partItemInputs([]), []);
});

test("part inputs reject duplicate IDs and malformed rows", () => {
  for (const value of [
    null, {}, Array(101).fill({ displayName: "部品" }),
    [{ id: 1, displayName: "A" }, { id: 1, displayName: "B" }],
    [{ id: 0, displayName: "A" }], [{ id: "1", displayName: "A" }],
    [{ id: 1, displayName: " " }], [{ displayName: 12 }], [null], [[]],
  ]) {
    assert.equal(partItemInputs(value), null);
  }
});
