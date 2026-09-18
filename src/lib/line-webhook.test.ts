import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { LineWebhookDb } from "./line-webhook";
import { processVerifiedLineWebhook } from "./line-webhook";

function signedBody(body: string, secret = "test-channel-secret") {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

function createFakeDb(customerIds: number[] = []) {
  const records = new Map<string, Record<string, unknown>>();
  const inquiries: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [];
  const operations: string[] = [];
  const advisoryLockSql: string[] = [];
  let writes = 0;
  let nextInquiryId = 1;

  const db = {
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(db),
    $executeRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      advisoryLockSql.push(_strings.join("?"));
      operations.push(`advisory-lock:${values.join(":")}`);
    },
    customer: {
      findMany: async () => customerIds.map((id) => ({ id })),
    },
    lineUser: {
      findUnique: async ({ where }: { where: { lineUserId: string } }) => {
        const record = records.get(where.lineUserId);
        return record
          ? {
              linkedCustomerId: record.linkedCustomerId as number | null,
              linkedAt: record.linkedAt as Date | null,
            }
          : null;
      },
      upsert: async (args: {
        where: { lineUserId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        writes += 1;
        const prior = records.get(args.where.lineUserId);
        records.set(args.where.lineUserId, prior ? { ...prior, ...args.update } : args.create);
        return { id: Array.from(records.keys()).indexOf(args.where.lineUserId) + 1 };
      },
    },
    inquiry: {
      findMany: async ({ where }: { where: { lineUserId: number; status: string } }) => {
        operations.push(`inquiry:findMany:${where.status}`);
        return inquiries
          .filter((inquiry) => inquiry.lineUserId === where.lineUserId && inquiry.status === where.status)
          .map((inquiry) => ({ id: inquiry.id }));
      },
      findFirst: async ({ where }: { where: { lineUserId: number; status: string } }) => {
        operations.push(`inquiry:findFirst:${where.status}`);
        const inquiry = inquiries.find(
          (candidate) => candidate.lineUserId === where.lineUserId && candidate.status === where.status,
        );
        return inquiry ? { id: inquiry.id } : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const inquiry = { id: nextInquiryId++, ...data };
        inquiries.push(inquiry);
        return { id: inquiry.id };
      },
    },
    inquiryMessage: {
      findUnique: async ({ where }: { where: { externalMessageId: string } }) => {
        operations.push("inquiryMessage:findUnique");
        const message = messages.find(
          (candidate) => candidate.externalMessageId === where.externalMessageId,
        );
        return message ? { id: message.id } : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const message = { id: messages.length + 1, ...data };
        messages.push(message);
        return message;
      },
    },
  } as unknown as LineWebhookDb;

  return { db, records, inquiries, messages, operations, advisoryLockSql, writes: () => writes };
}

test("valid follow stores a single LINE user without a profile lookup and with a Customer match", async () => {
  const body = JSON.stringify({ events: [{ type: "follow", source: { userId: "U-follow" } }] });
  const fake = createFakeDb([42]);
  const now = new Date("2026-09-05T00:00:00.000Z");

  const result = await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    channelAccessToken: "token-is-not-logged",
    db: fake.db,
    now: () => now,
    fetcher: async () => assert.fail("webhook hot path must not call the LINE profile API"),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(fake.records.get("U-follow"), {
    lineUserId: "U-follow",
    firstReceivedAt: now,
    lastReceivedAt: now,
    lastEventType: "follow",
    linkedCustomerId: 42,
    linkedAt: now,
  });
});

test("message updates the same user without a profile lookup", async () => {
  const fake = createFakeDb();
  const firstBody = JSON.stringify({ events: [{ type: "follow", source: { userId: "U-repeat" } }] });
  const secondBody = JSON.stringify({ events: [{ type: "message", source: { userId: "U-repeat" } }] });

  await processVerifiedLineWebhook({
    rawBody: firstBody,
    signature: signedBody(firstBody),
    channelSecret: "test-channel-secret",
    channelAccessToken: "token",
    db: fake.db,
    now: () => new Date("2026-09-05T00:00:00.000Z"),
    fetcher: async () => new Response("unavailable", { status: 503 }),
  });
  await processVerifiedLineWebhook({
    rawBody: secondBody,
    signature: signedBody(secondBody),
    channelSecret: "test-channel-secret",
    channelAccessToken: "token",
    db: fake.db,
    now: () => new Date("2026-09-05T00:01:00.000Z"),
    fetcher: async () => new Response("unavailable", { status: 503 }),
  });

  assert.equal(fake.records.size, 1);
  assert.equal(fake.writes(), 2);
  assert.equal(fake.records.get("U-repeat")?.lastEventType, "message");
  assert.equal(fake.records.get("U-repeat")?.displayName, undefined);
});

test("webhook with a null displayName retains an existing displayName", async () => {
  const fake = createFakeDb();
  fake.records.set("U-existing-display-name", {
    lineUserId: "U-existing-display-name",
    displayName: "Existing Display Name",
    linkedCustomerId: null,
    linkedAt: null,
  });
  const body = JSON.stringify({ events: [{
    type: "message",
    source: { userId: "U-existing-display-name" },
    message: { id: "line-message-existing-display-name", type: "text", text: "message" },
  }] });

  await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    channelAccessToken: "token",
    db: fake.db,
    fetcher: async () => assert.fail("webhook hot path must not call the LINE profile API"),
  });

  assert.equal(fake.records.get("U-existing-display-name")?.displayName, "Existing Display Name");
});

