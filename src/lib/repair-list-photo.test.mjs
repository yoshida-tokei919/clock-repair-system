import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRepairListPhoto } from "./repair-list-photo.ts";

const photo = (id, stage) => ({ id, stage, storageKey: `photo-${id}` });

test("prefers the newest reception FRONT over newer FRONT and other-category photos", () => {
    assert.equal(selectRepairListPhoto(photo(9, "WORK"), [photo(4, "RECEPTION"), photo(7, "WORK"), photo(5, "RECEPTION")])?.id, 5);
});

test("uses the newest FRONT of any stage when there is no reception FRONT", () => {
    assert.equal(selectRepairListPhoto(photo(9, "RECEPTION"), [photo(3, null), photo(7, "WORK"), photo(6, "COMPLETION")])?.id, 7);
});

test("falls back to the latest photo when there is no FRONT", () => {
    assert.equal(selectRepairListPhoto(photo(9, null), [])?.id, 9);
});

test("returns no photo when the repair has none", () => {
    assert.equal(selectRepairListPhoto(undefined, []), undefined);
});
