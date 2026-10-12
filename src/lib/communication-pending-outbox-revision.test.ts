import assert from "node:assert/strict";
import test from "node:test";
import { getCustomerCommunicationHub } from "./customer-communication-hub";
import { getRepairCommunicationAiContext, resolveCustomerCommunicationAiContext } from "./communication-ai-brief";
import { getCustomerPendingOutboxRevision, getRepairPendingOutboxRevision } from "./communication-pending-outbox-revision";

const approvedAt = new Date("2026-10-01T00:00:00Z");
type Row = {
  id: number; text: string; status: string; approvedAt: Date; idempotencyKey: string;
  sourceRepairId: number | null; inquiryId: number; customerId: number; repairCustomerId: number | null;
  inquiry: { lineUserId: number }; lineManagerChat: { lineUserId: number };
};

function row(id: number, overrides: Partial<Row> = {}): Row {
  return {
    id, text: `reply ${id}`, status: "APPROVED", approvedAt,
    idempotencyKey: `customer-line-reply:7:5:key-${id}`,
    sourceRepairId: null, inquiryId: 2, customerId: 7, repairCustomerId: null,
    inquiry: { lineUserId: 5 }, lineManagerChat: { lineUserId: 5 }, ...overrides,
  };
}

function outboxStore(rows: Row[]) {
  const queries: any[] = [];
  const findMany = async (query: any) => {
    queries.push(query);
    const customerId = query.where.inquiry.lineUser.linkedCustomerId;
    const chatCustomerId = query.where.lineManagerChat.lineUser.linkedCustomerId;
    const candidates = rows.filter((item) => item.customerId === customerId && item.customerId === chatCustomerId &&
      item.sourceRepairId === query.where.sourceRepairId &&
      (query.where.sourceRepair === undefined || item.repairCustomerId === query.where.sourceRepair.customerId) &&
      (query.where.inquiryId === undefined || item.inquiryId === query.where.inquiryId) &&
      (query.where.idempotencyKey === undefined || item.idempotencyKey.startsWith(query.where.idempotencyKey.startsWith)) &&
      query.where.status.in.includes(item.status) && item.id > (query.where.id?.gt ?? 0));
    if (query.orderBy?.id === "asc") candidates.sort((a, b) => a.id - b.id);
    else candidates.sort((a, b) => b.approvedAt.getTime() - a.approvedAt.getTime() || b.id - a.id);
    return candidates.slice(0, query.take);
  };
  return { db: { lineManagerSendOutbox: { findMany } } as any, queries };
}

test("Customer older pending changes stale the brief while the latest 20 remain identical", async () => {
  const rows = Array.from({ length: 25 }, (_, index) => row(index + 1));
  const { db, queries } = outboxStore(rows);
  Object.assign(db, {
    customer: { findUnique: async () => ({ id: 7, type: "individual", name: "A", companyName: null }) },
    lineUser: { findMany: async () => [{ id: 5, displayName: "A", lineManagerChat: null }] },
    inquiry: { findMany: async () => [] }, inquiryMessage: { findMany: async () => [] },
  });
  const context = async () => resolveCustomerCommunicationAiContext(7, (await getCustomerCommunicationHub(db, 7))!);
  const first = await context();
  assert.equal(first.context.pendingOutboxes.length, 20);
  assert.equal(queries.filter((query) => query.take === 20).length, 1);
  rows[0].text = "edited old reply";
  const edited = await context();
  assert.deepEqual(first.context, edited.context);
  assert.notEqual(first.inputFingerprint, edited.inputFingerprint);
  rows[0] = row(100, { text: "reply 1", approvedAt: new Date("2026-09-01T00:00:00Z") });
  const replaced = await context();
  assert.deepEqual(first.context, replaced.context);
  assert.notEqual(first.inputFingerprint, replaced.inputFingerprint);
  rows.shift();
  const removed = await context();
  assert.deepEqual(first.context, removed.context);
  assert.notEqual(first.inputFingerprint, removed.inputFingerprint);
  const visible = JSON.stringify(first.context);
  for (const forbidden of ["pendingOutboxRevision", "idempotencyKey", "lineManagerChat", "sendId", '"text":"reply 1"']) {
    assert.equal(visible.includes(forbidden), false, forbidden);
  }
});

