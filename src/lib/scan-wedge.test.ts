import assert from "node:assert/strict";
import test from "node:test";
import { advanceWedgeBuffer, EMPTY_WEDGE_BUFFER } from "./scan-wedge";

function keys(input: string, gap: number, enterGap = gap) {
  let state = EMPTY_WEDGE_BUFFER;
  for (let i = 0; i < input.length; i++) state = advanceWedgeBuffer(state, input[i], i * gap).buffer;
  return advanceWedgeBuffer(state, "Enter", (input.length - 1) * gap + enterGap);
}

test("fast four-character keyboard wedge sequence terminates on Enter", () => {
  assert.equal(keys("ABCD", 20).scan, "ABCD");
  assert.equal(keys("ABC", 20).scan, null);
  assert.equal(keys("ABCD", 81).scan, null);
  assert.equal(keys("ABCD", 20, 81).scan, null);
});

test("stale gap resets buffer, and slow typing cannot later become a scan", () => {
  let state = advanceWedgeBuffer(EMPTY_WEDGE_BUFFER, "A", 0).buffer;
  state = advanceWedgeBuffer(state, "B", 350).buffer;
  assert.equal(state.value, "B");
  assert.equal(keys("ABCDE", 100).scan, null);
  assert.deepEqual(advanceWedgeBuffer(state, "Enter", 360).buffer, EMPTY_WEDGE_BUFFER);
});
