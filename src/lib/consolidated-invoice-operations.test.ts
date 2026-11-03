import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { invoiceDeliveryKey } from "./invoice-delivery-routing";
import type { Prisma, PrismaClient } from "@prisma/client";
import { confirmConsolidatedBankReceipt, consolidatedDeliveryKey, consolidatedPaymentPurpose, consolidatedPaymentTotals,
  hasIndividualInvoiceOutbox, queueConsolidatedInvoiceLine } from "./consolidated-invoice-operations";

test("individual invoice outbox blocks date changes in every state", async () => {
  const keys: string[] = [];
  let row: { id: number; status: string } | null = { id: 1, status: "CANCELLED" };
  const tx = { lineManagerSendOutbox: { findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
    keys.push(where.idempotencyKey);
    return row;
  } } } as unknown as Prisma.TransactionClient;
  assert.equal(await hasIndividualInvoiceOutbox(tx, 42), true);
  row = { id: 1, status: "CONFIRMED" };
  assert.equal(await hasIndividualInvoiceOutbox(tx, 42), true);
  row = null;
  assert.equal(await hasIndividualInvoiceOutbox(tx, 42), false);
  assert.deepEqual(keys, Array(3).fill(invoiceDeliveryKey(42)));
});

const token = "a".repeat(43);
const issuedDate = new Date("2026-11-01T00:00:00Z");
const makeSource = (id: number) => ({ invoiceId: id, invoiceNumber: `I-${id}`, sourceCustomerId: id + 100,
  issuedDate, totalAmount: 1000, taxAmount: 100, shippingFeeAmount: 0, grossTotalAmount: 1100 });

function fixture(options: { pdf?: boolean; user?: boolean; outbox?: string | null; stale?: boolean;
  allocation?: boolean; refund?: boolean; prepayment?: boolean; individualDelivery?: boolean; failOnCreate?: number } = {}) {
  const sources = [makeSource(1), makeSource(2)];
  const bundle = { id: 9, billingCustomerId: 90, grossTotalAmount: 2200, sources,
    publication: options.pdf === false ? null : { id: 3, status: "current", publicToken: token,
      storageKey: "frozen.pdf", hash: "hash", fileSize: 50, publishedAt: issuedDate } };
  const invoices = sources.map(source => ({ id: source.invoiceId, invoiceNumber: source.invoiceNumber,
    customerId: source.sourceCustomerId, issuedDate, status: "issued", totalAmount: options.stale && source.invoiceId === 2 ? 999 : 1000,
    taxAmount: 100, shippingFeeAmount: 0, grossTotalAmount: 1100, sentAt: null, lineSendRetryKey: null,
    lineSendStartedAt: null, pdfFiles: [], paymentAllocations: options.allocation || options.refund ? [{ allocatedAmount: 1,
      releases: [], payment: { customerId: source.sourceCustomerId, status: options.refund ? "SUCCEEDED" : "PENDING",
        kind: "INVOICE", provider: options.refund ? "MANUAL" : "STRIPE",
        refunds: options.refund ? [{ amount: 1, status: "PENDING" }] : [] } }] : [] }));
  const writes: { invoiceId: number; customerId: number; amount: number; purpose: string }[] = [];
  let committed: typeof writes = [];
  let recorded = false;
  let gate = Promise.resolve();
  let outbox = options.outbox ?? null;
  let outboxCreates = 0;
  const recipientLookups: number[] = [];
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray, id: number) => parts[0].includes('"Customer"')
      ? [{ id, type: "business" }]
      : parts[0].includes('"LineUser"') ? [{ linkedCustomerId: 90 }]
      : [{ id }],
    consolidatedInvoice: { findUnique: async () => bundle },
    invoice: { findUnique: async (query: { where: { id: number } }) => invoices.find(row => row.id === query.where.id) },
    payment: { count: async () => options.prepayment ? 1 : 0,
      findFirst: async () => recorded ? { id: 1 } : null,
      create: async (query: { data: { customerId: number; amount: number; purpose: string;
        allocations: { create: { invoiceId: number } } } }) => {
        if (options.failOnCreate === query.data.allocations.create.invoiceId) throw new Error("write failed");
        writes.push({ invoiceId: query.data.allocations.create.invoiceId, customerId: query.data.customerId,
          amount: query.data.amount, purpose: query.data.purpose });
        return { id: writes.length };
      } },
    lineManagerSendOutbox: { findUnique: async (query: { where: { idempotencyKey: string } }) =>
      query.where.idempotencyKey === consolidatedDeliveryKey(9) ? (outbox ? { status: outbox } : null)
        : options.individualDelivery ? { id: 1 } : null },
    lineUser: { findMany: async (query: { where: { linkedCustomerId: number } }) => {
      recipientLookups.push(query.where.linkedCustomerId);
      return options.user === false ? [] : [{ id: 5, linkedCustomerId: 90,
      lineManagerChat: { id: 6, lineUserId: 5, verifiedAt: issuedDate } }];
    } },
    inquiry: { findFirst: async () => ({ id: 7, lineUserId: 5 }) },
  };
  const db = { consolidatedInvoice: tx.consolidatedInvoice,
    $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => {
      const previous = gate;
      let release!: () => void;
      gate = new Promise<void>(resolve => { release = resolve; });
      await previous;
      writes.length = 0;
      try {
        const result = await fn(tx);
        committed = [...writes];
        if (writes.length) recorded = true;
        return result;
      } finally { release(); }
    } } as unknown as PrismaClient;
  const createApproved = (async (_tx: unknown, input: { idempotencyKey: string; text: string }) => {
    outboxCreates++;
    assert.equal(input.idempotencyKey, consolidatedDeliveryKey(9));
    assert.match(input.text, new RegExp(`customer/consolidated-invoices/${token}`));
    outbox = "APPROVED";
    return { status: "APPROVED" };
  }) as unknown as Parameters<typeof queueConsolidatedInvoiceLine>[3];
  return { db, createApproved, recipientLookups, get writes() { return committed; }, get outboxCreates() { return outboxCreates; } };
}

