import assert from "node:assert/strict";
import test from "node:test";
import { createEstimateServerDocumentElement, type EstimateServerDocumentProps } from "./EstimateServerDocument";
import { optionTotals } from "@/lib/estimate-options";

type Node = { type: string; props: Record<string, unknown>; children: unknown[] };
const runtime = { createElement: (type: string, props: Record<string, unknown> | null, ...children: unknown[]): Node =>
  ({ type, props: props ?? {}, children }) };
const renderer = { Document: "Document", Page: "Page", Text: "Text", View: "View",
  StyleSheet: { create: <T>(styles: T) => styles } };
const flatten = (value: unknown): Node[] => Array.isArray(value) ? value.flatMap(flatten)
  : value && typeof value === "object" && "type" in value ? [value as Node, ...(value as Node).children.flatMap(flatten)] : [];
const texts = (value: unknown) => flatten(value).filter(node => node.type === "Text")
  .map(node => node.children.filter(child => typeof child === "string").join(""));

const base: EstimateServerDocumentProps["data"] = {
  estimateNumber: "BE-001", date: "2026/10/19", customer: { name: "法人", type: "business" },
  pricingTaxMode: "EXCLUSIVE", jobs: [
    { id: "1", inquiryNumber: "K-001", watch: { brand: "Rolex", model: "Datejust" }, items: [{ name: "共通点検", price: 10000, quantity: 1 }] },
    { id: "2", inquiryNumber: "K-002", watch: { brand: "Omega", model: "Speedmaster" }, items: [{ name: "通常作業", price: 7000, quantity: 1 }] },
  ],
};

for (const mode of ["EXCLUSIVE", "INCLUSIVE"] as const) test(`${mode} B2B options show independent plan totals and add-on delta`, () => {
  const choices = [
    { kind: "PLAN", lines: [{ unitPrice: 2000, quantity: 2 }] },
    { kind: "PLAN", lines: [{ unitPrice: 8000, quantity: 1 }] },
    { kind: "ADD_ON", lines: [{ unitPrice: 1500, quantity: 1 }] },
  ];
  const totals = optionTotals([{ unitPrice: 10000, quantity: 1 }], choices, mode);
  const data: EstimateServerDocumentProps["data"] = { ...base, pricingTaxMode: mode, jobs: [
    { ...base.jobs[0], options: { title: "修理方法", notes: "納期は要相談", choices: choices.map((choice, index) => ({
      kind: choice.kind as "PLAN" | "ADD_ON", name: `案${index + 1}`, notes: "部品在庫次第", recommended: index === 0,
      lines: [{ name: "追加作業", price: choice.lines[0].unitPrice, quantity: choice.lines[0].quantity, notes: "ご確認ください" }],
      deltaAmount: choice.kind === "PLAN" ? totals[index].planAmount : totals[index].addOnAmount,
      totalAmount: totals[index].commonAmount + totals[index].planAmount,
    })) } }, base.jobs[1],
  ] };
  const tree = createEstimateServerDocumentElement(runtime, renderer, data);
  const output = texts(tree).join(" ");
  assert.match(output, /K-001/);
  assert.match(output, /K-002/);
  assert.match(output, /共通 ¥10,000/);
  assert.match(output, /差額 ¥4,000 \/ 共通＋このプラン ¥14,000/);
  assert.match(output, /差額 ¥8,000 \/ 共通＋このプラン ¥18,000/);
  assert.match(output, /追加額 ¥1,500/);
  assert.doesNotMatch(output, /¥22,000/);
  assert.match(output, /【推奨】/);
  assert.match(output, /納期は要相談/);
  assert.match(output, /部品在庫次第/);
  assert.match(output, /ご確認ください/);
  assert.match(output, /追加作業 \(ご確認ください\) ¥2,000 × 2/);
  assert.match(output, /追加作業 \(ご確認ください\) ¥8,000/);
  assert.doesNotMatch(output, /数量|単価| = 金額/);
  assert.equal(flatten(tree).find(node => node.type === "Page")?.props.size, "A4");
  assert.equal(flatten(tree).filter(node => node.type === "View" && node.props.wrap === false).length, 1);
});

test("ordinary B2B estimate keeps standard rows without option labels", () => {
  const tree = createEstimateServerDocumentElement(runtime, renderer, base);
  const output = texts(tree).join(" ");
  assert.match(output, /¥10,000/);
  assert.match(output, /¥7,000/);
  assert.doesNotMatch(output, /プラン|共通＋|追加額/);
  assert.equal(flatten(tree).filter(node => node.type === "View" && node.props.wrap === false).length, 0);
});

test("estimate PDF uses compact line prices and keeps the per-watch aggregate", () => {
  const data: EstimateServerDocumentProps["data"] = { ...base, jobs: [{
    ...base.jobs[0], items: [
      { name: "点検作業", price: 8000, quantity: 1, quantityUnit: "回" },
      { name: "G-002", price: 500, quantity: 2, quantityUnit: "か所" },
      { name: "交換部品", price: 1000, quantity: 2, quantityUnit: "本" },
    ],
  }] };
  const rendered = texts(createEstimateServerDocumentElement(runtime, renderer, data));
  const output = rendered.join(" ");
  assert.match(output, /点検作業 ¥8,000/);
  assert.match(output, /G-002 ¥500 × 2/);
  assert.match(output, /交換部品 ¥1,000 × 2/);
  assert.ok(rendered.includes("¥11,000"));
  assert.doesNotMatch(output, /数量|単価| = 金額|2か所|2本/);
  const tree = createEstimateServerDocumentElement(runtime, renderer, data);
  const line = flatten(tree).find(node => node.type === "View" &&
    node.children.some(child => (child as Node)?.children?.includes("・G-002")));
  assert.equal((line?.props.style as { flexDirection?: string })?.flexDirection, "row");
  assert.equal((line?.children[1] as Node)?.props.wrap, false);
});

test("single multi-quantity line keeps its extended total in the watch column", () => {
  const data: EstimateServerDocumentProps["data"] = { ...base, jobs: [{
    ...base.jobs[0], items: [{ name: "交換部品", price: 500, quantity: 2, quantityUnit: "本" }],
  }] };
  const rendered = texts(createEstimateServerDocumentElement(runtime, renderer, data));
  assert.ok(rendered.includes("¥500 × 2"));
  assert.ok(rendered.includes("¥1,000"));
});
