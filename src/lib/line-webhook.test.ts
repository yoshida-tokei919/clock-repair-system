import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { LineWebhookDb } from "./line-webhook";
import { processVerifiedLineWebhook } from "./line-webhook";

function signedBody(body: string, secret = "test-channel-secret") {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

function createFakeDb() {
  const records: Array<Record<string, unknown>> = [];
  const webhookEventIds = new Set<string>();
  let createManyCalls = 0;

  const db = {
    lineWebhookInbox: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Array<Record<string, unknown>>;
        skipDuplicates?: boolean;
      }) => {
        createManyCalls += 1;
        let count = 0;
        for (const record of data) {
          const webhookEventId = record.webhookEventId as string;
          if (webhookEventIds.has(webhookEventId)) {
            if (skipDuplicates) continue;
            throw new Error("duplicate webhook event");
          }
          webhookEventIds.add(webhookEventId);
          records.push(record);
          count += 1;
        }
        return { count };
      },
    },
  } as unknown as LineWebhookDb;

  return { db, records, createManyCalls: () => createManyCalls };
}

test("valid message stores only a RECEIVED inbox event", async () => {
  const event = {
    type: "message",
    webhookEventId: "event-message-1",
    source: { userId: "U-message" },
    message: { id: "message-1", type: "text", text: "時計を修理したい" },
  };
  const body = JSON.stringify({ events: [event] });
  const fake = createFakeDb();
  const now = new Date("2026-09-18T00:00:00.000Z");

  const result = await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    db: fake.db,
    now: () => now,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(fake.records, [{
    webhookEventId: "event-message-1",
    eventType: "message",
    rawEvent: event,
    receivedAt: now,
    status: "RECEIVED",
  }]);
});

test("multiple supported events are stored in one createMany call", async () => {
  const events = [
    { type: "follow", webhookEventId: "event-follow-1", source: { userId: "U-follow" } },
    { type: "postback", webhookEventId: "event-postback-1", postback: { data: "action=select" } },
  ];
  const body = JSON.stringify({ events });
  const fake = createFakeDb();

  const result = await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    db: fake.db,
  });

  assert.equal(result.status, 200);
  assert.equal(fake.createManyCalls(), 1);
  assert.deepEqual(fake.records.map((record) => record.webhookEventId), [
    "event-follow-1",
    "event-postback-1",
  ]);
});

test("duplicate webhookEventId is skipped and remains successful", async () => {
  const body = JSON.stringify({ events: [{
    type: "message",
    webhookEventId: "event-duplicate-1",
    message: { id: "message-duplicate-1", type: "text", text: "duplicate" },
  }] });
  const fake = createFakeDb();
  const input = {
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    db: fake.db,
  };

  assert.equal((await processVerifiedLineWebhook(input)).status, 200);
  assert.equal((await processVerifiedLineWebhook(input)).status, 200);
  assert.equal(fake.records.length, 1);
});

test("events without a supported type or webhookEventId are skipped", async () => {
  const body = JSON.stringify({ events: [
    null,
    "not-an-event",
    { type: "message", message: { id: "missing-event-id" } },
    { type: "unsend", webhookEventId: "event-unsupported" },
  ] });
  const fake = createFakeDb();

  const result = await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: "test-channel-secret",
    db: fake.db,
  });

  assert.equal(result.status, 200);
  assert.equal(fake.records.length, 0);
  assert.equal(fake.createManyCalls(), 0);
});

test("invalid signature, malformed JSON, or absent secret create no inbox records", async () => {
  const body = JSON.stringify({ events: [{ type: "follow", webhookEventId: "event-no-write" }] });
  const fake = createFakeDb();

  assert.equal((await processVerifiedLineWebhook({
    rawBody: body,
    signature: "invalid",
    channelSecret: "test-channel-secret",
    db: fake.db,
  })).status, 401);
  assert.equal((await processVerifiedLineWebhook({
    rawBody: "{",
    signature: signedBody("{"),
    channelSecret: "test-channel-secret",
    db: fake.db,
  })).status, 400);
  assert.equal((await processVerifiedLineWebhook({
    rawBody: body,
    signature: signedBody(body),
    channelSecret: undefined,
    db: fake.db,
  })).status, 503);
  assert.equal(fake.records.length, 0);
});
