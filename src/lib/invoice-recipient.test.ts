import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  assertCustomerCanBecomeIndividual, effectiveInvoiceRecipientId, invoicePdfParties,
  nextB2BSourceInvoiceNumber, resolveInvoiceRecipientForIssue,
  validateInvoiceRecipientSelection,
} from "./invoice-recipient";

const source = { id: 11, type: "business" };
const recipient = { id: 22, type: "business" };

test("alternate recipient requires two distinct business customers", () => {
  assert.equal(validateInvoiceRecipientSelection(source, 22, recipient), 22);
  assert.equal(validateInvoiceRecipientSelection(source, 11, null), null);
  assert.equal(validateInvoiceRecipientSelection(source, null, null), null);
  assert.throws(() => validateInvoiceRecipientSelection({ id: 11, type: "individual" }, 22, recipient));
  assert.throws(() => validateInvoiceRecipientSelection(source, 22, null));
  assert.throws(() => validateInvoiceRecipientSelection(source, 22, { id: 22, type: "individual" }));
  assert.throws(() => validateInvoiceRecipientSelection(source, 22, { id: 33, type: "business" }));
});

test("issue reads source sequence and snapshots alternate without changing source identity", async () => {
  const sourceRow = { id: 11, type: "business", prefix: "A", seqInvoice: 0, invoiceRecipientCustomerId: 22 };
  const tx = { customer: { findUnique: async () => ({ invoiceRecipientCustomerId: 22 }) },
    $queryRaw: async (_parts: TemplateStringsArray, id: number) => [id === 11 ? sourceRow : recipient] } as unknown as Prisma.TransactionClient;
  assert.deepEqual(await resolveInvoiceRecipientForIssue(tx, 11), {
    source: sourceRow,
    billingCustomerId: 22,
  });
  assert.deepEqual(nextB2BSourceInvoiceNumber({ prefix: "A", seqInvoice: 0 }), { sequence: 1, invoiceNumber: "AI-001" });
  assert.deepEqual(nextB2BSourceInvoiceNumber({ prefix: "AB", seqInvoice: 6 }), { sequence: 7, invoiceNumber: "ABI-007" });
  assert.deepEqual(nextB2BSourceInvoiceNumber({ prefix: "T", seqInvoice: 8 }), { sequence: 9, invoiceNumber: "TI-009" });
  assert.equal(effectiveInvoiceRecipientId({ customerId: 11, billingCustomerId: null }), 11);
  assert.equal(effectiveInvoiceRecipientId({ customerId: 11, billingCustomerId: 22 }), 22);
});

test("issue blocks an invalid configured recipient; B2C stays self billed", async () => {
  const sourceRow = { id: 11, type: "business", prefix: "A", seqInvoice: 3, invoiceRecipientCustomerId: 22 };
  const tx = { customer: { findUnique: async () => ({ invoiceRecipientCustomerId: 22 }) },
    $queryRaw: async (_parts: TemplateStringsArray, id: number) =>
      [id === 11 ? sourceRow : { id: 22, type: "individual" }] } as unknown as Prisma.TransactionClient;
  await assert.rejects(resolveInvoiceRecipientForIssue(tx, 11), /既存の法人顧客/);
  sourceRow.type = "individual";
  assert.equal((await resolveInvoiceRecipientForIssue(tx, 11)).billingCustomerId, 11);
});

test("issue locks lower recipient ID first and rejects a changed setting after locks", async () => {
  const locks: number[] = [];
  const sourceRow = { id: 22, type: "business", prefix: "A", seqInvoice: 4, invoiceRecipientCustomerId: 11 };
  const tx = { customer: { findUnique: async () => ({ invoiceRecipientCustomerId: 11 }) },
    $queryRaw: async (_parts: TemplateStringsArray, id: number) => {
      locks.push(id);
      return [id === 22 ? sourceRow : { id: 11, type: "business" }];
    } } as unknown as Prisma.TransactionClient;
  assert.equal((await resolveInvoiceRecipientForIssue(tx, 22)).billingCustomerId, 11);
  assert.deepEqual(locks, [11, 22]);
  sourceRow.invoiceRecipientCustomerId = 33;
  await assert.rejects(resolveInvoiceRecipientForIssue(tx, 22), /請求先設定が変更/);
});

test("individual conversion guards configured and issued alternate recipients under customer lock", async () => {
  const calls: string[] = [];
  let configured = 1;
  let issued = 0;
  const tx = {
    $queryRaw: async () => { calls.push("lock"); return [{ id: 22, type: "business" }]; },
    customer: { count: async () => { calls.push("configured"); return configured; } },
    invoice: { count: async () => { calls.push("issued"); return issued; } },
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(assertCustomerCanBecomeIndividual(tx, 22), /他の法人の請求先/);
  assert.deepEqual(calls, ["lock", "configured"]);
  configured = 0;
  issued = 1;
  await assert.rejects(assertCustomerCanBecomeIndividual(tx, 22), /発行済み請求書の請求先/);
  issued = 0;
  await assert.doesNotReject(assertCustomerCanBecomeIndividual(tx, 22));
});

test("bulk invoice numbering is computed from the locked source inside its transaction", () => {
  const code = readFileSync(resolve(process.cwd(), "src/actions/document-actions.ts"), "utf8");
  const invoiceBranch = code.split("} else if (type === 'invoice') {")[1]?.split("} else if (type === 'estimate') {")[0] ?? "";
  assert.doesNotMatch(invoiceBranch, /lastInvoice|startsWith: prefix/);
  const transaction = invoiceBranch.indexOf("prisma.$transaction(async (tx)");
  const lockedSource = invoiceBranch.indexOf("resolveInvoiceRecipientForIssue(tx, customerId)");
  const numbering = invoiceBranch.indexOf("nextB2BSourceInvoiceNumber(source)");
  assert.ok(transaction >= 0 && lockedSource > transaction && numbering > lockedSource);
});

test("PDF parties use saved recipient and identify the source; legacy uses source", () => {
  const customer = { id: 11, name: "TRUST 修理別口", companyName: "TRUST 別口", address: "Source", type: "business" };
  const billingCustomer = { id: 22, name: "TRUST", companyName: "TRUST", address: "Recipient", type: "business" };
  assert.deepEqual(invoicePdfParties({ customerId: 11, billingCustomerId: 22, customer, billingCustomer }), {
    recipient: { name: "TRUST", address: "Recipient", type: "business" }, sourceCustomerName: "TRUST 別口",
  });
  assert.deepEqual(invoicePdfParties({ customerId: 11, billingCustomerId: null, customer, billingCustomer }), {
    recipient: { name: "TRUST 修理別口", address: "Source", type: "business" }, sourceCustomerName: undefined,
  });
  assert.throws(() => invoicePdfParties({ customerId: 11, billingCustomerId: 22, customer, billingCustomer: null }));
});
