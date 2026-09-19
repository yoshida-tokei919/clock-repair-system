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
    attemptCount: 1,
    processedAt: null as Date | null,
    lastError: null as string | null,
  };
  const users: Array<Record<string, unknown>> = [];
  const inquiries: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  let storedImageCount = 0;
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
    findUnique: async () => ({
      id: 1,
      status: "OPEN",
      lineUser: {
        displayName: (users[users.length - 1]?.displayName as string | undefined) ?? null,
        linkedCustomer: null,
      },
    }),
    findMany: async () => [],
    findFirst: async () => null,
    update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => ({ id: where.id, ...data }),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const inquiry = { id: 1, ...data };
      inquiries.push(inquiry);
      return inquiry;
    },
  };
  db.inquiryMessage = {
    findUnique: async () => null,
    count: async () => messages.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const message = { id: 1, ...data };
      messages.push(message);
      return message;
    },
  };
  db.inquiryFile = {
    count: async () => storedImageCount,
    findUnique: async () => ({ uploadStatus: storedImageCount > 0 ? "STORED" : "FAILED" }),
  };
  db.slackNotificationOutbox = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const notification = { id: notifications.length + 1, ...data };
      notifications.push(notification);
      return notification;
    },
    upsert: async ({ create }: { create: Record<string, unknown> }) => {
      const existing = notifications.find((notification) => notification.dedupeKey === create.dedupeKey);
      if (existing) return existing;
      const notification = { id: notifications.length + 1, ...create };
      notifications.push(notification);
      return notification;
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
    notifications,
    setStoredImageCount: (count: number) => { storedImageCount = count; },
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
  assert.equal(fake.notifications.length, 1);
  assert.equal(fake.notifications[0]?.kind, "NEW_INQUIRY");
  assert.ok(!String(fake.notifications[0]?.text).includes(String(fake.messages[0]?.body)));
  assert.equal(fake.messages[0]?.body, "テスト相談");
  assert.equal(fake.inbox.status, "PROCESSED");
  assert.ok(fake.inbox.processedAt instanceof Date);
});

test("a resolved LINE profile name is saved and used for an unregistered notification", async () => {
  const fake = createFakeDb();

  await processLineWebhookInboxItem(fake.db, 1, {
    resolveDisplayName: async () => "LINE Display Name",
  });

  assert.equal(fake.users[0]?.displayName, "LINE Display Name");
  assert.ok(String(fake.notifications[0]?.text).includes("LINE Display Name（未登録）からお問い合わせが来ています。"));
  assert.ok(!String(fake.notifications[0]?.text).includes(String(fake.messages[0]?.body)));
});

test("a failed LINE profile lookup does not fail inbox processing and uses the safe fallback", async () => {
  const fake = createFakeDb();

  const result = await processLineWebhookInboxItem(fake.db, 1, {
    resolveDisplayName: async () => { throw new Error("profile unavailable"); },
  });

  assert.equal(result, "processed");
  assert.ok(String(fake.notifications[0]?.text).includes("LINE表示名未取得（未登録）からお問い合わせが来ています。"));
});

test("a linked Customer name is used for the notification identity", async () => {
  const fake = createFakeDb();
  (fake.db as any).inquiry.findUnique = async () => ({
    id: 1,
    status: "OPEN",
    lineUser: {
      displayName: "Ignored LINE name",
      linkedCustomer: { name: "Official Customer Name" },
    },
  });

  await processLineWebhookInboxItem(fake.db, 1);

  assert.ok(String(fake.notifications[0]?.text).includes("Official Customer Nameさま（既存）からお問い合わせが来ています。"));
});

