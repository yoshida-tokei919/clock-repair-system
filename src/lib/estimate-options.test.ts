import assert from "node:assert/strict";
import test from "node:test";
import { assertNoUnansweredAlternatives, canEditEstimateOptions, commonEstimateAmountMatches, documentTokenIncludesRepair, isIssuedOptionPdfCurrent, isSameOptionApproval, issuedOptionSourceHash, optionTotals, parseOptionSet, selectedOptionTotal, validateOptionSelection } from "./estimate-options";

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

test("issued common-line amount matches exclusive subtotal or inclusive subtotal plus tax", () => {
  const lines = [{ unitPrice: 2200, quantity: 1 }];
  assert.equal(commonEstimateAmountMatches(lines, { totalAmount: 2200, taxAmount: 220 }, "EXCLUSIVE"), true);
  assert.equal(commonEstimateAmountMatches(lines, { totalAmount: 2000, taxAmount: 200 }, "INCLUSIVE"), true);
  assert.equal(commonEstimateAmountMatches(lines, { totalAmount: 2000, taxAmount: 200 }, "EXCLUSIVE"), false);
  assert.equal(commonEstimateAmountMatches(lines, { totalAmount: 2200, taxAmount: 220 }, "INCLUSIVE"), false);
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

test("selection accepts exactly one plan and independent add-ons, rejecting tampering and duplicates", () => {
  const set = { choices: [
    { id: 1, kind: "PLAN", lines: [line] }, { id: 2, kind: "PLAN", lines: [line] },
    { id: 3, kind: "ADD_ON", lines: [line] }, { id: 4, kind: "ADD_ON", lines: [line] },
  ] };
  assert.deepEqual(validateOptionSelection(set, 2, [3, 4]).addOns.map(choice => choice.id), [3, 4]);
  assert.equal(validateOptionSelection(set, 1, []).plan?.id, 1);
  for (const [planId, addOns] of [[null, []], [3, []], [1, [2]], [1, [3, 3]], [1, [999]]]) {
    assert.throws(() => validateOptionSelection(set, planId, addOns), /選択|プラン|追加作業/);
  }
  assert.equal(validateOptionSelection({ choices: [set.choices[2]] }, null, []).plan, null);
});

test("document token scope rejects another customer and non-B2B repair", () => {
  const doc = { customerId: 8, repairs: [{ id: 10 }, { id: 11 }] };
  assert.equal(documentTokenIncludesRepair(doc, { id: 11, customerId: 8, customerType: "business" }), true);
  assert.equal(documentTokenIncludesRepair(doc, { id: 12, customerId: 8, customerType: "business" }), false);
  assert.equal(documentTokenIncludesRepair(doc, { id: 11, customerId: 9, customerType: "business" }), false);
  assert.equal(documentTokenIncludesRepair(doc, { id: 11, customerId: 8, customerType: "individual" }), false);
});

test("issued PDF check rejects old version, superseded file, missing source and changed hash", () => {
  const pdf = { id: 20, estimateDocumentId: 4, status: "current", storageKey: "saved", hash: "pdf-hash", fileSize: 100,
    optionSourceHashes: { "10": "source-hash" } };
  assert.equal(isIssuedOptionPdfCurrent(pdf, 4, 10, 20, "source-hash"), true);
  assert.equal(isIssuedOptionPdfCurrent(pdf, 4, 10, 19, "source-hash"), false);
  assert.equal(isIssuedOptionPdfCurrent({ ...pdf, status: "superseded" }, 4, 10, 20, "source-hash"), false);
  assert.equal(isIssuedOptionPdfCurrent({ ...pdf, optionSourceHashes: null }, 4, 10, 20, "source-hash"), false);
  assert.equal(isIssuedOptionPdfCurrent(pdf, 4, 10, 20, "changed"), false);
  assert.equal(isIssuedOptionPdfCurrent(pdf, 5, 10, 20, "source-hash"), false);
});

test("retry matches only the original PDF, selection, approver, and source", () => {
  const previous = { pdfFileId: 20, planChoiceId: 2, addOnChoiceIds: [3, 4], approverName: "担当者", optionSourceHash: "issued" };
  assert.equal(isSameOptionApproval(previous, { ...previous, addOnChoiceIds: [4, 3] }), true);
  assert.equal(isSameOptionApproval(previous, { ...previous, pdfFileId: 21 }), false);
  assert.equal(isSameOptionApproval(previous, { ...previous, planChoiceId: 1 }), false);
  assert.equal(isSameOptionApproval(previous, { ...previous, addOnChoiceIds: [3] }), false);
  assert.equal(isSameOptionApproval(previous, { ...previous, approverName: "別担当" }), false);
  assert.equal(isSameOptionApproval(previous, { ...previous, optionSourceHash: "stale" }), false);
});

test("issued source hash changes with common lines, option lines, and document totals", () => {
  const doc = { id: 4, customerId: 8, pricingTaxMode: "EXCLUSIVE", totalAmount: 1000, taxAmount: 100,
    estimateNumber: "TE-004", issuedDate: new Date("2026-10-19T00:00:00Z"),
    customer: { type: "business", name: "取引先", companyName: "取引先", address: "東京" } };
  const repair = { id: 10, customerId: 8, inquiryNumber: "T-010", partnerRef: null, endUserName: null, customerNote: "説明",
    watch: { timepieceType: null, timepieceTypeLabel: null, serialNumber: "SN-10", brand: { name: "Brand" }, model: null, reference: null, caseReference: null },
    estimate: { pricingTaxMode: "EXCLUSIVE", totalAmount: 1000, taxAmount: 100,
    discountAmount: 0, shipping: 0, items: [{ id: 5, itemName: "共通", type: "labor", unitPrice: 1000, quantity: 1, partsMasterId: null,
      sourceAreaSnapshot: null, categoryNameSnapshot: null, targetPartNameSnapshot: null, actionNameSnapshot: null,
      detailLabelSnapshot: null, b2cDisplayNameSnapshot: null, gradeNameSnapshot: null }] },
    estimateOptionSet: { id: 6, title: "選択", notes: null, isActive: true, choices: [{ id: 7, kind: "ADD_ON", name: "追加", notes: null, recommended: false, sortOrder: 0,
      lines: [{ id: 8, sortOrder: 0, lineType: "LABOR", itemNameSnapshot: "追加", displayNameSnapshot: null, notesForCustomerSnapshot: null,
        workTypeSnapshot: null, categoryNameSnapshot: null, actionNameSnapshot: null, targetPartNameSnapshot: null, detailLabelSnapshot: null,
        partsMasterId: null, pricingRuleId: null, repairWorkCategoryId: null, repairWorkActionId: null, targetPartNameId: null, quantity: 1, unitPrice: 200 }] }] } };
  const hash = issuedOptionSourceHash(doc, repair);
  assert.equal(hash, issuedOptionSourceHash(doc, structuredClone(repair)));
  const changed = structuredClone(repair); changed.estimate.items[0].unitPrice = 1200;
  assert.notEqual(hash, issuedOptionSourceHash(doc, changed));
  changed.estimate.items[0].unitPrice = 1000; changed.estimateOptionSet.choices[0].lines[0].unitPrice = 300;
  assert.notEqual(hash, issuedOptionSourceHash(doc, changed));
  assert.notEqual(hash, issuedOptionSourceHash({ ...doc, totalAmount: 1100 }, repair));
  assert.notEqual(hash, issuedOptionSourceHash({ ...doc, issuedDate: new Date("2026-10-20T00:00:00Z") }, repair));
  assert.notEqual(hash, issuedOptionSourceHash({ ...doc, customer: { ...doc.customer, address: "大阪" } }, repair));
  const changedText = structuredClone(repair); changedText.customerNote = "変更後";
  assert.notEqual(hash, issuedOptionSourceHash(doc, changedText));
});
