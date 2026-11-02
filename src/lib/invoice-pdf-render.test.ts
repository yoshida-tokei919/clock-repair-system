import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Font } from "@react-pdf/renderer";

import "@/components/pdf/InvoiceDocument";
import { renderEstimatePdfBuffer } from "./estimate-pdf-render";
import { renderInvoicePdfBuffer } from "./invoice-pdf-render";

test("API invoice renderer uses its filesystem font alongside estimate rendering", async () => {
  Font.register({ family: "Noto Sans JP", src: "/fonts/NotoSansJP-Regular.otf" });
  const [invoice, estimate] = await Promise.all([
    renderInvoicePdfBuffer({
      invoiceNumber: "I-001", date: "2026/11/02", dueDate: "2026/11/30",
      customer: { name: "山田 太郎", type: "individual" },
      items: [], taxRate: 0.1, pricingTaxMode: "INCLUSIVE",
      subtotalAmount: 1000, taxAmount: 100, grossTotalAmount: 1100,
      prepaymentAppliedAmount: 100,
      b2cJobs: [{
        inquiryNumber: "R-001", watch: { brand: "セイコー", model: "腕時計" },
        workDescriptions: ["分解掃除"], amount: 1000,
      }],
    }),
    renderEstimatePdfBuffer({
      estimateNumber: "E-001", date: "2026/11/02",
      customer: { name: "テスト顧客", type: "individual" },
      subtotalAmount: 1000, taxAmount: 100, totalAmount: 1100,
      jobs: [{
        id: "1", inquiryNumber: "R-002", watch: { brand: "Test", model: "Watch" },
        items: [{ name: "修理", price: 1000 }],
      }],
    }),
  ]);

  assert.equal(invoice.subarray(0, 5).toString(), "%PDF-");
  assert.ok(invoice.length > 1000);
  assert.equal(estimate.subarray(0, 5).toString(), "%PDF-");
  const font = Font.getRegisteredFonts()["Invoice Server Noto Sans JP"];
  assert.equal(font.sources[0].src, path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf"));
  assert.ok(!font.sources.some((source) => source.src === "/fonts/NotoSansJP-Regular.otf"));
});
