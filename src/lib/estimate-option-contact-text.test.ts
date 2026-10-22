import assert from "node:assert/strict";
import test from "node:test";
import { buildEstimateContactText, buildEstimateOptionContactText, CONTACT_QUOTE_BEGIN, displayEstimateOptionContactNote, manualOnlyEstimateContactNote, getGeneratedSectionText, isTargetEstimateCustomer, replaceOrRemoveGeneratedSection, sharedEstimateExplanation, TARGET_COMPANY_NAME_PART } from "./estimate-option-contact-text";

const quote = (mode: "INCLUSIVE" | "EXCLUSIVE") => buildEstimateOptionContactText({
  inquiryNumber: "A-002", commonLines: [{ itemName: "共通作業", quantity: 1, unitPrice: 17000 }], mode,
  choices: [
    { kind: "PLAN", name: "通常", lines: [{ itemName: "通常修理", quantity: 1, unitPrice: 44000 }] },
    { kind: "PLAN", name: "FIT", lines: [{ itemName: "FIT修理", quantity: 1, unitPrice: 9900 }] },
    { kind: "ADD_ON", name: "任意", lines: [{ itemName: "追加", quantity: 1, unitPrice: 1100 }] },
  ],
});

test("inclusive proposal has 61,000 and 26,900 yen plan totals, common work and separate add-on", () => {
  const text = quote("INCLUSIVE")!;
  assert.doesNotMatch(text, /案件番号：/);
  assert.match(text, /通常修理 ×1：44,000円\n共通作業を含む税込合計：61,000円/);
  assert.match(text, /FIT修理 ×1：9,900円\n共通作業を含む税込合計：26,900円/);
  assert.match(text, /任意の追加作業（プランと組み合わせ可能）/);
  assert.match(text, /追加額（税込）：1,100円/);
  assert.match(text, /プランは1つお選びください/);
});

test("exclusive proposal uses tax-aware gross totals and labels optional amount as pre-tax", () => {
  const text = quote("EXCLUSIVE")!;
  assert.match(text, /共通作業 税抜：17,000円/);
  assert.match(text, /共通作業を含む税込合計：67,100円/);
  assert.match(text, /共通作業を含む税込合計：29,590円/);
  assert.match(text, /追加額（税抜）：1,100円/);
});

test("active plans produce a quote with no common estimate lines", () => {
  const text = buildEstimateOptionContactText({ commonLines: [], mode: "INCLUSIVE", choices: [
    { kind: "PLAN", name: "FIT", lines: [{ itemName: "FIT", quantity: 1, unitPrice: 9900 }] },
  ] });
  assert.match(text!, /9,900/);
  assert.match(text!, /0/);
});

test("marked replacement is idempotent and preserves handwritten communication verbatim", () => {
  const handwritten = "納期は要相談。\nA-002 の連絡事項。";
  const once = replaceOrRemoveGeneratedSection(handwritten, quote("INCLUSIVE"));
  assert.equal(once.endsWith(handwritten), true);
  assert.equal(getGeneratedSectionText(once), quote("INCLUSIVE"));
  assert.equal(replaceOrRemoveGeneratedSection(once, quote("INCLUSIVE")), once);
  assert.equal((once.match(/【見積選択肢・自動生成ここから】/g) ?? []).length, 1);
  assert.equal(replaceOrRemoveGeneratedSection(once, null), handwritten);
  assert.equal(getGeneratedSectionText(replaceOrRemoveGeneratedSection(once, null)), null);
  const staleEditor = "更新後の手入力メモ";
  assert.equal(getGeneratedSectionText(replaceOrRemoveGeneratedSection(staleEditor, getGeneratedSectionText(once))), quote("INCLUSIVE"));
});

