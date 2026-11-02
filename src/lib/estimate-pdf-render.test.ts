import assert from "node:assert/strict";
import { test } from "node:test";

// Importing another PDF document must not disturb the estimate server font.
import "@/components/pdf/InvoiceDocument";
import { renderEstimatePdfBuffer } from "./estimate-pdf-render";

test("renders an estimate PDF after importing another document", async () => {
  const pdf = await renderEstimatePdfBuffer({
    estimateNumber: "CE-001",
    date: "2026/10/04",
    customer: { name: "テスト顧客", type: "individual" },
    subtotalAmount: 1000,
    taxAmount: 100,
    totalAmount: 1100,
    jobs: [
      {
        id: "1",
        inquiryNumber: "Y-001",
        watch: { brand: "Test", model: "Watch" },
        totalAmount: 1100,
        items: [{ name: "修理", price: 1000 }],
      },
    ],
  });

  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1000);
});
