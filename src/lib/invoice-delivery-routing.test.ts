import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { getInvoiceDeliveryState, InvoiceDeliveryUnavailableError, invoiceDeliveryKey, queueInvoiceLineDelivery, resolveInvoiceLineDestination } from "./invoice-delivery-routing";

function destinationFixture(options: { users?: unknown[]; inquiry?: { id: number; lineUserId: number } | null } = {}) {
  const users = options.users ?? [{ id: 5, linkedCustomerId: 7, lineManagerChat: { id: 11, lineUserId: 5, verifiedAt: new Date() } }];
  const queries: unknown[] = [];
  const db = {
    lineUser: { findMany: async () => users },
    inquiry: { findFirst: async (query: unknown) => { queries.push(query); return options.inquiry === undefined ? { id: 21, lineUserId: 5 } : options.inquiry; } },
  } as unknown as PrismaClient;
  return { db, queries };
}

test("one linked user with verified Manager mapping and Inquiry routes to LINE", async () => {
  const f = destinationFixture();
  assert.deepEqual(await resolveInvoiceLineDestination(f.db, 7), { lineUserId: 5, inquiryId: 21, lineManagerChatId: 11 });
  assert.deepEqual((f.queries[0] as { where: unknown }).where, { lineUserId: 5, status: "OPEN" });
});

test("missing, ambiguous, unverified, mismatched, or unanchored destinations route to postal", async () => {
  const valid = { id: 5, linkedCustomerId: 7, lineManagerChat: { id: 11, lineUserId: 5, verifiedAt: new Date() } };
  for (const users of [[], [valid, { ...valid, id: 6 }], [{ ...valid, linkedCustomerId: 8 }],
    [{ ...valid, lineManagerChat: null }], [{ ...valid, lineManagerChat: { ...valid.lineManagerChat, verifiedAt: null } }],
    [{ ...valid, lineManagerChat: { ...valid.lineManagerChat, lineUserId: 6 } }]]) {
    assert.equal(await resolveInvoiceLineDestination(destinationFixture({ users }).db, 7), null);
  }
  assert.equal(await resolveInvoiceLineDestination(destinationFixture({ inquiry: null }).db, 7), null);
  assert.equal(await resolveInvoiceLineDestination(destinationFixture({ inquiry: { id: 21, lineUserId: 6 } }).db, 7), null);
});

test("server-fixed invoice key queues once; APPROVED remains unsent", async () => {
  let outbox: { status: string } | null = null;
  let creates = 0;
  const invoice = { id: 8, customerId: 7, status: "issued", billingMonth: "2026-10", publicToken: "token", sentAt: null,
    lineSendRetryKey: null, lineSendStartedAt: null, customer: { type: "business" },
    currentPdfFile: { status: "current", storageKey: "pdf" } };
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray) => parts[0].includes('"LineUser"') ? [{ linkedCustomerId: 7 }] : [{ id: 7 }],
    invoice: { findUnique: async () => invoice },
    lineUser: destinationFixture().db.lineUser,
    inquiry: destinationFixture().db.inquiry,
    lineManagerSendOutbox: { findUnique: async () => outbox },
    repair: { findMany: async () => [] },
  };
  const db = { invoice: { findUnique: async () => ({ customerId: 7 }) }, $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;
  const createApproved = (async (_db: unknown, input: { idempotencyKey: string; text: string }) => {
    creates += 1;
    assert.equal(input.idempotencyKey, invoiceDeliveryKey(8));
    assert.match(input.text, /customer\/invoices\/token/);
    outbox = { status: "APPROVED" };
    return outbox;
  }) as unknown as Parameters<typeof queueInvoiceLineDelivery>[3];
  const first = await queueInvoiceLineDelivery(db, 8, "https://example.com/invoices/8", createApproved);
  const retry = await queueInvoiceLineDelivery(db, 8, "https://example.com/invoices/8", createApproved);
  assert.deepEqual(first, { method: "LINE", outboxStatus: "APPROVED" });
  assert.deepEqual(retry, first);
  assert.equal(creates, 1);
  assert.equal(invoice.sentAt, null);
});

test("postal classification is visible without creating a send intent", async () => {
  const routing = destinationFixture({ users: [] }).db;
  const db = { lineUser: routing.lineUser, inquiry: routing.inquiry,
    invoice: { findUnique: async () => ({ customerId: 7, status: "issued", customer: { type: "business" }, sentAt: null,
    lineSendRetryKey: null, lineSendStartedAt: null }) }, lineManagerSendOutbox: { findUnique: async () => null },
  } as unknown as PrismaClient;
  assert.deepEqual(await getInvoiceDeliveryState(db, 8), { method: "POSTAL", status: "PRINT_PENDING" });
});