test("normal estimate includes persisted identity, item amounts, inclusive total, then manual note", () => {
  const generated = buildEstimateContactText({
    endUserName: "山田様", inquiryNumber: "A-002", mode: "EXCLUSIVE",
    watch: { brand: { name: "SEIKO" }, model: { name: "Grand Seiko" }, reference: { name: "SBGX" }, caseReference: { name: "9F" }, serialNumber: "12345" },
    commonLines: [{ itemName: "分解掃除", quantity: 2, unitPrice: 10000 }],
  })!;
  assert.match(generated, /^山田様\nSEIKO Grand Seiko\nRef：SBGX 9F\nシリアル番号：12345/);
  assert.doesNotMatch(generated, /案件番号：/);
  assert.match(generated, /分解掃除 ×2：20,000円/);
  assert.match(generated, /税込合計：22,000円/);
  const saved = replaceOrRemoveGeneratedSection("納期3週間", generated);
  assert.match(displayEstimateOptionContactNote(saved), /【お客様への連絡】\n\n納期3週間$/);
  assert.equal(manualOnlyEstimateContactNote(saved), "納期3週間");
  assert.equal(replaceOrRemoveGeneratedSection(saved, generated), saved);
  assert.equal(replaceOrRemoveGeneratedSection(saved.replace("納期3週間", "納期4週間"), generated).endsWith("納期4週間"), true);
});

test("Ref line uses available model and case references without extra spaces", () => {
  const base = { inquiryNumber: "A-001", commonLines: [{ itemName: "修理", quantity: 1, unitPrice: 1000 }], mode: "INCLUSIVE" as const };
  for (const [watch, expected] of [
    [{ reference: { name: "SBGX" }, caseReference: { name: "9F" } }, "Ref：SBGX 9F"],
    [{ reference: { name: "SBGX" } }, "Ref：SBGX"],
    [{ caseReference: { name: "9F" } }, "Ref：9F"],
    [{ reference: { name: "  SBGX " }, caseReference: { name: " " } }, "Ref：SBGX"],
    [{}, null],
  ] as const) {
    const text = buildEstimateContactText({ ...base, watch })!;
    assert.equal(text.split("\n").find(line => line.startsWith("Ref：")) ?? null, expected);
    assert.doesNotMatch(text, /案件番号：|モデルRef：|ケースRef：/);
  }
});

test("legacy appended quote moves ahead of manual notes without duplication", () => {
  const old = `納期3週間\n\n${CONTACT_QUOTE_BEGIN}\n旧見積\n【見積選択肢・自動生成ここまで】`;
  const updated = replaceOrRemoveGeneratedSection(old, "新見積");
  assert.equal(updated.endsWith("納期3週間"), true);
  assert.equal((updated.match(/納期3週間/g) ?? []).length, 1);
  assert.equal(replaceOrRemoveGeneratedSection(updated, "新見積"), updated);
  assert.throws(() => replaceOrRemoveGeneratedSection(`${updated}\n${CONTACT_QUOTE_BEGIN}`, "新見積"), /保存を中止/);
});

test("inclusive normal estimate and option plans retain correct totals without an upfront single total", () => {
  const base = { endUserName: null, watch: {}, commonLines: [{ itemName: "共通作業", quantity: 1, unitPrice: 17000 }], mode: "INCLUSIVE" as const };
  assert.match(buildEstimateContactText(base)!, /税込合計：17,000円/);
  const withOptions = buildEstimateContactText({ ...base, inquiryNumber: "A-001", optionSet: { isActive: true, choices: [
    { kind: "PLAN", name: "通常", lines: [{ itemName: "通常修理", quantity: 1, unitPrice: 44000 }] },
    { kind: "PLAN", name: "FIT", lines: [{ itemName: "FIT修理", quantity: 1, unitPrice: 9900 }] },
  ] } })!;
  assert.match(withOptions, /61,000円/);
  assert.match(withOptions, /26,900円/);
  assert.doesNotMatch(withOptions, /案件番号：/);
  assert.doesNotMatch(withOptions, /^税込合計：/m);
  assert.equal(buildEstimateContactText({ ...base, commonLines: [] }), null);
});

test("empty quote and malformed markers fail safely", () => {
  assert.equal(buildEstimateOptionContactText({ commonLines: [], choices: [], mode: "INCLUSIVE" }), null);
  assert.equal(replaceOrRemoveGeneratedSection("手入力だけ", null), "手入力だけ");
  assert.throws(() => replaceOrRemoveGeneratedSection("手入力\n【見積選択肢・自動生成ここから】\n途中", null), /保存を中止/);
  assert.throws(() => replaceOrRemoveGeneratedSection("手入力", "【見積選択肢・自動生成ここから】"), /区切り文字/);
});

