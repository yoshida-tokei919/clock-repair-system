import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { queueEstimateLineSend, resolveEstimateLineDestination, EstimateLineNotFoundError, EstimateLineUnavailableError } from "./estimate-line-send";
import { confirmLineManagerSendOutbox, LineManagerSendOutboxError } from "./line-manager-send-outbox";
import { estimateLineKey, estimateLineKeyPrefix } from "./estimate-line-confirmation";

const verifiedAt = new Date("2026-10-04T00:00:00Z");
function repair(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id, customerId: 4, status: "見積中",
    inquiryWatchPromotion: {
      id: id + 100, inquiryId: 8, promotedRepairId: id,
      inquiry: { lineUser: { linkedCustomerId: 4, lineManagerChat: { id: 6, verifiedAt } } },
    },
    ...overrides,
  };
}

test("estimate destination requires each Repair's own promoted Inquiry and one verified chat", () => {
  assert.deepEqual(resolveEstimateLineDestination([repair(2), repair(3)], 4), {
    inquiryId: 8, lineManagerChatId: 6, sourceRepairId: undefined,
  });
  assert.deepEqual(resolveEstimateLineDestination([repair(2)], 4), {
    inquiryId: 8, lineManagerChatId: 6, sourceRepairId: 2,
  });
  for (const bad of [
    [], [repair(2, { customerId: 5 })], [repair(2, { inquiryWatchPromotion: null })],
    [repair(2, { inquiryWatchPromotion: { ...repair(2).inquiryWatchPromotion, promotedRepairId: 3 } })],
    [repair(2, { inquiryWatchPromotion: { ...repair(2).inquiryWatchPromotion,
      inquiry: { lineUser: { linkedCustomerId: 5, lineManagerChat: { id: 6, verifiedAt } } } } })],
    [repair(2, { inquiryWatchPromotion: { ...repair(2).inquiryWatchPromotion,
      inquiry: { lineUser: { linkedCustomerId: 4, lineManagerChat: null } } } })],
    [repair(2, { inquiryWatchPromotion: { ...repair(2).inquiryWatchPromotion,
      inquiry: { lineUser: { linkedCustomerId: 4, lineManagerChat: { id: 6, verifiedAt: null } } } } })],
    [repair(2), repair(3, { inquiryWatchPromotion: { ...repair(3).inquiryWatchPromotion, inquiryId: 9 } })],
    [repair(2), repair(3, { inquiryWatchPromotion: { ...repair(3).inquiryWatchPromotion,
      inquiry: { lineUser: { linkedCustomerId: 4, lineManagerChat: { id: 7, verifiedAt } } } } })],
  ]) assert.throws(() => resolveEstimateLineDestination(bad as any, 4), EstimateLineUnavailableError);
});

function fakeDb() {
  const rows = [repair(2), repair(3)];
  let outbox: any = null;
  let queued = 0;
  const tx: any = {
    estimateDocument: { findUnique: async () => ({ customerId: 4, id: 11, repairs: rows,
      currentPdfFile: { storageKey: "pdf-key" } }) },
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "Customer"')) return [{ id: 4 }];
      if (sql.includes('FROM "EstimateDocument"') && sql.includes("FOR UPDATE")) return [{ customerId: 4 }];
      if (sql.includes('FROM "Repair"') && sql.includes("FOR UPDATE")) return rows.map((row) => ({ id: row.id }));
      if (sql.includes('FROM "EstimateDocument"')) return [{ publicToken: "document-token" }];
      if (sql.includes('FROM "Repair"')) return [{ publicToken: "repair-token" }];
      throw new Error(sql);
    },
    inquiry: { findUnique: async () => ({ id: 8, lineUserId: 5 }) },
    lineManagerChat: { findUnique: async () => ({ id: 6, lineUserId: 5, managerBotId: "bot", managerChatId: "chat" }) },
    repair: { findUnique: async () => repair(2) },
    lineManagerSendOutbox: {
      findFirst: async () => outbox,
      upsert: async ({ create }: any) => {
        if (!outbox) { queued++; outbox = { id: 20, status: "APPROVED", ...create }; }
        return outbox;
      },
    },
  };
  return { db: { ...tx, $transaction: async (fn: (client: any) => Promise<unknown>) => fn(tx) } as any,
    rows, get counts() { return { queued }; }, get outbox() { return outbox; } };
}