test("text message creates an OPEN Inquiry and inbound InquiryMessage", async () => {
  const fake = createFakeDb();
  const body = JSON.stringify({
    events: [{
      type: "message",
      timestamp: 1_788_688_400_000,
      source: { userId: "U-text" },
      message: { id: "line-message-1", type: "text", text: "時計を修理したいです" },
    }],
  });

  const result = await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    channelAccessToken: undefined,
    db: fake.db,
    now: () => new Date("2026-09-05T00:00:00.000Z"),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(fake.inquiries, [{
    id: 1,
    lineUserId: 1,
    status: "OPEN",
    firstReceivedAt: new Date(1_788_688_400_000),
    lastReceivedAt: new Date(1_788_688_400_000),
  }]);
  assert.deepEqual(fake.messages, [{
    id: 1,
    inquiryId: 1,
    lineUserId: 1,
    externalMessageId: "line-message-1",
    direction: "INBOUND",
    messageType: "TEXT",
    body: "時計を修理したいです",
    receivedAt: new Date(1_788_688_400_000),
  }]);
});

test("text message reuses exactly one OPEN Inquiry", async () => {
  const fake = createFakeDb();
  fake.inquiries.push({ id: 7, lineUserId: 1, status: "OPEN" });
  const body = JSON.stringify({
    events: [{
      type: "message",
      source: { userId: "U-open" },
      message: { id: "line-message-open", type: "text", text: "追加の内容です" },
    }],
  });

  await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    channelAccessToken: undefined,
    db: fake.db,
    now: () => new Date("2026-09-05T00:00:00.000Z"),
  });

  assert.equal(fake.inquiries.length, 1);
  assert.equal(fake.messages[0]?.inquiryId, 7);
});

test("duplicate message is successful without creating another Inquiry or message", async () => {
  const fake = createFakeDb();
  const body = JSON.stringify({
    events: [{
      type: "message",
      source: { userId: "U-duplicate" },
      message: { id: "line-message-duplicate", type: "text", text: "重複です" },
    }],
  });
  const input = {
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    channelAccessToken: undefined,
    db: fake.db,
    now: () => new Date("2026-09-05T00:00:00.000Z"),
  };

  await processVerifiedLineWebhook(input);
  await processVerifiedLineWebhook(input);

  assert.equal(fake.inquiries.length, 1);
  assert.equal(fake.messages.length, 1);
});

test("follow and non-text messages retain LineUser without creating InquiryMessage", async () => {
  const fake = createFakeDb();
  const body = JSON.stringify({ events: [
    { type: "follow", source: { userId: "U-non-text" } },
    {
      type: "message",
      source: { userId: "U-non-text" },
      message: { id: "line-image-1", type: "image" },
    },
  ] });

  await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    channelAccessToken: undefined,
    db: fake.db,
  });

  assert.equal(fake.records.size, 1);
  assert.equal(fake.messages.length, 0);
});

