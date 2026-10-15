import assert from "node:assert/strict";
import test from "node:test";
import { InvoiceDocument } from "./InvoiceDocument";

function texts(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === "object" && "props" in node) {
    return texts((node as { props: { children?: unknown } }).props.children);
  }
  return [];
}

const base = {
  invoiceNumber: "B-001", date: "2026/10/16", dueDate: "2026/11/30",
  customer: { name: "法人", type: "business" },
  items: [{ date: "2026/10/15", slipNumber: "D-001", description: "2点", amount: 59000 }],
  taxRate: 0.1, bankInfo: "銀行",
};

test("inclusive B2B invoice PDF displays final rows and included tax without adding it again", () => {
  const output = texts(InvoiceDocument({ data: { ...base, pricingTaxMode: "INCLUSIVE",
    subtotalAmount: 53637, taxAmount: 5363, grossTotalAmount: 59000 } })).join(" ");
  assert.match(output, /課税対象額（税込）/);
  assert.match(output, /内消費税/);
  assert.match(output, /¥\s*59,000/);
  assert.doesNotMatch(output, /¥\s*64,363/);
});

test("exclusive B2B invoice PDF retains subtotal plus tax labels", () => {
  const output = texts(InvoiceDocument({ data: { ...base, pricingTaxMode: "EXCLUSIVE",
    subtotalAmount: 59000, taxAmount: 5900, grossTotalAmount: 64900 } })).join(" ");
  assert.match(output, /小計/);
  assert.match(output, /消費税/);
  assert.match(output, /¥\s*64,900/);
});