test("image inbox creates IMAGE message and calls the image handler", async () => {
  const fake = createFakeDb();
  (fake.db as any).inquiry.findMany = async () => [{ id: 1 }];
  fake.messages.push({ id: 99, inquiryId: 1, direction: "INBOUND" });
  (fake.inbox.rawEvent as any).message = { id: "M-image", type: "image" };
  const imageCalls: Array<Record<string, unknown>> = [];

  const result = await processLineWebhookInboxItem(fake.db, 1, {
    handleImage: async (input) => {
      imageCalls.push(input);
      fake.setStoredImageCount(1);
    },
  });

  assert.equal(result, "processed");
  assert.equal(fake.messages.length, 2);
  assert.equal(fake.messages[1]?.externalMessageId, "M-image");
  assert.equal(fake.messages[1]?.messageType, "IMAGE");
  assert.equal(fake.notifications[0]?.kind, "IMAGE_ADDED");
  assert.ok(String(fake.notifications[0]?.text).includes("Stored images: 1"));
  assert.equal(fake.messages[1]?.body, null);
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

test("a replayed external message does not enqueue another notification", async () => {
  const fake = createFakeDb();
  await processLineWebhookInboxItem(fake.db, 1);
  (fake.inbox as any).status = "PROCESSING";
  (fake.db as any).inquiryMessage.findUnique = async () => ({ id: 1, inquiryId: 1 });

  await processLineWebhookInboxItem(fake.db, 1);

  assert.equal(fake.notifications.length, 1);
});

test("a failed image handler creates no repair-inbox notification, then a successful retry ensures one", async () => {
  const fake = createFakeDb();
  (fake.db as any).inquiry.findMany = async () => [{ id: 1 }];
  (fake.inbox.rawEvent as any).message = { id: "M-image", type: "image" };

  await assert.rejects(
    () => processLineWebhookInboxItem(fake.db, 1, { handleImage: async () => { throw new Error("R2 failed"); } }),
  );
  assert.equal(fake.notifications.filter((item) => item.target === "REPAIR_INBOX").length, 0);

  (fake.inbox as any).status = "PROCESSING";
  (fake.db as any).inquiryMessage.findUnique = async () => ({ id: 1, inquiryId: 1 });
  await processLineWebhookInboxItem(fake.db, 1, {
    handleImage: async () => { fake.setStoredImageCount(1); },
  });

  const inboxNotifications = fake.notifications.filter((item) => item.target === "REPAIR_INBOX");
  assert.equal(inboxNotifications.length, 1);
  assert.equal(inboxNotifications[0]?.kind, "NEW_INQUIRY");
  assert.ok(String(inboxNotifications[0]?.text).includes("Stored images: 1"));
});

test("multiple OPEN inquiries route the message to NEEDS_REVIEW notification", async () => {
  const fake = createFakeDb();
  let update: any;
  (fake.db as any).inquiry.findMany = async () => [{ id: 1 }, { id: 2 }];
  (fake.db as any).inquiry.findFirst = async () => ({ id: 3, status: "NEEDS_REVIEW" });
  (fake.db as any).inquiry.update = async (input: any) => { update = input; return { id: 3, status: "NEEDS_REVIEW" }; };
  (fake.db as any).inquiry.findUnique = async () => ({
    id: 3,
    status: "NEEDS_REVIEW",
    lineUser: { displayName: null, linkedCustomer: null },
  });

  await processLineWebhookInboxItem(fake.db, 1);

  assert.equal(fake.notifications[0]?.kind, "NEEDS_REVIEW");
  assert.equal(update.where.id, 3);
  assert.ok(update.data.lastReceivedAt instanceof Date);
  assert.equal("status" in update.data, false);
});

test("AI_PROCESSED Inquiry is reused and returned to AI_PENDING for a new inbound message", async () => {
  const fake = createFakeDb();
  let update: any;
  (fake.db as any).inquiry.findMany = async () => [{ id: 8, status: "AI_PROCESSED" }];
  (fake.db as any).inquiry.update = async (input: any) => { update = input; return { id: 8, ...input.data }; };
  (fake.db as any).inquiry.findUnique = async () => ({ id: 8, status: "AI_PENDING", lineUser: { displayName: null, linkedCustomer: null } });

  await processLineWebhookInboxItem(fake.db, 1);

  assert.equal(fake.inquiries.length, 0);
  assert.equal(fake.messages[0]?.inquiryId, 8);
  assert.equal(update.data.status, "AI_PENDING");
});

test("CLOSED Inquiry is not reused", async () => {
  const fake = createFakeDb();
  (fake.db as any).inquiry.findMany = async () => [];

  await processLineWebhookInboxItem(fake.db, 1);

  assert.equal(fake.inquiries.length, 1);
  assert.equal(fake.inquiries[0]?.status, "OPEN");
});

test("a single NEEDS_REVIEW Inquiry is reused without changing its review state", async () => {
  const fake = createFakeDb();
  let update: any;
  (fake.db as any).inquiry.findMany = async () => [{ id: 8, status: "NEEDS_REVIEW" }];
  (fake.db as any).inquiry.update = async (input: any) => { update = input; return { id: 8, ...input.data, status: "NEEDS_REVIEW" }; };
  (fake.db as any).inquiry.findUnique = async () => ({ id: 8, status: "NEEDS_REVIEW", lineUser: { displayName: null, linkedCustomer: null } });

  await processLineWebhookInboxItem(fake.db, 1);

  assert.equal(fake.messages[0]?.inquiryId, 8);
  assert.equal("status" in update.data, false);
  assert.equal(fake.notifications[0]?.kind, "NEEDS_REVIEW");
});

test("final Inbox processing failure enqueues one repair-errors notification", async () => {
  const fake = createFakeDb();
  (fake.inbox as any).rawEvent.message = { id: "M-image", type: "image" };
  (fake.inbox as any).attemptCount = 5;

  await assert.rejects(() => processLineWebhookInboxItem(fake.db, 1));
  (fake.inbox as any).status = "PROCESSING";
  await assert.rejects(() => processLineWebhookInboxItem(fake.db, 1));

  assert.equal(fake.notifications.filter((item) => item.kind === "INBOX_PROCESSING_FAILED").length, 1);
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
