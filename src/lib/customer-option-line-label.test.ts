import assert from "node:assert/strict";
import test from "node:test";
import { customerOptionLineLabel, customerOptionLineQuantity } from "./customer-option-line-label";

test("option labels use stored semantics and keep meaningful descriptors", () => {
  assert.equal(customerOptionLineLabel("ムーブメント 交換", "LABOR"), "ムーブメント交換（技術料）");
  assert.equal(customerOptionLineLabel("ムーブメント", "PART"), "ムーブメント（部品代）");
  assert.equal(customerOptionLineLabel("リューズ（ねじ込み） 修理（カシメ作業）", "LABOR"), "リューズ（ねじ込み）修理（カシメ作業・技術料）");
  assert.equal(customerOptionLineLabel("リューズ（ねじ込み）", "PART"), "リューズ（ねじ込み・部品代）");
  assert.equal(customerOptionLineLabel("リューズ交換（防水検査込み）", "LABOR"), "リューズ交換（防水検査込み・技術料）");
  assert.equal(customerOptionLineLabel("リューズ修理（技術料）", "LABOR"), "リューズ修理（技術料）");
  assert.equal(customerOptionLineLabel("リューズ（部品代）", "PART"), "リューズ（部品代）");
  assert.equal(customerOptionLineLabel("リューズ 修理", null), "リューズ 修理");
  assert.equal(customerOptionLineLabel("リューズ", "UNKNOWN"), "リューズ");
});

test("option quantity is shown only above one", () => {
  assert.equal(customerOptionLineQuantity(1, "本"), "");
  assert.equal(customerOptionLineQuantity(2, "本"), " × 2本");
  assert.equal(customerOptionLineQuantity(3), " × 3");
});
