import assert from "node:assert/strict";
import test from "node:test";
import { createRepairLineReply, getRepairLineChat } from "./repair-line-chat";
import { InquiryLineChatInputError, InquiryLineChatNotFoundError, InquiryLineChatUnavailableError } from "./inquiry-line-chat";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const now = new Date("2026-09-24T01:00:00Z");
const origin = { id: 5, inquiryId: 7, promotedRepairId: 10, promotedAt: now, inquiry: { lineUser: { linkedCustomerId: 1, lineManagerChat: { id: 30, verifiedAt: now, managerBotId: "secret-bot" } } } };

function message(id: number, inquiryId: number, oldRepairIds: number[], directRepairIds: number[], options: { lineUserId?: number; inquiryLineUserId?: number; routingCustomerId?: number } = {}) {
  return {
    id, inquiryId, lineUserId: options.lineUserId ?? 2, inquiry: { lineUserId: options.inquiryLineUserId ?? 2 },
    direction: "INBOUND", messageType: id === 4 || id === 9 ? "IMAGE" : "TEXT", body: `body ${id}`,
    receivedAt: new Date(now.getTime() + id * 1000), sentAt: null, createdAt: now, status: "received",
    externalMessageId: "secret-external",
    files: id === 4 || id === 9 ? [{ id: id === 4 ? 70 : 71, mimeType: "image/png", width: 10, height: 10, uploadStatus: "STORED", objectKey: "secret-object" }] : [],
    classification: oldRepairIds.length ? { scope: "WATCHES", source: "MANUAL", confidence: null, confirmedAt: now, watchLinks: [{ inquiryWatchId: 5 }], repairLinks: oldRepairIds.map((repairId) => ({ repairId })) } : null,
    postIntakeRouting: directRepairIds.length || options.routingCustomerId ? { customerId: options.routingCustomerId ?? 1, repairLinks: directRepairIds.map((repairId) => ({ repairId })) } : null,
  };
}

function fakeDb(rows: ReturnType<typeof message>[], promotion: typeof origin | null = origin) {
  const queries: any = {};
  const db: any = {
    repair: { findUnique: async (query: any) => { queries.repair = query; return { id: 10, customerId: 1, inquiryWatchPromotion: promotion }; } },
    inquiryMessage: { findMany: async (query: any) => { queries.messages = query; return rows; } },
    lineManagerSendOutbox: { findMany: async (query: any) => { queries.outboxes = query; return [
      { id: 1, text: "pending", status: "APPROVED", approvedAt: now, createdAt: now, sourceRepairId: 10, sendId: "secret-send" },
      { id: 2, text: "other Repair", status: "APPROVED", approvedAt: now, createdAt: now, sourceRepairId: 11 },
    ]; } },
    inquiryWatch: { findMany: async (query: any) => { queries.watches = query; return [{ id: 5, position: 1, label: "mine", promotedRepairId: 10, promotedRepair: { inquiryNumber: "T-10" } }]; } },
  };
  return { db, queries };
}

