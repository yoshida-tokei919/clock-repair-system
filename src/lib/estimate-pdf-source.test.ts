import assert from "node:assert/strict";
import test from "node:test";
import { estimatePdfSourceFingerprint } from "./estimate-pdf-source";

test("rendered estimate source expires on common line, choice, tax mode, or composition edits", () => {
  const source = { id: 1, currentPdfFileId: null as number | null, customer: { pricingTaxMode: "INCLUSIVE" }, repairs: [
    { id: 10, estimate: { items: [{ id: 20, quantity: 1, unitPrice: 10000 }] },
      estimateOptionSet: { isActive: true, choices: [{ id: 30, name: "案A", lines: [{ id: 40, unitPrice: 2000 }] }] } },
  ] };
  const initial = estimatePdfSourceFingerprint(source);
  const edits = [
    (copy: typeof source) => { copy.repairs[0].estimate.items[0].unitPrice = 11000; },
    (copy: typeof source) => { copy.repairs[0].estimateOptionSet.choices[0].lines[0].unitPrice = 3000; },
    (copy: typeof source) => { copy.customer.pricingTaxMode = "EXCLUSIVE"; },
    (copy: typeof source) => { copy.repairs.push({ ...copy.repairs[0], id: 11 }); },
    (copy: typeof source) => { copy.currentPdfFileId = 2; },
  ];
  for (const edit of edits) {
    const copy = structuredClone(source);
    edit(copy);
    assert.notEqual(estimatePdfSourceFingerprint(copy), initial);
  }
});
