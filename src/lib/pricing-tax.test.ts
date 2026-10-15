import assert from "node:assert/strict";
import test from "node:test";
import { calculateTaxableAmounts, effectivePricingTaxMode, laborCustomerUnitPrice, partCustomerUnitPrice, repairPartBasePrice, sumCustomerLines } from "./pricing-tax";
import { createEstimateItemFromPart } from "./estimate-item";

test("exclusive defaults and inclusive labor retain the entered final amount", () => {
  assert.deepEqual(calculateTaxableAmounts(15000, "EXCLUSIVE"), { totalAmount: 15000, taxAmount: 1500, grossAmount: 16500 });
  assert.deepEqual(calculateTaxableAmounts(15000, "INCLUSIVE"), { totalAmount: 13637, taxAmount: 1363, grossAmount: 15000 });
  const rule = { minPrice: 15000 };
  assert.equal(laborCustomerUnitPrice(rule.minPrice), 15000);
  assert.equal(rule.minPrice, 15000);
  assert.equal(effectivePricingTaxMode({ type: "individual", pricingTaxMode: "INCLUSIVE" }), "EXCLUSIVE");
  assert.equal(effectivePricingTaxMode({ type: "business" }), "EXCLUSIVE");
});

test("inclusive parts use canonical tax-exclusive unit price exactly once, with quantity", () => {
  const part = partCustomerUnitPrice(40000, "INCLUSIVE");
  assert.equal(part, 44000);
  assert.equal(repairPartBasePrice({ price: part, basePrice: 40000 }, "INCLUSIVE"), 40000);
  assert.equal(repairPartBasePrice({ price: part, partsMasterId: 7 }, "INCLUSIVE", 40000), 40000);
  assert.equal(sumCustomerLines([{ unitPrice: 15000, quantity: 1 }, { unitPrice: part, quantity: 1 }]), 59000);
  assert.deepEqual(calculateTaxableAmounts(59000, "INCLUSIVE"), { totalAmount: 53637, taxAmount: 5363, grossAmount: 59000 });
  assert.equal(sumCustomerLines([{ unitPrice: part, quantity: 2 }]), 88000);
  const reloaded = createEstimateItemFromPart({ id: 7, retailPrice: 40000 }, { name: "部品", price: part, quantity: 2 });
  assert.equal(reloaded.price, 44000);
  assert.equal(repairPartBasePrice({ price: reloaded.price, partsMasterId: 7 }, "INCLUSIVE", 40000), 40000);
  assert.throws(() => repairPartBasePrice({ price: 44000 }, "INCLUSIVE"));
  assert.throws(() => repairPartBasePrice({ price: 48400, basePrice: 40000 }, "INCLUSIVE"));
});

test("document gross is authoritative even when per-line reverse rounding would drift", () => {
  assert.deepEqual(calculateTaxableAmounts(11001, "INCLUSIVE"), { totalAmount: 10001, taxAmount: 1000, grossAmount: 11001 });
  assert.equal(calculateTaxableAmounts(1 + 1 + 1, "INCLUSIVE").grossAmount, 3);
});

test("source customer policy is independent of an alternate invoice recipient", () => {
  const source = { type: "business", pricingTaxMode: "INCLUSIVE" };
  const billingRecipient = { type: "business", pricingTaxMode: "EXCLUSIVE" };
  assert.equal(effectivePricingTaxMode(source), "INCLUSIVE");
  assert.equal(effectivePricingTaxMode(billingRecipient), "EXCLUSIVE");
  assert.equal(calculateTaxableAmounts(59000, effectivePricingTaxMode(source)).grossAmount, 59000);
});