test("target predicate needs business, A prefix, and exact company substring", () => {
  const business = { type: "business", prefix: "A", companyName: "TRUST 芦屋時計店" };
  assert.equal(isTargetEstimateCustomer(business, "芦屋時計店"), true);
  assert.equal(isTargetEstimateCustomer({ ...business, prefix: "B" }, "芦屋時計店"), false);
  assert.equal(isTargetEstimateCustomer({ ...business, type: "individual" }, "芦屋時計店"), false);
  assert.equal(isTargetEstimateCustomer({ ...business, companyName: "別会社" }, "芦屋時計店"), false);
});

test("production Ashiya customer identity matches only the intended customer", () => {
  const customer = { type: "business", prefix: "A", companyName: "TRUST（\u3042\u3057\u3084\u6642\u8a08\u5b9d\u77f3\u4fee\u7406\u7814\u7a76\u6240）" };
  assert.equal(isTargetEstimateCustomer(customer, TARGET_COMPANY_NAME_PART), true);
  assert.equal(isTargetEstimateCustomer({ ...customer, companyName: "TRUST" }, TARGET_COMPANY_NAME_PART), false);
});

test("customer identity transitions retain manual notes and generate only for the persisted target", () => {
  const target = { type: "business", prefix: "A", companyName: `TRUST（${TARGET_COMPANY_NAME_PART}）` };
  const other = { ...target, companyName: "TRUST" };
  const text = buildEstimateContactText({ watch: {}, commonLines: [{ itemName: "修理", quantity: 1, unitPrice: 1000 }], mode: "INCLUSIVE" })!;
  const manual = "納期3週間\nご連絡ください。";
  const saved = replaceOrRemoveGeneratedSection(manual, text);
  assert.equal(isTargetEstimateCustomer(other, TARGET_COMPANY_NAME_PART), false);
  assert.equal(replaceOrRemoveGeneratedSection(saved, null), manual);
  assert.throws(() => replaceOrRemoveGeneratedSection(`${saved}\n${CONTACT_QUOTE_BEGIN}`, null), /保存を中止/);
  assert.equal(isTargetEstimateCustomer(target, TARGET_COMPANY_NAME_PART), true);
  assert.equal(replaceOrRemoveGeneratedSection(manual, text), saved);
  assert.equal(replaceOrRemoveGeneratedSection(saved, text), saved);
});

test("outward-facing copy strips internal markers while retaining both manual note sections", () => {
  const saved = replaceOrRemoveGeneratedSection("納期約3週間", quote("INCLUSIVE")) + "\n修理状況は別途連絡します。";
  const displayed = displayEstimateOptionContactNote(saved);
  assert.match(displayed, /61,000円/);
  assert.match(displayed, /26,900円/);
  assert.match(displayed, /納期約3週間/);
  assert.match(displayed, /別途連絡します/);
  assert.doesNotMatch(displayed, /自動生成ここから|自動生成ここまで/);
  assert.equal(displayEstimateOptionContactNote("普通の連絡事項"), "普通の連絡事項");
});

test("PDF notes keep manual communication but omit the duplicated generated quotation", () => {
  const saved = replaceOrRemoveGeneratedSection("納期約3週間", quote("INCLUSIVE")) + "\n部品手配について別途ご連絡します。";
  const manual = manualOnlyEstimateContactNote(saved);
  assert.match(manual, /納期約3週間/);
  assert.match(manual, /別途ご連絡します/);
  assert.doesNotMatch(manual, /61,000円|26,900円|自動生成ここから/);
  assert.equal(manualOnlyEstimateContactNote("普通の連絡事項"), "普通の連絡事項");
});

test("damaged delimiters are never exposed by outward-facing projections", () => {
  const damaged = `private text\n${CONTACT_QUOTE_BEGIN}\npartial quote`;
  assert.equal(displayEstimateOptionContactNote(damaged), "");
  assert.equal(manualOnlyEstimateContactNote(damaged), "");
});

