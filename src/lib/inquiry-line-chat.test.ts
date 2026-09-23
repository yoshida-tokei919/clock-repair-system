import assert from "node:assert/strict";
import test from "node:test";

import {
  createInquiryLineReply,
  getInquiryLineChat,
  INQUIRY_LINE_CHAT_LIMITS,
  InquiryLineChatInputError,
  InquiryLineChatNotFoundError,
  InquiryLineChatUnavailableError,
  parseInquiryLineReply,
} from "./inquiry-line-chat";

const VALID_UUID = "123e4567-e89b-42d3-a456-426614174000";

test("reply parser preserves exact text and accepts canonical UUID", () => {
  const body = { text: "  こんにちは\nよろしくお願いします。  ", idempotencyKey: VALID_UUID };
  assert.deepEqual(parseInquiryLineReply(body), body);
});

test("reply parser rejects malformed, blank, too long, and invalid UUID", () => {
  const invalid = [
    null,
    [],
    {},
    { text: 1, idempotencyKey: VALID_UUID },
    { text: "   ", idempotencyKey: VALID_UUID },
    { text: "x".repeat(INQUIRY_LINE_CHAT_LIMITS.MAX_REPLY_LENGTH + 1), idempotencyKey: VALID_UUID },
    { text: "ok", idempotencyKey: "not-a-uuid" },
  ];
  for (const value of invalid) {
    assert.throws(() => parseInquiryLineReply(value), InquiryLineChatInputError);
  }
});

