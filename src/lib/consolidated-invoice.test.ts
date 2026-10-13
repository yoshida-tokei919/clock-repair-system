import assert from "node:assert/strict";
import test from "node:test";
import { assertConsolidationSelection, assertSourcesAvailable, ConsolidatedInvoiceError, deliveryNoteBreakdown } from "./consolidated-invoice";

const sources = [
  { id: 1, customerId: 10, status: "issued", grossTotalAmount: 11001 },
  { id: 2, customerId: 20, status: "paid", grossTotalAmount: 22002 },
];
const sameCompany = [
  { companyId: 7, billingCustomerId: 20 },
  { companyId: 7, billingCustomerId: 20 },
];

test("selected stores in one company sum canonical source invoice gross totals", () => {
  assert.equal(assertConsolidationSelection(sources, [1, 2], sameCompany, 7, 20), 33003);
});

test("cross-company, standalone/B2C, and changed destination fail closed", () => {
  for (const resolutions of [
    [sameCompany[0], { companyId: 8, billingCustomerId: 20 }],
    [sameCompany[0], { companyId: null, billingCustomerId: 20 }],
    [sameCompany[0], { companyId: 7, billingCustomerId: 30 }],
  ]) assert.throws(() => assertConsolidationSelection(sources, [1, 2], resolutions, 7, 20), ConsolidatedInvoiceError);
  assert.throws(() => assertConsolidationSelection(sources, [1, 2], sameCompany, 7, 30), ConsolidatedInvoiceError);
});

test("stale, void, or missing source is rejected", () => {
  assert.throws(() => assertConsolidationSelection(sources.slice(0, 1), [1, 2], sameCompany, 7, 20), ConsolidatedInvoiceError);
  assert.throws(() => assertConsolidationSelection([{ ...sources[0], status: "void" }, sources[1]], [1, 2], sameCompany, 7, 20), ConsolidatedInvoiceError);
});

test("already included source is rejected", () => {
  assert.throws(() => assertSourcesAvailable([{ consolidatedSource: { id: 9 } }]), ConsolidatedInvoiceError);
  assert.doesNotThrow(() => assertSourcesAvailable([{ consolidatedSource: null }]));
});

test("delivery notes retain distinct IDs and only reliable pre-tax subtotals", () => {
  const rows = [
    { deliveryNoteId: 3, deliverySlipNumber: "D-3", deliveryIssuedDate: null, subtotalAmount: 100 },
    { deliveryNoteId: 3, deliverySlipNumber: "D-3", deliveryIssuedDate: null, subtotalAmount: 200 },
    { deliveryNoteId: 4, deliverySlipNumber: "D-4", deliveryIssuedDate: null, subtotalAmount: 400 },
  ];
  assert.deepEqual(deliveryNoteBreakdown(rows, true).map(row => [row.deliveryNoteId, row.slipNumber, row.subtotalAmount]),
    [[3, "D-3", 300], [4, "D-4", 400]]);
  assert.equal(deliveryNoteBreakdown(rows, false)[0].subtotalAmount, null);
});