test("queue creates one APPROVED normal-talk intent for billing recipient and replays it", async () => {
  const f = fixture();
  assert.deepEqual(await queueConsolidatedInvoiceLine(f.db, 9, "https://example.test", f.createApproved),
    { method: "LINE", outboxStatus: "APPROVED" });
  assert.deepEqual(await queueConsolidatedInvoiceLine(f.db, 9, "https://example.test", f.createApproved),
    { method: "LINE", outboxStatus: "APPROVED" });
  assert.equal(f.outboxCreates, 1);
  assert.deepEqual(f.recipientLookups, [90, 90]);
});

test("bundle payment summary uses source contributions only", () => {
  assert.deepEqual(consolidatedPaymentTotals([{ paidAmount: 0, outstandingBalance: 1100 },
    { paidAmount: 0, outstandingBalance: 1100 }]), { paidAmount: 0, outstandingBalance: 2200, paymentStatus: "UNPAID" });
  assert.deepEqual(consolidatedPaymentTotals([{ paidAmount: 1100, outstandingBalance: 0 },
    { paidAmount: 0, outstandingBalance: 1100 }]), { paidAmount: 1100, outstandingBalance: 1100, paymentStatus: "PARTIAL" });
  assert.deepEqual(consolidatedPaymentTotals([{ paidAmount: 1100, outstandingBalance: 0 },
    { paidAmount: 1100, outstandingBalance: 0 }]), { paidAmount: 2200, outstandingBalance: 0, paymentStatus: "PAID" });
});

test("queue blocks missing PDF, postal recipient, stale source, individual delivery and unresolved states", async () => {
  for (const options of [{ pdf: false }, { user: false }, { stale: true }, { individualDelivery: true },
    { allocation: true }, { refund: true }, { prepayment: true }, { outbox: "CANCELLED" }]) {
    const f = fixture(options);
    await assert.rejects(queueConsolidatedInvoiceLine(f.db, 9, "https://example.test", f.createApproved));
    assert.equal(f.outboxCreates, 0);
  }
  for (const status of ["CONFIRMED", "POST_UNCONFIRMED"]) {
    const f = fixture({ outbox: status });
    assert.equal((await queueConsolidatedInvoiceLine(f.db, 9, "https://example.test", f.createApproved)).outboxStatus, status);
    assert.equal(f.outboxCreates, 0);
  }
});

test("full receipt writes one original-customer allocation per invoice atomically", async () => {
  const f = fixture();
  const result = await confirmConsolidatedBankReceipt(f.db, 9);
  assert.equal(result.amount, 2200);
  assert.deepEqual(f.writes, [1, 2].map(id => ({ invoiceId: id, customerId: id + 100,
    amount: 1100, purpose: consolidatedPaymentPurpose(9) })));
  await assert.rejects(confirmConsolidatedBankReceipt(f.db, 9));
  assert.equal(f.writes.length, 2);
  const concurrent = fixture();
  const attempts = await Promise.allSettled([
    confirmConsolidatedBankReceipt(concurrent.db, 9), confirmConsolidatedBankReceipt(concurrent.db, 9),
  ]);
  assert.equal(attempts.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(attempts.filter(row => row.status === "rejected").length, 1);
  assert.equal(concurrent.writes.length, 2);
  for (const options of [{ stale: true }, { allocation: true }, { refund: true }, { prepayment: true }, { failOnCreate: 2 }]) {
    const blocked = fixture(options);
    await assert.rejects(confirmConsolidatedBankReceipt(blocked.db, 9));
    assert.deepEqual(blocked.writes, []);
  }
});

test("both mutation routes authenticate before parsing and contain no direct send or payment API", () => {
  for (const path of ["line/route.ts", "payments/manual/route.ts"]) {
    const file = readFileSync(resolve(process.cwd(), "src/app/api/invoices/consolidated/[id]", path), "utf8");
    assert.ok(file.indexOf("await requireAdminApi()") < file.indexOf("await params"));
    assert.doesNotMatch(file, /pushMessage|lineoa|stripe\.|LINE_CHANNEL_ACCESS_TOKEN/);
  }
});

test("unsafe confirmed delivery keeps historical status and displays an invalidity alert", () => {
  const route = readFileSync(resolve(process.cwd(), "src/app/api/invoices/consolidated/route.ts"), "utf8");
  const panel = readFileSync(resolve(process.cwd(), "src/components/invoices/ConsolidatedInvoicePanel.tsx"), "utf8");
  assert.match(route, /deliveryMethod: outboxStatus \? "LINE" : !operationalSafe \? "BLOCKED" : !newDeliverySafe \? "NONE"/);
  assert.match(route, /deliveryStatus: outboxStatus \?\? \(!operationalSafe \? "BLOCKED" : !newDeliverySafe \? "NO_NEW_DELIVERY"/);
  assert.match(route, /deliveryStatus: outboxStatus \?\?/);
  assert.match(panel, /bundle\.deliveryStatus === "CONFIRMED" \? "LINE 履歴確認済み（過去の送信記録）"/);
  assert.match(panel, /!bundle\.operationalSafe && <p role="alert"/);
});