test("Repair projection combines old and cross-Inquiry direct links with customer and LineUser guards", async () => {
  const { db, queries } = fakeDb([
    message(9, 8, [], [10]),
    message(8, 8, [], [11]),
    message(7, 8, [], []),
    message(6, 8, [], [10], { routingCustomerId: 3 }),
    message(5, 8, [], [10], { inquiryLineUserId: 3 }),
    message(4, 7, [10], []),
    message(3, 7, [11], []),
    message(2, 8, [10], []),
    message(1, 8, [10], [10]),
  ]);
  const payload = await getRepairLineChat(db, 10);
  assert.equal(queries.repair.select.customerId, true);
  assert.equal(queries.messages.where.lineUser.linkedCustomerId, 1);
  assert.equal(queries.messages.where.inquiry.lineUser.linkedCustomerId, 1);
  assert.deepEqual(queries.messages.where.OR, [
    { inquiryId: 7, classification: { repairLinks: { some: { repairId: 10 } } } },
    { postIntakeRouting: { customerId: 1, repairLinks: { some: { repairId: 10, customerId: 1 } } } },
  ]);
  assert.equal(queries.messages.take, 201);
  assert.deepEqual(payload.messages.map((item) => [item.id, item.inquiryId, item.editable]), [[1, 8, false], [4, 7, true], [9, 8, false]]);
  assert.equal(payload.messages[1].files[0].id, 70);
  assert.equal(payload.messages[2].files[0].id, 71);
  assert.equal(payload.messages[2].classification, null);
  assert.equal(payload.customerId, 1);
  assert.deepEqual(queries.outboxes.where, { inquiryId: 7, sourceRepairId: 10, status: { notIn: ["CONFIRMED", "CANCELLED"] } });
  assert.deepEqual(payload.pendingOutboxes.map((item) => item.id), [1]);
  const serialized = JSON.stringify(payload);
  for (const forbidden of ["secret-external", "secret-object", "secret-send", "secret-bot", "externalMessageId", "managerBotId", "sendId", "objectKey", "sourceRepairId", "signedUrl", "token"]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("an old Repair link in a non-origin Inquiry needs a direct post-intake link", async () => {
  const { db } = fakeDb([message(2, 8, [10], []), message(1, 8, [10], [10])]);
  const payload = await getRepairLineChat(db, 10);
  assert.deepEqual(payload.messages.map((item) => item.id), [1]);
  assert.equal(payload.messages[0].editable, false);
});

test("direct post-intake links remain readable without an origin, but sending remains unavailable", async () => {
  const { db, queries } = fakeDb([message(9, 8, [], [10])], null);
  const payload = await getRepairLineChat(db, 10);
  assert.equal(payload.available, true);
  assert.equal(payload.sendAvailable, false);
  assert.equal(payload.sourceInquiryId, null);
  assert.deepEqual(payload.messages.map((item) => item.inquiryId), [8]);
  assert.deepEqual(payload.pendingOutboxes, []);
  assert.equal(queries.outboxes, undefined);
  await assert.rejects(createRepairLineReply(db, 10, { text: "hello", idempotencyKey: uuid }), InquiryLineChatUnavailableError);
});

test("a direct link stays read-only even when the same message has an old link in the origin Inquiry", async () => {
  const { db } = fakeDb([message(10, 7, [10], [10])]);
  const payload = await getRepairLineChat(db, 10);
  assert.equal(payload.messages[0].editable, false);
  assert.equal(payload.messages[0].classification, null);
});

test("stale origin for another Customer cannot expose origin data or create a reply", async () => {
  const staleOrigin = { ...origin, inquiry: { lineUser: { ...origin.inquiry.lineUser, linkedCustomerId: 3 } } };
  const { db, queries } = fakeDb([message(9, 8, [], [10]), message(4, 7, [10], [])], staleOrigin);
  const payload = await getRepairLineChat(db, 10);
  assert.equal(payload.sourceInquiryId, null);
  assert.equal(payload.promotedAt, null);
  assert.equal(payload.sendAvailable, false);
  assert.deepEqual(payload.messages.map((item) => item.id), [9]);
  assert.deepEqual(payload.pendingOutboxes, []);
  assert.deepEqual(payload.watchOptions, []);
  assert.deepEqual(payload.siblingRepairs, []);
  assert.equal(queries.outboxes, undefined);
  assert.equal(queries.watches, undefined);
  await assert.rejects(createRepairLineReply(db, 10, { text: "hello", idempotencyKey: uuid }), InquiryLineChatUnavailableError);
});

test("customer-only post-intake routing does not qualify for a Repair projection", async () => {
  const { db, queries } = fakeDb([message(9, 8, [], [], { routingCustomerId: 1 })], null);
  const payload = await getRepairLineChat(db, 10);
  assert.deepEqual(queries.messages.where.OR, [
    { postIntakeRouting: { customerId: 1, repairLinks: { some: { repairId: 10, customerId: 1 } } } },
  ]);
  assert.equal(payload.available, false);
  assert.deepEqual(payload.messages, []);
});

test("unlinked legacy Repair has no Repair conversation", async () => {
  const { db } = fakeDb([], null);
  const payload = await getRepairLineChat(db, 10);
  assert.equal(payload.available, false);
  assert.deepEqual(payload.messages, []);
});

test("Repair reply uses only its promotion and verified mapping with a Repair namespaced UUID", async () => {
  let input: any;
  const db: any = { repair: { findUnique: async () => ({ id: 10, customerId: 1, inquiryWatchPromotion: origin }) } };
  const result = await createRepairLineReply(db, 10, { text: "  hello\n", idempotencyKey: uuid, inquiryId: 99, lineManagerChatId: 99, sourceRepairId: 99 }, async (_db: any, value: any): Promise<any> => { input = value; return { id: 1, status: "APPROVED", approvedAt: now, createdAt: now }; });
  assert.deepEqual(input, { inquiryId: 7, lineManagerChatId: 30, sourceRepairId: 10, text: "  hello\n", idempotencyKey: `repair-line-reply:10:${uuid}` });
  assert.equal(result.status, "APPROVED");
  await assert.rejects(createRepairLineReply(db, 10, { text: " ", idempotencyKey: uuid }), InquiryLineChatInputError);
  db.repair.findUnique = async () => ({ id: 10, customerId: 1, inquiryWatchPromotion: { ...origin, inquiry: { lineUser: { linkedCustomerId: 1, lineManagerChat: null } } } });
  await assert.rejects(createRepairLineReply(db, 10, { text: "ok", idempotencyKey: uuid }), InquiryLineChatUnavailableError);
  db.repair.findUnique = async () => null;
  await assert.rejects(createRepairLineReply(db, 10, { text: "ok", idempotencyKey: uuid }), InquiryLineChatNotFoundError);
});

test("Repair history keeps the latest 200 linked messages in deterministic chronological order", async () => {
  const { db } = fakeDb(Array.from({ length: 201 }, (_, index) => message(201 - index, index % 2 ? 8 : 7, index % 2 ? [] : [10], index % 2 ? [10] : [])));
  const payload = await getRepairLineChat(db, 10);
  assert.equal(payload.messages.length, 200);
  assert.equal(payload.messages[0].id, 2);
  assert.equal(payload.messages[199].id, 201);
  assert.equal(payload.hasEarlierMessages, true);
});