test("delivery state uses the saved recipient and legacy null falls back to source", async () => {
  const lookedUp: number[] = [];
  let billingCustomerId: number | null = 22;
  const valid = { id: 5, linkedCustomerId: 22, lineManagerChat: { id: 11, lineUserId: 5, verifiedAt: new Date() } };
  const db = {
    invoice: { findUnique: async () => ({ customerId: 11, billingCustomerId, status: "issued",
      customer: { type: "business" }, billingCustomer: billingCustomerId ? { type: "business" } : null,
      sentAt: null, lineSendRetryKey: null, lineSendStartedAt: null }) },
    lineManagerSendOutbox: { findUnique: async () => null },
    lineUser: { findMany: async (query: { where: { linkedCustomerId: number } }) => {
      lookedUp.push(query.where.linkedCustomerId);
      return query.where.linkedCustomerId === 22 ? [valid] : [];
    } },
    inquiry: destinationFixture().db.inquiry,
  } as unknown as PrismaClient;
  assert.deepEqual(await getInvoiceDeliveryState(db, 8), { method: "LINE", status: "READY" });
  billingCustomerId = null;
  assert.deepEqual(await getInvoiceDeliveryState(db, 8), { method: "POSTAL", status: "PRINT_PENDING" });
  assert.deepEqual(lookedUp, [22, 11]);
});

test("alternate invoice routes through the saved recipient and rechecks its LINE link under lock", async () => {
  const lookedUp: number[] = [];
  const locked: number[] = [];
  const routing = destinationFixture({ users: [{ id: 5, linkedCustomerId: 11,
    lineManagerChat: { id: 11, lineUserId: 5, verifiedAt: new Date() } }] }).db;
  const invoice = { id: 8, customerId: 22, billingCustomerId: 11, status: "issued", billingMonth: "2026-10",
    publicToken: "token", sentAt: null, lineSendRetryKey: null, lineSendStartedAt: null,
    customer: { type: "business" }, billingCustomer: { type: "business" },
    currentPdfFile: { status: "current", storageKey: "pdf" } };
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray, id: number) => {
      if (parts[0].includes('FROM "Customer"')) { locked.push(id); return [{ id, type: "business" }]; }
      if (parts[0].includes('FROM "Invoice"')) return [{ id: 8, billingCustomerId: 11 }];
      if (parts[0].includes('FROM "LineUser"')) return [{ linkedCustomerId: 11 }];
      return [];
    },
    invoice: { findUnique: async () => invoice },
    lineUser: { findMany: async (query: { where: { linkedCustomerId: number } }) => {
      lookedUp.push(query.where.linkedCustomerId);
      return routing.lineUser.findMany(query);
    } },
    inquiry: routing.inquiry,
    lineManagerSendOutbox: { findUnique: async () => null },
    repair: { findMany: async () => [] },
  };
  const db = { invoice: { findUnique: async () => ({ customerId: 22, billingCustomerId: 11 }) },
    $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;
  const result = await queueInvoiceLineDelivery(db, 8, "https://example.com", async () => ({ status: "APPROVED" }) as never);
  assert.deepEqual(result, { method: "LINE", outboxStatus: "APPROVED" });
  assert.deepEqual(locked, [11, 22]);
  assert.deepEqual(lookedUp, [11]);
});

test("void invoices are never postal print targets", async () => {
  const db = { invoice: { findUnique: async () => ({ customerId: 7, status: "void", customer: { type: "business" } }) } } as unknown as PrismaClient;
  assert.equal(await getInvoiceDeliveryState(db, 8), null);
});

test("queue fails closed to postal when the verified route is missing", async () => {
  const routing = destinationFixture({ users: [] }).db;
  const invoice = { id: 8, customerId: 7, status: "issued", billingMonth: "2026-10", publicToken: null,
    sentAt: null, lineSendRetryKey: null, lineSendStartedAt: null, customer: { type: "business" },
    currentPdfFile: { status: "current", storageKey: "pdf" } };
  let created = false;
  const tx = { $queryRaw: async () => [{ id: 7 }], invoice: { findUnique: async () => invoice },
    lineUser: routing.lineUser, inquiry: routing.inquiry,
    lineManagerSendOutbox: { findUnique: async () => null } };
  const db = { invoice: { findUnique: async () => ({ customerId: 7 }) },
    $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;
  const createApproved = (async () => { created = true; }) as unknown as Parameters<typeof queueInvoiceLineDelivery>[3];
  await assert.rejects(queueInvoiceLineDelivery(db, 8, "https://example.com", createApproved),
    (error: unknown) => error instanceof InvoiceDeliveryUnavailableError && error.postal);
  assert.equal(created, false);
  assert.equal(invoice.publicToken, null);
});

test("invoice path has no Messaging API Push or channel access token dependency", () => {
  const files = ["src/app/api/invoices/[id]/line/route.ts", "src/lib/invoice-delivery-routing.ts"];
  const code = files.map(file => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
  assert.doesNotMatch(code, /api\.line\.me|LINE_CHANNEL_ACCESS_TOKEN|sendInvoiceLine|providerFetch/);
  assert.match(code, /createApprovedLineManagerSendOutbox/);
  assert.doesNotMatch(code, /sentAt:\s*new Date|invoicePdfFile\.update/);
});
