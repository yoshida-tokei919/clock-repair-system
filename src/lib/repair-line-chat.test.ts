import assert from "node:assert/strict";
import test from "node:test";
import { createRepairLineReply, filterRepairLineTimeline, getRepairLineChat } from "./repair-line-chat";
import { InquiryLineChatInputError, InquiryLineChatNotFoundError, InquiryLineChatUnavailableError } from "./inquiry-line-chat";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const now = new Date("2026-09-24T01:00:00Z");
const origin = { id: 5, inquiryId: 7, promotedRepairId: 10, promotedAt: now, inquiry: { lineUser: { lineManagerChat: { id: 30, verifiedAt: now, managerBotId: "secret-bot" } } } };

test("legacy Repair has unavailable empty history and never queries customer or guesses an Inquiry", async () => {
  const calls: string[] = [];
  const db: any = { repair: { findUnique: async (query: any) => { calls.push(JSON.stringify(query)); return { id: 10, inquiryWatchPromotion: null }; } }, inquiryMessage: { findMany: async () => { throw new Error("must not query"); } } };
  const payload = await getRepairLineChat(db, 10);
  assert.equal(payload.available, false);
  assert.deepEqual(payload.messages, []);
  assert.deepEqual(payload.pendingOutboxes, []);
  assert.equal(calls.some((call) => call.includes("customer")), false);
  await assert.rejects(createRepairLineReply(db, 10, { text: "hello", idempotencyKey: uuid }), InquiryLineChatUnavailableError);
});

test("Repair payload is source-Inquiry bounded, link-only related, and privacy minimized", async () => {
  let messageQuery: any, outboxQuery: any, watchQuery: any;
  const makeMessage = (id: number, scope: "WATCHES" | "COMMON" | "UNASSIGNED" | null, repairIds: number[], body = "same text") => ({
    id, direction: "INBOUND", messageType: id === 4 ? "IMAGE" : "TEXT", body, receivedAt: now, sentAt: null, createdAt: now, status: "received", externalMessageId: "secret-external",
    files: id === 4 ? [{ id: 70, mimeType: "image/png", width: 10, height: 10, uploadStatus: "STORED", objectKey: "secret-object" }] : [],
    classification: scope ? { scope, source: "MANUAL", confidence: null, confirmedAt: now, watchLinks: scope === "WATCHES" ? [{ inquiryWatchId: 5 }] : [], repairLinks: repairIds.map((repairId) => ({ repairId })) } : null,
  });
  const db: any = {
    repair: { findUnique: async () => ({ id: 10, inquiryWatchPromotion: origin }) },
    inquiryMessage: { findMany: async (query: any) => { messageQuery = query; return [makeMessage(4, "WATCHES", [10]), makeMessage(3, "COMMON", [10, 11]), makeMessage(2, "WATCHES", [11]), makeMessage(1, null, [])]; } },
    lineManagerSendOutbox: { findMany: async (query: any) => { outboxQuery = query; return [
      { id: 2, text: "sibling", status: "POST_UNCONFIRMED", approvedAt: now, createdAt: now, sourceRepairId: 11 },
      { id: 1, text: "pending", status: "APPROVED", approvedAt: now, createdAt: now, sourceRepairId: 10, sendId: "secret-send", managerBotIdSnapshot: "secret-bot" },
    ]; } },
    inquiryWatch: { findMany: async (query: any) => { watchQuery = query; return [{ id: 5, position: 1, label: "mine", promotedRepairId: 10, promotedRepair: { inquiryNumber: "T-10" } }, { id: 6, position: 2, label: "sibling", promotedRepairId: 11, promotedRepair: { inquiryNumber: "T-11" } }]; } },
  };
  const payload = await getRepairLineChat(db, 10);
  assert.equal(messageQuery.where.inquiryId, 7);
  assert.equal(messageQuery.take, 201);
  assert.equal(outboxQuery.where.inquiryId, 7);
  assert.deepEqual(outboxQuery.where.status.notIn, ["CONFIRMED", "CANCELLED"]);
  assert.deepEqual(outboxQuery.orderBy, { id: "desc" });
  assert.equal(outboxQuery.take, 20);
  assert.equal(watchQuery.where.inquiryId, 7);
  assert.equal(payload.unassignedCount, 1);
  assert.deepEqual(payload.messages.map((message) => message.relatedToCurrentRepair), [false, false, true, true]);
  assert.deepEqual(payload.pendingOutboxes.map((item) => item.id), [1, 2]);
  assert.deepEqual(payload.pendingOutboxes.map((item) => item.relatedToCurrentRepair), [true, false]);
  assert.deepEqual(filterRepairLineTimeline([...payload.messages, ...payload.pendingOutboxes], false).map((item) => item.relatedToCurrentRepair), [true, true, true]);
  assert.equal(filterRepairLineTimeline([...payload.messages, ...payload.pendingOutboxes], true).length, 6);
  const serialized = JSON.stringify(payload);
  for (const forbidden of ["secret-external", "secret-object", "secret-send", "secret-bot", "externalMessageId", "managerBotId", "sendId", "objectKey", "sourceRepairId", "signedUrl", "token"]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("Repair reply uses only its promotion and verified mapping with a Repair namespaced UUID", async () => {
  let input: any;
  const db: any = { repair: { findUnique: async () => ({ id: 10, inquiryWatchPromotion: origin }) } };
  const result = await createRepairLineReply(db, 10, { text: "  hello\n", idempotencyKey: uuid, inquiryId: 99, lineManagerChatId: 99, sourceRepairId: 99 }, async (_db: any, value: any): Promise<any> => { input = value; return { id: 1, status: "APPROVED", approvedAt: now, createdAt: now }; });
  assert.deepEqual(input, { inquiryId: 7, lineManagerChatId: 30, sourceRepairId: 10, text: "  hello\n", idempotencyKey: `repair-line-reply:10:${uuid}` });
  assert.equal(result.status, "APPROVED");
  await assert.rejects(createRepairLineReply(db, 10, { text: " ", idempotencyKey: uuid }), InquiryLineChatInputError);
  db.repair.findUnique = async () => ({ id: 10, inquiryWatchPromotion: { ...origin, inquiry: { lineUser: { lineManagerChat: null } } } });
  await assert.rejects(createRepairLineReply(db, 10, { text: "ok", idempotencyKey: uuid }), InquiryLineChatUnavailableError);
  db.repair.findUnique = async () => null;
  await assert.rejects(createRepairLineReply(db, 10, { text: "ok", idempotencyKey: uuid }), InquiryLineChatNotFoundError);
});

test("Repair history returns only the latest 200 source messages and reports earlier rows", async () => {
  const db: any = {
    repair: { findUnique: async () => ({ id: 10, inquiryWatchPromotion: origin }) },
    inquiryMessage: { findMany: async (query: any) => {
      assert.deepEqual(query.where, { inquiryId: 7 });
      assert.equal(query.take, 201);
      return Array.from({ length: 201 }, (_, index) => ({ id: 201 - index, direction: "INBOUND", messageType: "TEXT", body: "ok", receivedAt: now, sentAt: null, createdAt: now, status: "received", files: [], classification: null }));
    } },
    lineManagerSendOutbox: { findMany: async () => [] },
    inquiryWatch: { findMany: async () => [] },
  };
  const payload = await getRepairLineChat(db, 10);
  assert.equal(payload.messages.length, 200);
  assert.equal(payload.messages.some((message) => message.id === 1), false);
  assert.equal(payload.hasEarlierMessages, true);
});
