import assert from "node:assert/strict";
import test from "node:test";
import { changeBrand, changeModel, changeRef, matchingModel, optionsForRow } from "./b2b-intake-drilldown";

const row = { brandId: "1", model: "Explorer", ref: "101", caliber: "3135", serial: "S1" };
const models = {
  1: [{ id: 11, name: "Explorer", nameEn: "Explorer I", nameJp: "エクスプローラー" }],
  2: [{ id: 22, name: "Seamaster", nameEn: null, nameJp: "シーマスター" }],
};
const refs = {
  "1:11": [{ name: "101", caliber: { name: "3135" } }, { name: "102", caliber: null }],
  "2:22": [{ name: "202", caliber: { name: "8800" } }],
};
const brandCalibers = { 1: [{ name: "3135" }, { name: "3235" }], 2: [{ name: "8800" }] };
const modelCalibers = { "1:11": [{ name: "3135" }], "2:22": [{ name: "8800" }] };

test("model lookup normalizes name, nameJp and nameEn", () => {
  for (const value of ["  EXPLORER  ", " エクスプローラー ", "  explorer   i "]) {
    assert.equal(matchingModel(models[1], value)?.id, 11);
  }
  assert.equal(matchingModel(models[1], "unknown"), undefined);
});

test("brand and model changes clear downstream watch fields", () => {
  assert.deepEqual(changeBrand(row, "2"), { ...row, brandId: "2", model: "", ref: "", caliber: "" });
  assert.deepEqual(changeModel(row, "Other"), { ...row, model: "Other", ref: "", caliber: "" });
});

test("known Ref fills watch caliber, then manual caliber can be changed", () => {
  const selected = changeRef({ ...row, caliber: "manual" }, "101", refs["1:11"]);
  assert.equal(selected.caliber, "3135");
  assert.equal({ ...selected, caliber: "manual" }.caliber, "manual");
  assert.equal(changeRef(selected, "102", refs["1:11"]).caliber, "");
  assert.equal(changeRef(selected, "unlisted", refs["1:11"]).caliber, "");
});

test("late lookup responses stay keyed to the selected brand and model", () => {
  const current = { ...row, brandId: "2", model: "Seamaster", ref: "" };
  const options = optionsForRow(current, models, refs, brandCalibers, modelCalibers);
  assert.deepEqual(options.refs.map((ref) => ref.name), ["202"]);
  assert.deepEqual(options.calibers.map((caliber) => caliber.name), ["8800"]);
  assert.deepEqual(optionsForRow({ ...current, model: "New model" }, models, refs, brandCalibers, modelCalibers).refs, []);
  assert.deepEqual(optionsForRow({ ...current, model: "New model" }, models, refs, brandCalibers, modelCalibers).calibers, brandCalibers[2]);
  assert.deepEqual(optionsForRow(current, models, refs, brandCalibers, {}).calibers, brandCalibers[2]);
  assert.deepEqual(optionsForRow(current, models, { "1:22": refs["2:22"] }, brandCalibers, { "1:22": modelCalibers["2:22"] }).refs, []);
});
