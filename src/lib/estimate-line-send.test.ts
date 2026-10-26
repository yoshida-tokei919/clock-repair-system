import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { queueEstimateLineSend, resolveEstimateLineDestination, EstimateLineNotFoundError, EstimateLineUnavailableError } from "./estimate-line-send";
import { confirmLineManagerSendOutbox, LineManagerSendOutboxError } from "./line-manager-send-outbox";
import { businessEstimateLineKey, estimateLineKey, estimateLineKeyPrefix } from "./estimate-line-confirmation";
import { REOPEN_EVENT_PREFIX } from "./repair-reopen-approval";

const verifiedAt = new Date("2026-10-04T00:00:00Z");
const estimateUrl = "https://example.com/customer/repairs/document-token";
const businessText = `いつもお世話になっております。\n\nお見積りができましたので、下記ページよりご確認をお願いいたします。\n\n【お見積り確認ページ】\n${estimateUrl}\n\nお見積り内容で問題がなければ、ページ内の「承認」ボタンよりご承認をお願いいたします。\n\nご不明な点や変更のご希望がございましたら、共有ページ内のコメント欄よりご連絡ください。\n\nよろしくお願いいたします。`;
const individualText = `お見積りができましたので、下記ページよりご確認をお願いいたします。\n\n${estimateUrl}\n\nこの内容で進める場合は、画面上から承認をお願いいたします。\nご不明な点や修正のご希望がございましたら、このLINEからご連絡ください。`;
function repair(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id, customerId: 4, status: "見積中", estimateDocumentId: 11,
    estimate: { items: [{ itemName: "新しい見積", quantity: 1, unitPrice: 0, createdAt: new Date("2026-10-04T00:30:00Z") }] },
    estimateOptionSet: null,
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

function fakeDb(business = false, proxy = false) {
  const rows = business ? [repair(2, { inquiryWatchPromotion: null }), repair(3, { inquiryWatchPromotion: null })] : [repair(2), repair(3)];
  let outbox: any = null;
  let queued = 0;
  let users = [{ id: 5, linkedCustomerId: proxy ? 9 : 4, lineManagerChat: { id: 6, lineUserId: 5, verifiedAt } }];
  let inquiry = { id: 8, lineUserId: 5 };
  let chat = { id: 6, lineUserId: 5, verifiedAt, managerBotId: "bot", managerChatId: "chat" };
  const reopenEvents = new Map<number, { status: string; changedAt: Date }>();
  const tx: any = {
    customer: { findUnique: async () => ({ type: business ? "business" : "individual", lineContactCustomerId: proxy ? 9 : null }) },
    estimateDocument: { findUnique: async () => ({ customerId: 4, id: 11, repairs: rows,
      currentPdfFile: { storageKey: "pdf-key", status: "current", estimateDocumentId: 11,
        hash: "hash", generatedAt: new Date("2026-10-04T01:00:00Z") } }) },
    repairStatusLog: {
      findFirst: async ({ where }: any) => reopenEvents.get(where.repairId) ?? null,
      findMany: async ({ where }: any) => [...reopenEvents.values()].filter(event =>
        event.status.startsWith(where.status.startsWith) && event.status.includes(where.status.contains)),
    },
    $queryRaw: async (parts: TemplateStringsArray, id?: number) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "Customer"')) return [{ id: id ?? 4, type: business ? "business" : "individual", lineContactCustomerId: id === 9 ? null : proxy ? 9 : null }];
      if (sql.includes('FROM "LineUser"')) return users.filter((user) => user.id === 5).map(({ linkedCustomerId }) => ({ linkedCustomerId }));
      if (sql.includes('FROM "LineManagerChat"')) return [chat];
      if (sql.includes('FROM "EstimateDocument"') && sql.includes("FOR UPDATE")) return [{ customerId: 4 }];
      if (sql.includes('FROM "Repair"') && sql.includes("FOR UPDATE")) return rows.map((row) => ({ id: row.id }));
      if (sql.includes('FROM "EstimateDocument"')) return [{ publicToken: "document-token" }];
      if (sql.includes('FROM "Repair"')) return [{ publicToken: "repair-token" }];
      throw new Error(sql);
    },
    lineUser: { findMany: async () => users },
    inquiry: { findUnique: async () => inquiry, findFirst: async () => inquiry },
    lineManagerChat: { findUnique: async () => chat },
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
    rows, get counts() { return { queued }; }, get outbox() { return outbox; },
    set users(value: typeof users) { users = value; },
    set inquiry(value: typeof inquiry) { inquiry = value; },
    set chat(value: typeof chat) { chat = value; },
    markReopened(id: number, boundary: number) { reopenEvents.set(id, {
      status: `${REOPEN_EVENT_PREFIX}v2:${boundary}:${boundary}:0:0:0:0:E`,
      changedAt: new Date("2026-10-04T00:15:00Z"),
    }); } };
}

