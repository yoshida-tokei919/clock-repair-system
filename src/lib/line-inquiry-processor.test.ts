import assert from "node:assert/strict";
import test from "node:test";
import type { LineInquiryProcessorDb } from "./line-inquiry-processor";
import { processLineWebhookInboxItem } from "./line-inquiry-processor";

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
    status: "RECEIVED",
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

test("RECEIVED text inbox is persisted into Inquiry and marked PROCESSED", async () => {
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

test("already processed inbox is skipped", async () => {
  const fake = createFakeDb();
  fake.inbox.status = "PROCESSED";

  const result = await processLineWebhookInboxItem(fake.db, 1);

  assert.equal(result, "skipped");
  assert.equal(fake.users.length, 0);
  assert.equal(fake.inquiries.length, 0);
  assert.equal(fake.messages.length, 0);
});