test("estimate queue is idempotent, preserves share URL and does not call Push API", async () => {
  const fixture = fakeDb();
  const priorFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = (async () => { fetches++; throw new Error("Network send is forbidden"); }) as typeof fetch;
  try {
    assert.deepEqual(await queueEstimateLineSend(fixture.db, 11, "https://example.com/api/documents/estimate/11/line"),
      { updatedRepairCount: 0, outboxStatus: "APPROVED" });
    assert.deepEqual(await queueEstimateLineSend(fixture.db, 11, "https://example.com/api/documents/estimate/11/line"),
      { updatedRepairCount: 0, outboxStatus: "APPROVED" });
    assert.deepEqual(fixture.counts, { queued: 1 });
    assert.ok(fixture.outbox.idempotencyKey.startsWith(estimateLineKeyPrefix(11)));
    assert.deepEqual(fixture.rows.map((row) => row.status), ["見積中", "見積中"]);
    assert.equal(fixture.outbox.inquiryId, 8);
    assert.equal(fixture.outbox.lineManagerChatId, 6);
    assert.match(fixture.outbox.text, /https:\/\/example\.com\/customer\/repairs\/document-token/);
    assert.equal(fetches, 0);
  } finally { globalThis.fetch = priorFetch; }
});

test("missing PDF and changed document linkage fail before queueing", async () => {
  const fixture = fakeDb();
  const original = fixture.db.estimateDocument.findUnique;
  fixture.db.estimateDocument.findUnique = async () => ({ ...(await original()), currentPdfFile: null });
  await assert.rejects(queueEstimateLineSend(fixture.db, 11, "https://example.com"), EstimateLineUnavailableError);
  assert.equal(fixture.counts.queued, 0);
});

test("missing document, changed customer or Repair membership, and ambiguous origins never queue", async () => {
  for (const changed of [
    null,
    { id: 11, customerId: 5, repairs: [repair(2), repair(3)], currentPdfFile: { storageKey: "pdf-key" } },
    { id: 11, customerId: 4, repairs: [repair(2)], currentPdfFile: { storageKey: "pdf-key" } },
    { id: 11, customerId: 4, repairs: [repair(2), repair(3, { inquiryWatchPromotion: null })], currentPdfFile: { storageKey: "pdf-key" } },
  ]) {
    const fixture = fakeDb();
    fixture.db.estimateDocument.findUnique = async () => changed;
    await assert.rejects(queueEstimateLineSend(fixture.db, 11, "https://example.com"),
      changed === null ? EstimateLineNotFoundError : EstimateLineUnavailableError);
    assert.equal(fixture.counts.queued, 0);
  }
});

test("same document cannot queue a different message or reuse a cancelled intent", async () => {
  const fixture = fakeDb();
  await queueEstimateLineSend(fixture.db, 11, "https://example.com");
  await assert.rejects(queueEstimateLineSend(fixture.db, 11, "https://other.example"), LineManagerSendOutboxError);
  fixture.outbox.status = "CANCELLED";
  await assert.rejects(queueEstimateLineSend(fixture.db, 11, "https://example.com"), EstimateLineUnavailableError);
  assert.equal(fixture.counts.queued, 1);
});

test("a changed Repair set cannot create a second estimate intent", async () => {
  const fixture = fakeDb();
  await queueEstimateLineSend(fixture.db, 11, "https://example.com");
  fixture.rows.push(repair(4));
  await assert.rejects(queueEstimateLineSend(fixture.db, 11, "https://example.com"), EstimateLineUnavailableError);
  assert.equal(fixture.counts.queued, 1);
});