const ashiya = { type: "business", prefix: "A", companyName: `TRUST（${TARGET_COMPANY_NAME_PART}）` };
const historicalRepair = {
  endUserName: "山田", inquiryNumber: "A-001", customerNote: "納期は要相談。",
  watch: { brand: { name: "SEIKO" }, model: { name: "Grand Seiko" }, reference: { name: "SBGX" },
    caseReference: { name: "9F" }, serialNumber: "12345" },
  estimate: { pricingTaxMode: "INCLUSIVE", totalAmount: 15455, taxAmount: 1545,
    items: [{ itemName: "分解掃除", quantity: 1, unitPrice: 17000 }] },
};

test("historical A-001 generates the current normal quote at read time", () => {
  const explanation = sharedEstimateExplanation(historicalRepair, ashiya);
  assert.match(explanation, /^山田様\nSEIKO Grand Seiko\nRef：SBGX 9F\nシリアル番号：12345/);
  assert.doesNotMatch(explanation, /案件番号：/);
  assert.match(explanation, /分解掃除 ×1：17,000円\n税込合計：17,000円\n【お客様への連絡】\n\n納期は要相談。$/);
  assert.doesNotMatch(explanation, /自動生成ここから|自動生成ここまで/);
  assert.equal(historicalRepair.customerNote, "納期は要相談。");
});

test("old A-002 quote is regenerated once with separate option totals and manual note", () => {
  const old = replaceOrRemoveGeneratedSection("手入力の連絡事項。", "旧形式の見積 99,999円");
  const repair = { ...historicalRepair, inquiryNumber: "A-002", customerNote: old,
    estimateOptionSet: { isActive: true, title: "修理プラン", choices: [
      { kind: "PLAN", name: "通常", lines: [{ displayNameSnapshot: "通常修理", itemNameSnapshot: "旧名", quantity: 1, unitPrice: 44000 }] },
      { kind: "PLAN", name: "FIT", lines: [{ displayNameSnapshot: null, itemNameSnapshot: "FIT修理", quantity: 1, unitPrice: 9900 }] },
    ] } };
  const explanation = sharedEstimateExplanation(repair, ashiya);
  assert.match(explanation, /通常修理 ×1：44,000円\n共通作業を含む税込合計：61,000円/);
  assert.match(explanation, /FIT修理 ×1：9,900円\n共通作業を含む税込合計：26,900円/);
  assert.match(explanation, /【お客様への連絡】\n\n手入力の連絡事項。$/);
  assert.doesNotMatch(explanation, /案件番号：/);
  assert.equal((explanation.match(/手入力の連絡事項。/g) ?? []).length, 1);
  assert.doesNotMatch(explanation, /99,999円|自動生成ここから|自動生成ここまで|税込合計：87,900円/);
  assert.equal(sharedEstimateExplanation(repair, ashiya), explanation); // Card and export consume this same value.
  assert.equal(repair.customerNote, old);
});

test("other customers keep their saved explanation", () => {
  const note = replaceOrRemoveGeneratedSection("手入力", "保存済みの説明");
  assert.equal(sharedEstimateExplanation({ ...historicalRepair, customerNote: note }, { ...ashiya, companyName: "別会社" }),
    displayEstimateOptionContactNote(note));
});

test("malformed markers and inconsistent or missing estimates fail closed", () => {
  const damaged = `${CONTACT_QUOTE_BEGIN}\n旧見積`;
  assert.equal(sharedEstimateExplanation({ ...historicalRepair, customerNote: damaged }, ashiya), "");
  const old = replaceOrRemoveGeneratedSection("手入力", "旧見積 99,999円");
  assert.equal(sharedEstimateExplanation({ ...historicalRepair, customerNote: old, estimate: null }, ashiya), "手入力");
  assert.equal(sharedEstimateExplanation({ ...historicalRepair, customerNote: old,
    estimate: { ...historicalRepair.estimate, totalAmount: 99999 } }, ashiya), "手入力");
});
