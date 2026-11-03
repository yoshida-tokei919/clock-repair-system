import assert from "node:assert/strict";
import test from "node:test";
import { resolveLockedLineContact, validateLineContactSelection, type LineContactCustomer } from "./line-contact";
import { assertLineContactOutboxCurrent } from "./line-contact-outbox";
import { businessEstimateLineKey } from "./estimate-line-confirmation";
import { fenceLineManagerPostAttempt, safeClaimLineManagerSendOutbox } from "./line-manager-send-outbox";

const source = { id: 6, type: "business", lineContactCustomerId: null };
const delegate = { id: 5, type: "business", lineContactCustomerId: null };

test("LINE proxy accepts one distinct business delegate; direct business and B2C remain separate", () => {
  assert.equal(validateLineContactSelection(source, 5, delegate), 5);
  assert.equal(validateLineContactSelection(source, null, null), null);
  for (const target of [null, { ...delegate, type: "individual" }, { ...delegate, lineContactCustomerId: 9 }]) {
    assert.throws(() => validateLineContactSelection(source, 5, target));
  }
  assert.throws(() => validateLineContactSelection(source, 6, source));
  assert.throws(() => validateLineContactSelection({ ...source, type: "individual" }, 5, delegate));
});

test("source and delegate lock in ID order and observed drift fails closed", async () => {
  const ids: number[] = [];
  const rows = new Map<number, LineContactCustomer>([[5, delegate], [6, { ...source, lineContactCustomerId: 5 }]]);
  const tx: any = {
    customer: { findUnique: async () => ({ lineContactCustomerId: 5 }) },
    $queryRaw: async (_parts: TemplateStringsArray, id: number) => { ids.push(id); return [rows.get(id)]; },
  };
  assert.equal((await resolveLockedLineContact(tx, 6)).contactCustomerId, 5);
  assert.deepEqual(ids, [5, 6]);
  rows.set(6, { ...source, lineContactCustomerId: null });
  await assert.rejects(resolveLockedLineContact(tx, 6), /変更されました/);
});

test("queued proxy estimate rejects disabled, replaced or unverified destination", async () => {
  const verifiedAt = new Date("2026-10-01T00:00:00Z");
  const destination = { lineUserId: 2, inquiryId: 3, lineManagerChatId: 4, verifiedAt, managerBotId: "bot", managerChatId: "chat" };
  const repairs = [{ id: 8, customerId: 6 }];
  const outbox = { idempotencyKey: businessEstimateLineKey(11, 6, repairs, destination, 5), inquiryId: 3, lineManagerChatId: 4, sourceRepairId: null };
  let selected: number | null = 5;
  let users = 1;
  const tx: any = {
    estimateDocument: { findUnique: async () => ({ customerId: 6 }) },
    customer: { findUnique: async () => ({ lineContactCustomerId: selected }) },
    repair: { findMany: async () => repairs },
    lineUser: { findMany: async () => users === 1 ? [{ id: 2, linkedCustomerId: 5,
      lineManagerChat: { id: 4, lineUserId: 2, verifiedAt } }] : [] },
    inquiry: { findFirst: async () => ({ id: 3, lineUserId: 2 }) },
    $queryRaw: async (parts: TemplateStringsArray, id: number) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "Customer"')) return [{ id, type: "business", lineContactCustomerId: id === 6 ? selected : null }];
      if (sql.includes('FROM "LineUser"')) return [{ linkedCustomerId: 5 }];
      if (sql.includes('FROM "LineManagerChat"')) return [{ id: 4, lineUserId: 2, verifiedAt, managerBotId: "bot", managerChatId: "chat" }];
      throw new Error(sql);
    },
  };
  await assert.doesNotReject(assertLineContactOutboxCurrent(tx, outbox));
  selected = null;
  await assert.rejects(assertLineContactOutboxCurrent(tx, outbox));
  selected = 7;
  await assert.rejects(assertLineContactOutboxCurrent(tx, outbox));
  selected = 5; users = 0;
  await assert.rejects(assertLineContactOutboxCurrent(tx, outbox));
});

