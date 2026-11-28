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
    deliveryNumber: "D-001", date: "2026/10/16", customer: { name: "法人", type: "business" },
    jobs: [{ inquiryNumber: "B-001", watch: { brand: "A", model: "M" }, items: [
      { name: "技術料", price: 15000, type: "labor" },
      { name: "部品", price: 44000, quantity: 1, type: "part" },
    ] }],
    taxRate: 0.1, pricingTaxMode: "INCLUSIVE", subtotalAmount: 53637, taxAmount: 5363, shippingFee: 800,
  } })).join(" ").replace(/\s+/g, " ");
  assert.match(output, /課税対象額（税込）/);
  assert.match(output, /内消費税/);
  assert.match(output, /¥\s*59,800/);
  assert.doesNotMatch(output, /¥\s*64,363/);
});

test("historical refund is a separate negative display and preserves delivery sale", () => {
  const data = {
    deliveryNumber: "D-002", date: "2026/11/12", customer: { name: "法人", type: "business" as const },
    jobs: [{ inquiryNumber: "R-1", watch: { brand: "A", model: "M" }, items: [] }],
    taxRate: 0.1, subtotalAmount: 0, taxAmount: 0, shippingFee: 0,
    historicalRefunds: [{ inquiryNumber: "R-1", originalSaleReference: "旧売上-1", amount: 14014,
      method: "OFFSET" as const, status: "AWAITING_OFFSET", taxStatus: "PENDING", reason: "返品" }],
  };
  const output = texts(DeliveryDocument({ data })).join(" ");
  assert.match(output, /今回納品額\s*¥\s*0/);
  assert.match(output, /過去修理返金予定.*-¥\s*14,014/);
  assert.match(output, /差引表示額\s*-¥\s*14,014/);
  assert.match(output, /請求相殺予定/);
  assert.equal(data.subtotalAmount, 0);
  assert.equal(data.taxAmount, 0);
});

test("individual delivery recipient has one sama and no workshop telephone", () => {
  for (const name of ["山田 太郎", "山田 太郎 様", "山田 太郎 御中 様"]) {
    const output = texts(DeliveryDocument({ data: {
      deliveryNumber: "CD-892", date: "2026/11/28", customer: { name, type: "individual" },
      jobs: [], taxRate: 0.1, shippingFee: 0,
    } })).join(" ").replace(/\s+/g, " ");
    assert.match(output, /山田 太郎 様/);
    assert.doesNotMatch(output, /御中|様\s*様|TEL:/);
  }
});

test("business delivery keeps onchu and workshop telephone", () => {
  const output = texts(DeliveryDocument({ data: {
    deliveryNumber: "BD-001", date: "2026/11/28", customer: { name: "時計商事 御中", type: "business" },
    jobs: [], taxRate: 0.1, shippingFee: 0,
  } })).join(" ").replace(/\s+/g, " ");
  assert.match(output, /時計商事 御中/);
  assert.doesNotMatch(output, /御中\s*御中|時計商事 様/);
  assert.match(output, /TEL: 090-2041-8275/);
});
