import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { optionApproverName } from "./option-approver-name";

test("individual approvals use the registered name and ignore submitted names", () => {
  assert.equal(optionApproverName("individual", " 登録 顧客 ", "偽の承認者"), "登録 顧客");
  assert.equal(optionApproverName("individual", "長".repeat(101), undefined)?.length, 100);
});

test("missing and placeholder registered names have a transparent fallback", () => {
  for (const name of [null, "", "  ", "???", "??????", "？？？", "一般のお客様", "お客様", "未設定", "氏名未登録"]) {
    assert.equal(optionApproverName("individual", name, "偽の承認者"), "登録名なし（個人）");
  }
});

test("business approvals still require a bounded submitted representative name", () => {
  assert.equal(optionApproverName("business", "登録 顧客", undefined), null);
  assert.equal(optionApproverName("business", "登録 顧客", "  "), null);
  assert.equal(optionApproverName("business", "登録 顧客", "長".repeat(101)), null);
  assert.equal(optionApproverName("business", "登録 顧客", " 担当者 "), "担当者");
});

test("individual option UI has no name input or submitted approver name", () => {
  const component = readFileSync("src/app/(private)/customer/repairs/[token]/CustomerEstimateOptions.tsx", "utf8");
  assert.match(component, /customerType === "business" && <label[^\n]*<input/);
  assert.match(component, /customerType === "business" \? \{ approverName: approverName\.trim\(\) \} : \{\}/);
  assert.match(component, /customerType === "business" && <p>承認者:/);
  const route = readFileSync("src/app/api/customer/repairs/[id]/estimate-options/route.ts", "utf8");
  assert.match(route, /optionApproverName\(repair\.customer\.type, document\.customer\.name, body\.approverName\)/);
});
