import assert from "node:assert/strict";
import test from "node:test";
import { DeliveryDocument } from "./DeliveryDocument";

function texts(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === "object" && "props" in node) {
    return texts((node as { props: { children?: unknown } }).props.children);
  }
  return [];
}

test("inclusive delivery PDF keeps final repair and shipping total", () => {
  const output = texts(DeliveryDocument({ data: {
    deliveryNumber: "D-001", date: "2026/10/16", customer: { name: "法人" },
    jobs: [{ inquiryNumber: "B-001", watch: { brand: "A", model: "M" }, items: [
      { name: "技術料", price: 15000, type: "labor" },
      { name: "部品", price: 44000, quantity: 1, type: "part" },
    ] }],
    taxRate: 0.1, pricingTaxMode: "INCLUSIVE", subtotalAmount: 53637, taxAmount: 5363, shippingFee: 800,
  } })).join(" ");
  assert.match(output, /課税対象額（税込）/);
  assert.match(output, /内消費税/);
  assert.match(output, /¥\s*59,800/);
  assert.doesNotMatch(output, /¥\s*64,363/);
});