test("multiple OPEN Inquiries create one NEEDS_REVIEW instead of selecting an OPEN Inquiry", async () => {
  const fake = createFakeDb();
  fake.inquiries.push(
    { id: 3, lineUserId: 1, status: "OPEN" },
    { id: 4, lineUserId: 1, status: "OPEN" },
  );
  const body = JSON.stringify({
    events: [{
      type: "message",
      source: { userId: "U-many-open" },
      message: { id: "line-message-many", type: "text", text: "相談です" },
    }],
  });

  await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    channelAccessToken: undefined,
    db: fake.db,
    now: () => new Date("2026-09-05T00:00:00.000Z"),
  });

  assert.equal(fake.inquiries[2]?.status, "NEEDS_REVIEW");
  assert.equal(fake.messages[0]?.inquiryId, fake.inquiries[2]?.id);
});

test("multiple OPEN Inquiries reuse the existing NEEDS_REVIEW Inquiry", async () => {
  const fake = createFakeDb();
  fake.inquiries.push(
    { id: 3, lineUserId: 1, status: "OPEN" },
    { id: 4, lineUserId: 1, status: "OPEN" },
    { id: 5, lineUserId: 1, status: "NEEDS_REVIEW" },
  );
  const body = JSON.stringify({
    events: [{
      type: "message",
      source: { userId: "U-reuse-needs-review" },
      message: { id: "line-message-reuse", type: "text", text: "確認をお願いします" },
    }],
  });

  await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    channelAccessToken: undefined,
    db: fake.db,
  });

  assert.equal(fake.inquiries.length, 3);
  assert.equal(fake.messages[0]?.inquiryId, 5);
});

test("multiple text messages with multiple OPEN Inquiries create only one NEEDS_REVIEW", async () => {
  const fake = createFakeDb();
  fake.inquiries.push(
    { id: 3, lineUserId: 1, status: "OPEN" },
    { id: 4, lineUserId: 1, status: "OPEN" },
  );
  const makeBody = (id: string) => JSON.stringify({
    events: [{
      type: "message",
      source: { userId: "U-no-needs-growth" },
      message: { id, type: "text", text: "続けて相談します" },
    }],
  });

  for (const id of ["line-message-a", "line-message-b"]) {
    const body = makeBody(id);
    await processVerifiedLineWebhook({
      rawBody: body,
      signature: signedBody(body),
      channelSecret: "test-channel-secret",
      channelAccessToken: undefined,
      db: fake.db,
    });
  }

  assert.equal(fake.inquiries.filter((inquiry) => inquiry.status === "NEEDS_REVIEW").length, 1);
  assert.equal(fake.messages.length, 2);
  assert.equal(fake.messages[0]?.inquiryId, fake.messages[1]?.inquiryId);
});

test("acquires the LineUser advisory lock before checking messages or Inquiries", async () => {
  const fake = createFakeDb();
  const body = JSON.stringify({
    events: [{
      type: "message",
      source: { userId: "U-lock-order" },
      message: { id: "line-message-lock", type: "text", text: "ロック確認" },
    }],
  });

  await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    channelAccessToken: undefined,
    db: fake.db,
  });

  assert.deepEqual(fake.operations.slice(0, 3), [
    "advisory-lock:726001:1",
    "inquiryMessage:findUnique",
    "inquiry:findMany:OPEN",
  ]);
  assert.match(
    fake.advisoryLockSql[0] ?? "",
    /pg_advisory_xact_lock\(\s*\?::int,\s*\?::int\s*\)/,
  );
});

test("invalid signature or absent secret causes no database write", async () => {
  const body = JSON.stringify({ events: [{ type: "follow", source: { userId: "U-no-write" } }] });
  const fake = createFakeDb();

  const invalid = await processVerifiedLineWebhook({
    rawBody: body,
    signature: "invalid",
    channelSecret: "test-channel-secret",
    channelAccessToken: "token",
    db: fake.db,
  });
  const missingSecret = await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: undefined,
    channelAccessToken: "token",
    db: fake.db,
  });

  assert.equal(invalid.status, 401);
  assert.equal(missingSecret.status, 503);
  assert.equal(fake.writes(), 0);
});