test("consolidated LINE intent rechecks frozen sources, publication and recipient", async () => {
  const issuedDate = new Date("2026-11-01T00:00:00Z");
  const token = "a".repeat(43);
  const sources = [1, 2].map(invoiceId => ({ invoiceId, invoiceNumber: `I-${invoiceId}`,
    sourceCustomerId: invoiceId + 100, issuedDate, totalAmount: 1000, taxAmount: 100,
    shippingFeeAmount: 0, grossTotalAmount: 1100 }));
  const publication = { id: 3, consolidatedInvoiceId: 9, status: "current", publicToken: token,
    storageKey: "pdf", hash: "hash", fileSize: 100, publishedAt: issuedDate };
  const outbox = { idempotencyKey: "b2b-consolidated-invoice-line:9", inquiryId: 7,
    lineManagerChatId: 6, sourceRepairId: null, managerBotIdSnapshot: "bot", managerChatIdSnapshot: "chat",
    text: `請求書 /customer/consolidated-invoices/${token}` };
  let status = "issued";
  let recipientId = 90;
  let pdfStatus = "current";
  let allocations: unknown[] = [];
  let prepayments = 0;
  const locks: string[] = [];
  const tx: any = {
    consolidatedInvoice: { findUnique: async () => ({ id: 9, billingCustomerId: 90,
      grossTotalAmount: 2200, sources, publication }) },
    consolidatedInvoicePublication: { findUnique: async () => ({ ...publication, status: pdfStatus }) },
    invoice: { findUnique: async ({ where }: any) => ({ invoiceNumber: `I-${where.id}`, customerId: where.id + 100,
      issuedDate, status, totalAmount: 1000, taxAmount: 100, shippingFeeAmount: 0, grossTotalAmount: 1100,
      sentAt: null, lineSendRetryKey: null, lineSendStartedAt: null, pdfFiles: [], paymentAllocations: allocations, id: where.id }) },
    payment: { count: async () => prepayments },
    lineManagerSendOutbox: { findUnique: async () => null, findFirst: async () => null,
      updateMany: async ({ data }: any) => { updates.push(data); return { count: 1 }; } },
    $executeRaw: async () => 1,
    customer: { findUnique: async () => ({ type: "business" }) },
    lineUser: { findMany: async () => [{ id: 5 }] },
    lineManagerChat: { findUnique: async () => ({ id: 6, lineUserId: 5,
      verifiedAt: issuedDate, managerBotId: "bot", managerChatId: "chat" }) },
    inquiry: { findFirst: async () => ({ id: 7 }) },
    $queryRaw: async (parts: TemplateStringsArray, id: number) => {
      const sql = parts.join("?"); locks.push(sql);
      if (sql.includes('FROM "LineUser"')) return [{ linkedCustomerId: recipientId }];
      return [{ id }];
    },
  };
  const updates: any[] = [];
  await assert.doesNotReject(assertLineContactOutboxCurrent(tx, outbox));
  assert.deepEqual(locks.slice(0, 3).map(sql => sql.match(/FROM "([^"]+)"/)?.[1]),
    ["Invoice", "Invoice", "ConsolidatedInvoicePublication"]);
  status = "void";
  await assert.rejects(assertLineContactOutboxCurrent(tx, outbox));
  status = "issued"; pdfStatus = "draft";
  await assert.rejects(assertLineContactOutboxCurrent(tx, outbox));
  pdfStatus = "current"; recipientId = 91;
  await assert.rejects(assertLineContactOutboxCurrent(tx, outbox));
  recipientId = 90;
  const db: any = { $transaction: async (fn: any) => fn(tx) };
  tx.lineManagerSendOutbox.findUnique = async ({ where }: any) => where.id === 9 ? outbox : null;
  allocations = [{}];
  assert.equal(await safeClaimLineManagerSendOutbox(db, { id: 9 }), null);
  assert.equal(updates.at(-1)?.status, "PRE_SEND_FAILED");
  allocations = [];
  status = "paid";
  await assert.rejects(fenceLineManagerPostAttempt(db, { id: 9, claimToken: "claimed" }));
  assert.equal(updates.some(update => update.status === "POST_UNCONFIRMED"), false);
  status = "issued";
  prepayments = 1;
  await assert.rejects(fenceLineManagerPostAttempt(db, { id: 9, claimToken: "claimed" }));
});
