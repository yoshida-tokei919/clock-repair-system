import assert from "node:assert/strict";
import test from "node:test";
import type { LineInquiryProcessorDb } from "./line-inquiry-processor";
import {
  claimLineWebhookInboxBatch,
  processLineWebhookInboxItem,
} from "./line-inquiry-processor";

function createFakeDb() {
  const inbox = {
    id: 1,
    eventType: "message",
    rawEvent: {
      type: "message",
      timestamp: 1_789_700_000_000,
      source: { userId: "U-test" },
      message: { id: "M-test", type: "text", text: "テスト相談" },
    },
    receivedAt: new Date("2026-09-18T00:00:00.000Z"),
    status: "PROCESSING",
    processedAt: null as Date | null,
    lastError: null as string | null,
  };
  const users: Array<Record<string, unknown>> = [];
  const inquiries: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [];
  const db: any = {};
  db.lineWebhookInbox = {
    findUnique: async ({ where }: { where: { id: number } }) =>
      where.id === inbox.id ? inbox : null,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(inbox, data);
      return inbox;
    },
  };
  db.customer = { findMany: async () => [] };
  db.lineUser = {
    findUnique: async () => null,
    upsert: async ({ create }: { create: Record<string, unknown> }) => {
      const user = { id: 1, ...create };
      users.push(user);
      return user;
    },
  };
  db.inquiry = {
    findMany: async () => [],
    findFirst: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const inquiry = { id: 1, ...data };
      inquiries.push(inquiry);
      return inquiry;
    },
  };
  db.inquiryMessage = {
    findUnique: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const message = { id: 1, ...data };
      messages.push(message);
      return message;
    },
  };
  db.$executeRaw = async () => undefined;
  db.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => callback(db);

  return {
    db: db as LineInquiryProcessorDb,
    inbox,
    users,
    inquiries,
    messages,
  };
}

test("claimed text inbox is persisted into Inquiry and marked PROCESSED", async () => {
  const fake = createFakeDb();

  const result = await processLineWebhookInboxItem(fake.db, 1);

  assert.equal(result, "processed");
  assert.equal(fake.users.length, 1);
  assert.equal(fake.inquiries.length, 1);
  assert.equal(fake.messages.length, 1);
  assert.equal(fake.messages[0]?.externalMessageId, "M-test");
  assert.equal(fake.messages[0]?.body, "テスト相談");
  assert.equal(fake.inbox.status, "PROCESSED");
  assert.ok(fake.inbox.processedAt instanceof Date);
});

test("image inbox creates IMAGE message and calls the image handler", async () => {
  const fake = createFakeDb();
  (fake.inbox.rawEvent as any).message = { id: "M-image", type: "image" };
  const imageCalls: Array<Record<string, unknown>> = [];

  const result = await processLineWebhookInboxItem(fake.db, 1, {
    handleImage: async (input) => {
      imageCalls.push(input);
    },
  });

  assert.equal(result, "processed");
  assert.equal(fake.messages.length, 1);
  assert.equal(fake.messages[0]?.externalMessageId, "M-image");
  assert.equal(fake.messages[0]?.messageType, "IMAGE");
  assert.equal(fake.messages[0]?.body, null);
  assert.equal(imageCalls.length, 1);
  assert.equal(imageCalls[0]?.inquiryId, 1);
  assert.equal(imageCalls[0]?.inquiryMessageId, 1);
  assert.equal(imageCalls[0]?.externalMessageId, "M-image");
});

test("already processed inbox is skipped", async () => {
  const fake = createFakeDb();
  fake.inbox.status = "PROCESSED";

  const result = await processLineWebhookInboxItem(fake.db, 1);

  assert.equal(result, "skipped");
  assert.equal(fake.users.length, 0);
  assert.equal(fake.inquiries.length, 0);
  assert.equal(fake.messages.length, 0);
});

test("claim batch marks eligible inbox rows PROCESSING with an attempt", async () => {
  const now = new Date("2026-09-19T00:00:00.000Z");
  const updateCalls: Array<Record<string, unknown>> = [];
  const db: any = {
    lineWebhookInbox: {
      findMany: async (args: Record<string, unknown>) => {
        assert.deepEqual((args as any).where.attemptCount, { lt: 5 });
        return [{ id: 10 }, { id: 11 }];
      },
      updateMany: async (args: Record<string, unknown>) => {
        updateCalls.push(args);
        return { count: 1 };
      },
    },
  };

  const claimed = await claimLineWebhookInboxBatch(
    db as LineInquiryProcessorDb,
    { take: 2, now },
  );

  assert.deepEqual(claimed, [10, 11]);
  assert.equal(updateCalls.length, 2);
  assert.equal((updateCalls[0] as any).data.status, "PROCESSING");
  assert.deepEqual((updateCalls[0] as any).data.attemptCount, { increment: 1 });
  assert.equal((updateCalls[0] as any).data.lastAttemptAt, now);
});
