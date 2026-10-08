import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getOrCreateInvoiceLineOperation, invoiceLineOperationStorageKey,
  shouldClearInvoiceLineOperation } from "./invoice-line-operation";

const FIRST_KEY = "11111111-1111-4111-8111-111111111111";
const SECOND_KEY = "22222222-2222-4222-8222-222222222222";

test("same-tab LINE operation survives ambiguous result and reload, then clears on confirmed success", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const operation = getOrCreateInvoiceLineOperation(storage, 7, 0, () => FIRST_KEY);
  assert.deepEqual(operation, { operationKey: FIRST_KEY, expectedRevision: 0 });
  assert.equal(shouldClearInvoiceLineOperation(502, { ok: false, uncertain: true }), false);
  assert.deepEqual(getOrCreateInvoiceLineOperation(storage, 7, 1, () => SECOND_KEY), operation);
  assert.equal(shouldClearInvoiceLineOperation(200, { ok: true, sentAt: "2026-10-09T00:00:00.000Z" }), true);
  storage.removeItem(invoiceLineOperationStorageKey(7));
  assert.deepEqual(getOrCreateInvoiceLineOperation(storage, 7, 1, () => SECOND_KEY),
    { operationKey: SECOND_KEY, expectedRevision: 1 });
});

test("rejection and uncertain/manual states retain the operation", () => {
  assert.equal(shouldClearInvoiceLineOperation(502, { ok: false, uncertain: true }), false);
  assert.equal(shouldClearInvoiceLineOperation(502, { ok: false, uncertain: false }), false);
  assert.equal(shouldClearInvoiceLineOperation(400, { ok: false }), false);
  assert.equal(shouldClearInvoiceLineOperation(404, { ok: false }), false);
  assert.equal(shouldClearInvoiceLineOperation(409, { ok: false, manualVerificationRequired: true }), false);
  assert.equal(shouldClearInvoiceLineOperation(502, null), false);
});

test("invoice UI persists before POST and sends that exact operation key", () => {
  const ui = readFileSync(resolve(process.cwd(), "src/components/invoices/InvoicePdfActions.tsx"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "src/app/api/invoices/[id]/line/route.ts"), "utf8");
  assert.ok(ui.indexOf("getOrCreateInvoiceLineOperation(sessionStorage") < ui.indexOf("await fetch(`/api/invoices/${invoiceId}/line`"));
  assert.match(ui, /body: JSON\.stringify\(operation\)/);
  assert.match(ui, /lineSendRevision/);
  assert.match(ui, /shouldClearInvoiceLineOperation\(response\.status, result\)/);
  assert.match(route, /Object\.keys\(body\)\.sort\(\)\.join\(","\) !== "expectedRevision,operationKey"/);
  assert.match(route, /operationKey, expectedRevision \}/);
});