test("business estimate queues one verified recipient without a promoted origin, including a single Repair", async () => {
  for (const single of [false, true]) {
    const fixture = fakeDb(true);
    if (single) fixture.rows.pop();
    await queueEstimateLineSend(fixture.db, 11, "https://example.com");
    await queueEstimateLineSend(fixture.db, 11, "https://example.com");
    assert.equal(fixture.counts.queued, 1);
    assert.equal(fixture.outbox.sourceRepairId, null);
    assert.equal(fixture.outbox.inquiryId, 8);
    assert.equal(fixture.outbox.text, businessText);
    assert.deepEqual(fixture.rows.map((row) => row.status), fixture.rows.map(() => "見積中"));
  }
});

test("reopened repair blocks historical estimate LINE queue before outbox creation", async () => {
  const f = fakeDb();
  f.markReopened(2, 11);
  await assert.rejects(queueEstimateLineSend(f.db, 11, "https://example.com"), /履歴/);
  assert.equal(f.counts.queued, 0);
});

test("B2B estimate group fails closed if any member still uses its pre-reopen document", async () => {
  const f = fakeDb(true);
  f.markReopened(3, 11);
  await assert.rejects(queueEstimateLineSend(f.db, 11, "https://example.com"), /履歴/);
  assert.equal(f.counts.queued, 0);
});

test("fresh zero-yen structured quote and PDF can queue after reopening", async () => {
  const f = fakeDb();
  f.markReopened(2, 10);
  await queueEstimateLineSend(f.db, 11, "https://example.com");
  assert.equal(f.counts.queued, 1);
});

test("estimate LINE queue allows the established interactive transaction budget", async () => {
  const fixture = fakeDb(true);
  const transaction = fixture.db.$transaction;
  fixture.db.$transaction = async (fn: (client: any) => Promise<unknown>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: "Serializable", timeout: 30_000, maxWait: 10_000 });
    return transaction(fn, options);
  };
  await queueEstimateLineSend(fixture.db, 11, "https://example.com");
  assert.equal(fixture.counts.queued, 1);
});

test("proxy estimate keeps source document and repair IDs while routing to the delegate", async () => {
  const f = fakeDb(true, true);
  await queueEstimateLineSend(f.db, 11, "https://example.com");
  assert.equal(f.outbox.inquiryId, 8);
  assert.equal(f.outbox.sourceRepairId, null);
  assert.equal(f.outbox.idempotencyKey, businessEstimateLineKey(11, 4, f.rows,
    { lineUserId: 5, inquiryId: 8, lineManagerChatId: 6, verifiedAt, managerBotId: "bot", managerChatId: "chat" }, 9));
  assert.equal(f.outbox.text, businessText);
});

test("business estimate rejects missing, ambiguous, unverified and changed recipients", async () => {
  for (const change of [
    (f: ReturnType<typeof fakeDb>) => { f.users = []; },
    (f: ReturnType<typeof fakeDb>) => { f.inquiry = null as any; },
    (f: ReturnType<typeof fakeDb>) => { f.users = [
      { id: 5, linkedCustomerId: 4, lineManagerChat: { id: 6, lineUserId: 5, verifiedAt } },
      { id: 7, linkedCustomerId: 4, lineManagerChat: { id: 7, lineUserId: 7, verifiedAt } } ]; },
    (f: ReturnType<typeof fakeDb>) => { f.chat = { ...f.chat, verifiedAt: null as any }; },
    (f: ReturnType<typeof fakeDb>) => { f.chat = { ...f.chat, lineUserId: 9 }; },
    (f: ReturnType<typeof fakeDb>) => { f.users = [{ id: 5, linkedCustomerId: 9, lineManagerChat: { id: 6, lineUserId: 5, verifiedAt } }]; },
    (f: ReturnType<typeof fakeDb>) => { f.rows[0].customerId = 9; },
  ]) {
    const fixture = fakeDb(true); change(fixture);
    await assert.rejects(queueEstimateLineSend(fixture.db, 11, "https://example.com"), EstimateLineUnavailableError);
    assert.equal(fixture.counts.queued, 0);
  }
  const fixture = fakeDb(true);
  await queueEstimateLineSend(fixture.db, 11, "https://example.com");
  fixture.inquiry = { id: 9, lineUserId: 5 };
  await assert.rejects(queueEstimateLineSend(fixture.db, 11, "https://example.com"), EstimateLineUnavailableError);
  assert.equal(fixture.counts.queued, 1);
});

test("business estimate requires a current PDF for the same document", async () => {
  for (const pdf of [null, { storageKey: "pdf-key", status: "superseded", estimateDocumentId: 11 },
    { storageKey: "pdf-key", status: "current", estimateDocumentId: 12 }]) {
    const fixture = fakeDb(true);
    fixture.db.estimateDocument.findUnique = async () => ({ id: 11, customerId: 4, repairs: fixture.rows, currentPdfFile: pdf });
    await assert.rejects(queueEstimateLineSend(fixture.db, 11, "https://example.com"), EstimateLineUnavailableError);
    assert.equal(fixture.counts.queued, 0);
  }
});

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
    assert.equal(fixture.outbox.text, individualText);
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

