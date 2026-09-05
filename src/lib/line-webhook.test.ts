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
  let writes = 0;

  const db = {
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
      },
    },
  } as unknown as LineWebhookDb;

  return { db, records, writes: () => writes };
}

test("valid follow stores a single LINE user with profile and Customer match", async () => {
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
    fetcher: async () => Response.json({ displayName: "LINE Display Name" }),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(fake.records.get("U-follow"), {
    lineUserId: "U-follow",
    firstReceivedAt: now,
    lastReceivedAt: now,
    lastEventType: "follow",
    linkedCustomerId: 42,
    linkedAt: now,
    displayName: "LINE Display Name",
  });
});

test("message updates the same user and profile failure retains userId", async () => {
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
