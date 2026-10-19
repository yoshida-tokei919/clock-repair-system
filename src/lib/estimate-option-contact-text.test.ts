import assert from "node:assert/strict";
import test from "node:test";
import { buildEstimateOptionContactText, CONTACT_QUOTE_BEGIN, displayEstimateOptionContactNote, manualOnlyEstimateContactNote, getGeneratedSectionText, isTargetEstimateCustomer, replaceOrRemoveGeneratedSection, TARGET_COMPANY_NAME_PART } from "./estimate-option-contact-text";

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
  assert.match(text, /案件番号：A-002/);
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
  assert.equal(once.startsWith(handwritten), true);
  assert.equal(getGeneratedSectionText(once), quote("INCLUSIVE"));
  assert.equal(replaceOrRemoveGeneratedSection(once, quote("INCLUSIVE")), once);
  assert.equal((once.match(/【見積選択肢・自動生成ここから】/g) ?? []).length, 1);
  assert.equal(replaceOrRemoveGeneratedSection(once, null).startsWith(handwritten), true);
  assert.equal(getGeneratedSectionText(replaceOrRemoveGeneratedSection(once, null)), null);
  const staleEditor = "更新後の手入力メモ";
  assert.equal(getGeneratedSectionText(replaceOrRemoveGeneratedSection(staleEditor, getGeneratedSectionText(once))), quote("INCLUSIVE"));
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
