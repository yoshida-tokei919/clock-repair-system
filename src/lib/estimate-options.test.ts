import assert from "node:assert/strict";
import test from "node:test";
import { assertNoUnansweredAlternatives, canEditEstimateOptions, optionTotals, parseOptionSet, selectedOptionTotal } from "./estimate-options";

const line = { lineType: "LABOR", itemNameSnapshot: "追加調整", quantity: 1, unitPrice: 1000 };
const plan = (name: string) => ({ kind: "PLAN", name, recommended: false, lines: [line] });

test("active set allows add-on only or two plans, and rejects one plan or empty choices", () => {
  assert.throws(() => parseOptionSet({ title: "", isActive: true, choices: [plan("A")] }), /2案/);
  assert.throws(() => parseOptionSet({ title: "", isActive: true, choices: [] }), /追加作業/);
  assert.equal(parseOptionSet({ title: "", isActive: true, choices: [{ kind: "ADD_ON", name: "任意", recommended: false, lines: [line] }] }).choices.length, 1);
  const set = parseOptionSet({ title: "見積", isActive: true, choices: [plan("A"), plan("B"), { kind: "ADD_ON", name: "任意", recommended: false, lines: [line] }] });
  assert.equal(set.choices.length, 3);
  assert.equal(set.choices[2].kind, "ADD_ON");
});

test("choice totals include common work with the existing inclusive or exclusive tax rule", () => {
  const choices = parseOptionSet({ title: "", isActive: true, choices: [plan("A"), plan("B")] }).choices;
  assert.deepEqual(optionTotals([{ unitPrice: 2200, quantity: 1 }], choices, "EXCLUSIVE")[0], { commonAmount: 2200, planAmount: 1000, addOnAmount: 0, totalAmount: 3200, taxAmount: 320, grossAmount: 3520 });
  assert.deepEqual(optionTotals([{ unitPrice: 2200, quantity: 1 }], choices, "INCLUSIVE")[0], { commonAmount: 2200, planAmount: 1000, addOnAmount: 0, totalAmount: 2910, taxAmount: 290, grossAmount: 3200 });
});

test("selected total includes only chosen plan and add-ons; add-on preview is incremental", () => {
  const common = [{ unitPrice: 2200, quantity: 1 }];
  const planA = plan("A");
  const planB = { ...plan("B"), lines: [{ ...line, unitPrice: 5000 }] };
  const addOn = { kind: "ADD_ON", name: "任意", lines: [{ ...line, unitPrice: 300 }] };
  const addOn2 = { kind: "ADD_ON", name: "任意2", lines: [{ ...line, unitPrice: 200 }] };
  assert.deepEqual(selectedOptionTotal(common, planA, [addOn], "EXCLUSIVE"), { commonAmount: 2200, planAmount: 1000, addOnAmount: 300, totalAmount: 3500, taxAmount: 350, grossAmount: 3850 });
  assert.equal(selectedOptionTotal(common, planB, [addOn, addOn2], "EXCLUSIVE").grossAmount, 8470);
  assert.deepEqual(selectedOptionTotal(common, null, [addOn], "INCLUSIVE"), { commonAmount: 2200, planAmount: 0, addOnAmount: 300, totalAmount: 2273, taxAmount: 227, grossAmount: 2500 });
  assert.equal(optionTotals(common, [planA, planB, addOn], "EXCLUSIVE")[0].grossAmount, 3520);
  assert.equal(optionTotals(common, [planA, planB, addOn], "EXCLUSIVE")[2].grossAmount, 330);
});

test("any active unanswered set blocks ordinary approval, including add-on only", async () => {
  for (const active of [false, true]) {
    const tx = { estimateOptionSet: { findUnique: async () => ({ isActive: active }) } };
    if (active) await assert.rejects(assertNoUnansweredAlternatives(tx as never, 1), /回答が必要/);
    else await assert.doesNotReject(assertNoUnansweredAlternatives(tx as never, 1));
  }
});

test("issued, approved, and terminal repairs cannot edit option drafts", () => {
  const open = { status: "見積中", approvalStatus: "pending", estimateDocumentId: null };
  assert.equal(canEditEstimateOptions(open), true);
  assert.equal(canEditEstimateOptions({ ...open, approvalStatus: "approved" }), false);
  assert.equal(canEditEstimateOptions({ ...open, estimateDocumentId: 9 }), false);
  for (const status of ["キャンセル", "修理不可返却", "キャンセル返却", "納品済み"]) {
    assert.equal(canEditEstimateOptions({ ...open, status }), false);
  }
});
