import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import React from "react";
import { Font, renderToBuffer } from "@react-pdf/renderer";
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

const individualInvoice = {
  ...base,
  customer: { name: "山田 太郎 様", type: "individual" },
  pricingTaxMode: "INCLUSIVE",
  subtotalAmount: 53637,
  taxAmount: 5363,
  grossTotalAmount: 59000,
  prepaymentAppliedAmount: 10000,
  b2cJobs: [{
    inquiryNumber: "R-001",
    watch: { brand: "セイコー", model: "腕時計" },
    workDescriptions: ["分解掃除"],
    amount: 53637,
  }],
};

test("inclusive individual invoice keeps B2C job rows and prepayment presentation", () => {
  const output = texts(InvoiceDocument({ data: individualInvoice })).join(" ");
  assert.match(output, /山田 太郎 様/);
  assert.match(output, /修理番号:\s+R-001/);
  assert.match(output, /分解掃除/);
  assert.match(output, /前受金充当/);
  assert.match(output, /今回のお支払い額/);
  assert.match(output, /¥\s*49,000/);
  assert.doesNotMatch(output, /納品書番号|お振込先|御中/);
});

test("server renderer creates a Japanese invoice PDF with the filesystem font", async () => {
  Font.register({
    family: "Noto Sans JP",
    src: path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf"),
  });
  const document = React.createElement(InvoiceDocument, { data: individualInvoice });
  const pdf = await renderToBuffer(document as unknown as Parameters<typeof renderToBuffer>[0]);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1000);
});