function confirmationFixture(idempotencyKey?: string, business = false) {
  const rows = business ? [repair(2, { inquiryWatchPromotion: null }), repair(3, { inquiryWatchPromotion: null })] : [repair(2), repair(3)];
  const timestamp = new Date("2026-10-04T01:00:00Z");
  const destination = { lineUserId: 5, inquiryId: 8, lineManagerChatId: 6, verifiedAt, managerBotId: "bot", managerChatId: "chat" };
  const key = idempotencyKey ?? (business ? businessEstimateLineKey(11, 4, rows, destination) : estimateLineKey(11, 4, rows));
  let status = "APPROVED";
  let message: any = null;
  let updates = 0;
  let logs = 0;
  let customerId = 4;
  let linkedCustomerId = 4;
  let inquiryId = 8;
  let archived = false;
  const outbox = {
    id: 20, idempotencyKey: key, sourceRepairId: null, inquiryId: 8, lineManagerChatId: 6,
    text: "estimate", reconciliationToken: "token", managerBotIdSnapshot: "bot", managerChatIdSnapshot: "chat",
    inquiry: { lineUserId: 5 }, lineManagerChat: { lineUserId: 5, managerBotId: "bot", managerChatId: "chat" },
  };
  const tx: any = {
    customer: { findUnique: async () => ({ type: business ? "business" : "individual", lineContactCustomerId: null }) },
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes('FROM "Customer"')) return [{ id: customerId, type: business ? "business" : "individual", lineContactCustomerId: null }];
      if (sql.includes('FROM "LineUser"')) return [{ linkedCustomerId }];
      if (sql.includes('FROM "LineManagerChat"')) return [{ id: 6, lineUserId: 5, verifiedAt, managerBotId: "bot", managerChatId: "chat" }];
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
    estimateDocument: { findUnique: async () => ({ customerId }) },
    lineUser: { findMany: async () => [{ id: 5, linkedCustomerId, lineManagerChat: { id: 6, lineUserId: 5, verifiedAt } }] },
    inquiry: { findFirst: async () => ({ id: inquiryId, lineUserId: 5 }) },
    repairStatusLog: { findFirst: async () => null, findMany: async () => archived
      ? [{ status: `${REOPEN_EVENT_PREFIX}v2:11:11:0:0:0:0:E` }] : [], create: async () => { logs++; } },
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
    db: { $transaction: async (fn: (client: any) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { timeout: 20_000 });
      return fn(tx);
    } } as any,
    rows, timestamp,
    set status(value: string) { status = value; },
    set customerId(value: number) { customerId = value; },
    set linkedCustomerId(value: number) { linkedCustomerId = value; },
    set inquiryId(value: number) { inquiryId = value; },
    set archived(value: boolean) { archived = value; },
    get counts() { return { updates, logs }; },
    input: { id: 20, reconciliationToken: "token", actualMessageId: "actual", text: "estimate",
      timestamp, managerBotId: "bot", managerChatId: "chat" },
  };
}

test("confirmed historical group notice cannot move a reopened repair back to approval waiting", async () => {
  const f = confirmationFixture(undefined, true);
  f.archived = true;
  f.status = "POST_UNCONFIRMED";
  await confirmLineManagerSendOutbox(f.db, f.input);
  assert.deepEqual(f.counts, { updates: 0, logs: 0 });
  assert.deepEqual(f.rows.map(row => row.status), ["見積中", "見積中"]);
});

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

test("business confirmation changes status once only after Manager history and skips drift", async () => {
  const good = confirmationFixture(undefined, true);
  assert.deepEqual(good.counts, { updates: 0, logs: 0 });
  good.status = "POST_UNCONFIRMED";
  await confirmLineManagerSendOutbox(good.db, good.input);
  await confirmLineManagerSendOutbox(good.db, good.input);
  assert.deepEqual(good.counts, { updates: 2, logs: 2 });
  for (const drift of [
    (f: ReturnType<typeof confirmationFixture>) => { f.rows.push(repair(4, { inquiryWatchPromotion: null })); },
    (f: ReturnType<typeof confirmationFixture>) => { f.rows[0].customerId = 9; },
    (f: ReturnType<typeof confirmationFixture>) => { f.linkedCustomerId = 9; },
    (f: ReturnType<typeof confirmationFixture>) => { f.inquiryId = 9; },
  ]) {
    const fixture = confirmationFixture(undefined, true); drift(fixture);
    fixture.status = "POST_UNCONFIRMED";
    // The POST already happened: reconcile genuine send evidence even after routing drift,
    // but do not apply a stale repair-status transition.
    await assert.doesNotReject(confirmLineManagerSendOutbox(fixture.db, fixture.input));
    assert.deepEqual(fixture.counts, { updates: 0, logs: 0 });
  }
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
