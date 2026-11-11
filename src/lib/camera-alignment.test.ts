import assert from "node:assert/strict";
import test from "node:test";
import { containedImageRect } from "./camera-alignment";

test("alignment rect follows horizontal and vertical object-contain letterboxes", () => {
  assert.deepEqual(containedImageRect(400, 300, 1920, 1080), { left: 0, top: 37.5, width: 400, height: 225 });
  assert.deepEqual(containedImageRect(400, 300, 1080, 1920), { left: 115.625, top: 0, width: 168.75, height: 300 });
  assert.deepEqual(containedImageRect(0, 300, 1920, 1080), { left: 0, top: 0, width: 0, height: 0 });
});