test("estimate route has no Messaging API Push transport", () => {
  const source = readFileSync("src/app/api/documents/estimate/[id]/line/route.ts", "utf8");
  assert.doesNotMatch(source, /api\.line\.me|message\/push|\bfetch\s*\(/);
});

function confirmationFixture(idempotencyKey?: string) {
  const rows = [repair(2), repair(3)];
  const timestamp = new Date("2026-10-04T01:00:00Z");
  const key = idempotencyKey ?? estimateLineKey(11, 4, rows);
  let status = "APPROVED";
  let message: any = null;
  let updates = 0;
  let logs = 0;
  let customerId = 4;
  const outbox = {
    id: 20, idempotencyKey: key, sourceRepairId: null, inquiryId: 8, lineManagerChatId: 6,
    text: "estimate", reconciliationToken: "token", managerBotIdSnapshot: "bot", managerChatIdSnapshot: "chat",
    inquiry: { lineUserId: 5 }, lineManagerChat: { lineUserId: 5, managerBotId: "bot", managerChatId: "chat" },
  };
  const tx: any = {
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "EstimateDocument"')) return [{ customerId }];
      if (sql.includes('FROM "Repair"')) return rows.map((row) => ({ id: row.id }));
      throw new Error(sql);
    },
    repair: {
      findMany: async () => rows,
      updateMany: async ({ where, data }: any) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row || !where.status.in.includes(row.status) || row.customerId !== where.customerId) return { count: 0 };
        row.status = data.status; updates++; return { count: 1 };
      },
    },
    repairStatusLog: { findFirst: async () => null, create: async () => { logs++; } },
    inquiryMessage: {
      findUnique: async () => null,
      create: async ({ data }: any) => (message = { id: 99, ...data }),
    },
    lineManagerSendOutbox: {
      findUnique: async () => status === "CONFIRMED"
        ? { ...outbox, status, confirmedManagerMessageId: "actual", confirmedInquiryMessageId: 99, confirmedInquiryMessage: message }
        : { ...outbox, status },
      updateMany: async ({ where }: any) => {
        if (status !== "POST_UNCONFIRMED" || where.reconciliationToken !== "token") return { count: 0 };
        status = "CONFIRMED"; return { count: 1 };
      },
    },
  };
  return {
    db: { $transaction: async (fn: (client: any) => Promise<unknown>) => fn(tx) } as any,
    rows, timestamp,
    set status(value: string) { status = value; },
    set customerId(value: number) { customerId = value; },
    get counts() { return { updates, logs }; },
    input: { id: 20, reconciliationToken: "token", actualMessageId: "actual", text: "estimate",
      timestamp, managerBotId: "bot", managerChatId: "chat" },
  };
}

test("only Manager-history confirmation moves eligible estimate Repairs once", async () => {
  const fixture = confirmationFixture();
  for (const state of ["APPROVED", "PRE_SEND_FAILED"]) {
    fixture.status = state;
    await assert.rejects(confirmLineManagerSendOutbox(fixture.db, fixture.input), LineManagerSendOutboxError);
    assert.deepEqual(fixture.counts, { updates: 0, logs: 0 });
  }
  fixture.status = "POST_UNCONFIRMED";
  assert.deepEqual(fixture.counts, { updates: 0, logs: 0 });
  await confirmLineManagerSendOutbox(fixture.db, fixture.input);
  assert.deepEqual(fixture.rows.map((row) => row.status), ["承認待ち", "承認待ち"]);
  assert.deepEqual(fixture.counts, { updates: 2, logs: 2 });
  await confirmLineManagerSendOutbox(fixture.db, fixture.input);
  assert.deepEqual(fixture.counts, { updates: 2, logs: 2 });
});

test("confirmation leaves unrelated outboxes and Repairs in later statuses untouched", async () => {
  const unrelated = confirmationFixture("repair-completion-notice:2");
  unrelated.status = "POST_UNCONFIRMED";
  await confirmLineManagerSendOutbox(unrelated.db, unrelated.input);
  assert.deepEqual(unrelated.counts, { updates: 0, logs: 0 });

  const later = confirmationFixture();
  later.rows[0].status = "作業中";
  later.status = "POST_UNCONFIRMED";
  await confirmLineManagerSendOutbox(later.db, later.input);
  assert.deepEqual(later.rows.map((row) => row.status), ["作業中", "承認待ち"]);
  assert.deepEqual(later.counts, { updates: 1, logs: 1 });
});

test("membership, customer and origin drift skip the estimate status effect", async () => {
  for (const drift of [
    (fixture: ReturnType<typeof confirmationFixture>) => fixture.rows.push(repair(4)),
    (fixture: ReturnType<typeof confirmationFixture>) => fixture.rows.pop(),
    (fixture: ReturnType<typeof confirmationFixture>) => { fixture.customerId = 9; },
    (fixture: ReturnType<typeof confirmationFixture>) => { fixture.rows[0].customerId = 9; },
    (fixture: ReturnType<typeof confirmationFixture>) => { fixture.rows[0].inquiryWatchPromotion.inquiryId = 9; },
    (fixture: ReturnType<typeof confirmationFixture>) => { fixture.rows[0].inquiryWatchPromotion.promotedRepairId = 9; },
    (fixture: ReturnType<typeof confirmationFixture>) => { fixture.rows[0].inquiryWatchPromotion.inquiry.lineUser.linkedCustomerId = 9; },
    (fixture: ReturnType<typeof confirmationFixture>) => { fixture.rows[0].inquiryWatchPromotion.inquiry.lineUser.lineManagerChat.id = 9; },
  ]) {
    const fixture = confirmationFixture();
    drift(fixture);
    fixture.status = "POST_UNCONFIRMED";
    await confirmLineManagerSendOutbox(fixture.db, fixture.input);
    assert.deepEqual(fixture.counts, { updates: 0, logs: 0 });
  }
});
