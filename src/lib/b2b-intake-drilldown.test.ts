import assert from "node:assert/strict";
import test from "node:test";
import { changeBrand, changeModel, changeRef, filterIntakeChoices, intakeComboboxKeyDecision, matchingModel, nextIntakeChoiceIndex, optionsForRow, shouldPreventB2bBatchEnter } from "./b2b-intake-drilldown";

test("cumulative query filters all watch fields and brand aliases", () => {
  const brands = [{ value: "ROLEX", label: "ロレックス", searchKeys: ["ろれっくす", "勞力士"] },
    { value: "RADO", label: "ラドー" }, { value: "OMEGA", label: "オメガ" }];
  assert.deepEqual(filterIntakeChoices(brands, "R").map((item) => item.value), ["ROLEX", "RADO"]);
  assert.deepEqual(filterIntakeChoices(brands, "RO").map((item) => item.value), ["ROLEX"]);
  assert.deepEqual(filterIntakeChoices(brands, "ろれ").map((item) => item.value), ["ROLEX"]);
  assert.deepEqual(filterIntakeChoices(brands, "勞力").map((item) => item.value), ["ROLEX"]);
  for (const [values, query] of [
    [["Explorer", "Omega"], "Exp"], [["16233", "20233"], "16"], [["3135", "3235"], "31"],
  ] as const) {
    assert.deepEqual(filterIntakeChoices(values.map((value) => ({ value, label: value })), query)
      .map((item) => item.value), [values[0]]);
  }
});

test("keyboard candidate navigation wraps within the filtered list and handles empty results", () => {
  const choices = [{ value: "ROLEX", label: "ロレックス" }, { value: "RADO", label: "ラドー" },
    { value: "OMEGA", label: "オメガ" }];
  const count = filterIntakeChoices(choices, "R").length;
  assert.equal(count, 2);
  assert.equal(nextIntakeChoiceIndex(-1, "ArrowDown", count), 0);
  assert.equal(nextIntakeChoiceIndex(0, "ArrowDown", count), 1);
  assert.equal(nextIntakeChoiceIndex(1, "ArrowDown", count), 0);
  assert.equal(nextIntakeChoiceIndex(-1, "ArrowUp", count), 1);
  assert.equal(nextIntakeChoiceIndex(0, "ArrowUp", count), 1);
  assert.equal(nextIntakeChoiceIndex(0, "ArrowDown", 0), -1);
});

test("Escape then ArrowUp or ArrowDown reopens on the intended filtered candidate for Enter", () => {
  const count = filterIntakeChoices([
    { value: "ROLEX", label: "ロレックス" }, { value: "RADO", label: "ラドー" },
    { value: "OMEGA", label: "オメガ" },
  ], "R").length;
  for (const [arrow, expected] of [["ArrowUp", 1], ["ArrowDown", 0]] as const) {
    const closed = intakeComboboxKeyDecision({ open: true, activeIndex: 0 }, "Escape", count);
    assert.deepEqual(closed, { state: { open: false, activeIndex: -1 }, selectedIndex: null });
    assert.equal(intakeComboboxKeyDecision(closed.state, "Enter", count).selectedIndex, null);
    const reopened = intakeComboboxKeyDecision(closed.state, arrow, count);
    assert.deepEqual(reopened.state, { open: true, activeIndex: expected });
    assert.equal(intakeComboboxKeyDecision(reopened.state, "Enter", count).selectedIndex, expected);
  }
  assert.equal(intakeComboboxKeyDecision({ open: true, activeIndex: -1 }, "Enter", count).selectedIndex, null);
  assert.equal(intakeComboboxKeyDecision({ open: true, activeIndex: 0 }, "Enter", 0).selectedIndex, null);
});

test("Enter in an input cannot implicitly submit while IME and textarea retain native behavior", () => {
  assert.equal(shouldPreventB2bBatchEnter("Enter", "INPUT", false), true);
  assert.equal(shouldPreventB2bBatchEnter("Enter", "INPUT", true), false);
  assert.equal(shouldPreventB2bBatchEnter("Enter", "TEXTAREA", false), false);
  assert.equal(shouldPreventB2bBatchEnter("ArrowDown", "INPUT", false), false);
  assert.equal(shouldPreventB2bBatchEnter("ArrowUp", "INPUT", false), false);
  assert.equal(shouldPreventB2bBatchEnter("Enter", "BUTTON", false), false);
});

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