test("chat payload is bounded, sorted by effective time, and privacy minimized", async () => {
  let messageQuery: any;
  let outboxQuery: any;
  const base = Date.parse("2026-09-23T00:00:00Z");
  const rows = Array.from({ length: 201 }, (_, index) => {
    const id = 201 - index;
    const createdAt = new Date(base + id * 1000);
    return {
      id,
      direction: id % 2 ? "INBOUND" : "OUTBOUND",
      messageType: id === 200 ? "IMAGE" : "TEXT",
      body: `body-${id}`,
      receivedAt: id === 3 ? new Date(base + 900_000) : id % 2 ? createdAt : null,
      sentAt: id === 2 ? new Date(base + 800_000) : id % 2 ? null : createdAt,
      createdAt,
      status: id % 2 ? "received" : "sent",
      externalMessageId: `secret-message-${id}`,
      lineUserId: 999,
      files: id === 200 ? [{
        id: 88,
        mimeType: "image/webp",
        width: 1200,
        height: 800,
        uploadStatus: "STORED",
        objectKey: "secret/object.webp",
      }] : [],
    };
  });
  const db: any = {
    inquiry: {
      findUnique: async () => ({
        id: 7,
        lineUserId: 999,
        lineUser: {
          lineUserId: "U-secret",
          lineManagerChat: {
            verifiedAt: new Date("2026-09-23T01:00:00Z"),
            managerBotId: "secret-bot",
            managerChatId: "secret-chat",
          },
        },
      }),
    },
    inquiryMessage: {
      findMany: async (query: any) => {
        messageQuery = query;
        return rows;
      },
    },
    lineManagerSendOutbox: {
      findMany: async (query: any) => {
        outboxQuery = query;
        return [{
          id: 5,
          text: "queued",
          status: "APPROVED",
          approvedAt: new Date("2026-09-23T02:00:00Z"),
          createdAt: new Date("2026-09-23T02:00:00Z"),
          sendId: "secret-send",
          managerBotIdSnapshot: "secret-bot",
          managerChatIdSnapshot: "secret-chat",
          claimToken: "secret-token",
          lastError: "secret-error",
        }];
      },
    },
  };

  const result = await getInquiryLineChat(db, 7);
  assert.ok(result);
  assert.equal(messageQuery.where.inquiryId, 7);
  assert.equal(messageQuery.take, 201);
  assert.deepEqual(messageQuery.orderBy, { id: "desc" });
  assert.deepEqual(messageQuery.select.files.select, {
    id: true,
    mimeType: true,
    width: true,
    height: true,
    uploadStatus: true,
  });
  assert.equal(outboxQuery.where.inquiryId, 7);
  assert.deepEqual(outboxQuery.where.status.notIn, ["CONFIRMED", "CANCELLED"]);
  assert.equal(outboxQuery.take, 20);

  assert.equal(result.hasEarlierMessages, true);
  assert.equal(result.messages.length, 200);
  assert.equal(result.messages.some((message: any) => message.id === 1), false);
  const ids = result.messages.map((message: any) => message.id);
  assert.ok(ids.indexOf(2) > ids.indexOf(199));
  assert.ok(ids.indexOf(3) > ids.indexOf(2));
  assert.equal(result.sendAvailable, true);
  assert.equal(result.pendingOutboxes.length, 1);

  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "secret-message",
    "U-secret",
    "secret-bot",
    "secret-chat",
    "secret/object.webp",
    "secret-send",
    "secret-token",
    "secret-error",
    "externalMessageId",
    "lineUserId",
    "objectKey",
    "managerBotId",
    "managerChatId",
    "sendId",
    "claimToken",
    "lastError",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("chat payload reports send unavailable without verified mapping", async () => {
  const db: any = {
    inquiry: { findUnique: async () => ({ id: 8, lineUser: { lineManagerChat: null } }) },
    inquiryMessage: { findMany: async () => [] },
    lineManagerSendOutbox: { findMany: async () => [] },
  };
  const result = await getInquiryLineChat(db, 8);
  assert.equal(result?.sendAvailable, false);
  assert.equal(result?.mappingVerifiedAt, null);
});

test("chat payload returns null for missing inquiry", async () => {
  const db: any = {
    inquiry: { findUnique: async () => null },
    inquiryMessage: { findMany: async () => { throw new Error("must not query messages"); } },
    lineManagerSendOutbox: { findMany: async () => { throw new Error("must not query outboxes"); } },
  };
  assert.equal(await getInquiryLineChat(db, 9), null);
});

test("reply creation rejects missing inquiry and unavailable mapping", async () => {
  const missingDb: any = { inquiry: { findUnique: async () => null } };
  await assert.rejects(
    () => createInquiryLineReply(missingDb, 10, { text: "hello", idempotencyKey: VALID_UUID }, async () => null as never),
    InquiryLineChatNotFoundError,
  );

  const unavailableDb: any = {
    inquiry: { findUnique: async () => ({ id: 10, lineUser: { lineManagerChat: null } }) },
  };
  await assert.rejects(
    () => createInquiryLineReply(unavailableDb, 10, { text: "hello", idempotencyKey: VALID_UUID }, async () => null as never),
    InquiryLineChatUnavailableError,
  );
});

test("reply creation delegates exact text and namespaced idempotency key and returns safe fields", async () => {
  const db: any = {
    inquiry: {
      findUnique: async () => ({
        id: 12,
        lineUser: { lineManagerChat: { id: 44, managerBotId: "do-not-return", managerChatId: "do-not-return" } },
      }),
    },
  };
  let delegated: any;
  const create: any = async (_db: unknown, input: unknown) => {
    delegated = input;
    return {
      id: 77,
      status: "APPROVED",
      approvedAt: new Date("2026-09-23T03:00:00Z"),
      createdAt: new Date("2026-09-23T03:00:01Z"),
      sendId: "secret-send",
      managerBotIdSnapshot: "secret-bot",
      managerChatIdSnapshot: "secret-chat",
      claimToken: "secret-token",
    };
  };

  const result = await createInquiryLineReply(
    db,
    12,
    { text: "  exact text\n  ", idempotencyKey: VALID_UUID },
    create,
  );

  assert.deepEqual(delegated, {
    inquiryId: 12,
    lineManagerChatId: 44,
    text: "  exact text\n  ",
    idempotencyKey: `inquiry-line-reply:12:${VALID_UUID}`,
  });
  assert.deepEqual(result, {
    id: 77,
    status: "APPROVED",
    approvedAt: new Date("2026-09-23T03:00:00Z"),
    createdAt: new Date("2026-09-23T03:00:01Z"),
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("secret"), false);
});