test("Repair older pending changes stale the brief while its latest 20 remain identical", async () => {
  const rows = Array.from({ length: 25 }, (_, index) => row(index + 1, {
    sourceRepairId: 10, repairCustomerId: 7, idempotencyKey: `repair-line-reply:10:key-${index + 1}`,
  }));
  const { db } = outboxStore(rows);
  db.inquiryMessage = { findFirst: async () => ({ id: 50 }), findMany: async () => [] };
  db.inquiry = { findUnique: async () => ({ lineUser: { linkedCustomerId: 7, lineManagerChat: null } }) };
  const context = async () => {
    const pendingRows = await db.lineManagerSendOutbox.findMany({
      where: { inquiryId: 2, sourceRepairId: 10, sourceRepair: { customerId: 7 }, status: { in: ["APPROVED", "CLAIMED", "PRE_SEND_FAILED", "POST_UNCONFIRMED"] },
        inquiry: { lineUser: { linkedCustomerId: 7 } }, lineManagerChat: { lineUser: { linkedCustomerId: 7 } } },
      orderBy: [{ approvedAt: "desc" }, { id: "desc" }], take: 20,
    });
    const chat: any = { customerId: 7, sourceInquiryId: 2, promotedAt: null, originAiSummary: null,
      messages: [], pendingOutboxes: pendingRows.map((item: Row) => ({ ...item, relatedRepairIds: [10] })),
      hasEarlierMessages: false, sendAvailable: false };
    return getRepairCommunicationAiContext(db, 10, chat);
  };
  const first = await context();
  assert.equal(first.context.pendingOutboxes.length, 20);
  rows[0].text = "edited old reply";
  const edited = await context();
  assert.deepEqual(first.context, edited.context);
  assert.notEqual(first.inputFingerprint, edited.inputFingerprint);
  rows[0] = row(100, { sourceRepairId: 10, repairCustomerId: 7, idempotencyKey: "repair-line-reply:10:replacement", approvedAt: new Date("2026-09-01T00:00:00Z") });
  const replaced = await context();
  assert.deepEqual(first.context, replaced.context);
  assert.notEqual(first.inputFingerprint, replaced.inputFingerprint);
  rows.shift();
  const removed = await context();
  assert.deepEqual(first.context, removed.context);
  assert.notEqual(first.inputFingerprint, removed.inputFingerprint);
  const visible = JSON.stringify(first.context);
  for (const forbidden of ["pendingOutboxRevision", "idempotencyKey", "lineManagerChat", "sendId", '"text":"reply 1"']) {
    assert.equal(visible.includes(forbidden), false, forbidden);
  }
});

test("pending revision uses bounded ascending ID pages and excludes other customers and terminal rows", async () => {
  const rows = Array.from({ length: 205 }, (_, index) => row(index + 1));
  rows.push(row(206, { customerId: 8, inquiry: { lineUserId: 8 }, lineManagerChat: { lineUserId: 8 } }));
  rows.push(row(207, { status: "CONFIRMED" }));
  rows.push(row(208, { inquiry: { lineUserId: 5 }, lineManagerChat: { lineUserId: 6 } }));
  rows.push(row(209, { idempotencyKey: "customer-line-reply:7:6:wrong-user" }));
  const { db, queries } = outboxStore(rows);
  const original = await getCustomerPendingOutboxRevision(db, 7);
  assert.deepEqual(queries.map((query) => query.where.id.gt), [0, 200]);
  for (const query of queries) {
    assert.equal(query.take, 200);
    assert.deepEqual(query.orderBy, { id: "asc" });
    assert.deepEqual(query.where.status.in, ["APPROVED", "CLAIMED", "PRE_SEND_FAILED", "POST_UNCONFIRMED"]);
    assert.equal(query.where.sourceRepairId, null);
    assert.deepEqual(query.where.inquiry.lineUser, { linkedCustomerId: 7 });
    assert.deepEqual(query.where.lineManagerChat.lineUser, { linkedCustomerId: 7 });
    assert.equal(query.select.sendId, undefined);
    assert.equal(query.select.lineManagerChat.select.managerChatId, undefined);
  }
  rows.reverse();
  assert.equal(await getCustomerPendingOutboxRevision(db, 7), original);
  rows.find((item) => item.id === 206)!.text = "other customer edited";
  rows.find((item) => item.id === 207)!.text = "confirmed edited";
  rows.find((item) => item.id === 208)!.text = "wrong chat user edited";
  rows.find((item) => item.id === 209)!.text = "wrong namespace user edited";
  assert.equal(await getCustomerPendingOutboxRevision(db, 7), original);
  rows.find((item) => item.id === 1)!.status = "CLAIMED";
  assert.notEqual(await getCustomerPendingOutboxRevision(db, 7), original);
});

test("Repair revision is limited to origin Inquiry, Repair, and Customer", async () => {
  const rows = [row(1, { sourceRepairId: 10, repairCustomerId: 7 }),
    row(2, { sourceRepairId: 11, repairCustomerId: 7 }),
    row(3, { sourceRepairId: 10, repairCustomerId: 8 }),
    row(4, { sourceRepairId: 10, repairCustomerId: 7, customerId: 8 }),
    row(5, { sourceRepairId: 10, repairCustomerId: 7, inquiryId: 3 }),
    row(6, { sourceRepairId: 10, repairCustomerId: 7, lineManagerChat: { lineUserId: 6 } })];
  const { db, queries } = outboxStore(rows);
  const original = await getRepairPendingOutboxRevision(db, 10, 7, 2);
  assert.equal(queries[0].where.sourceRepairId, 10);
  assert.equal(queries[0].where.sourceRepair.customerId, 7);
  assert.equal(queries[0].where.inquiryId, 2);
  assert.deepEqual(queries[0].where.inquiry.lineUser, { linkedCustomerId: 7 });
  assert.deepEqual(queries[0].where.lineManagerChat.lineUser, { linkedCustomerId: 7 });
  for (const id of [2, 3, 4, 5, 6]) rows.find((item) => item.id === id)!.text = `changed ${id}`;
  assert.equal(await getRepairPendingOutboxRevision(db, 10, 7, 2), original);
  rows[0].text = "changed own row";
  assert.notEqual(await getRepairPendingOutboxRevision(db, 10, 7, 2), original);
});
