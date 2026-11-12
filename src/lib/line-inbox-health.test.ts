import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLineInboxHealth, type LineInboxHealthDb } from "./line-inbox-health";

const now = new Date("2026-11-12T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

function fakeDb(input: {
  inbox?: Array<Record<string, any>>;
  messages?: Array<Record<string, any>>;
  files?: Array<Record<string, any>>;
  fail?: boolean;
} = {}) {
  const alerts = new Map<string, Record<string, any>>();
  const inbox = input.inbox ?? [];
  const db = {
    lineWebhookInbox: { findFirst: async () => ({ id: Math.max(0, ...inbox.map((row) => row.id)) }), findMany: async ({ where, take }: any) => {
      if (input.fail) throw new Error("secret error payload");
      const rows = inbox.filter((row) => where.status === "PROCESSED"
        ? row.id > where.id.gt && row.id <= where.id.lte && row.status === "PROCESSED" && row.eventType === "message" &&
          (row.processedAt ? row.processedAt <= where.OR[0].processedAt.lte : row.updatedAt <= where.OR[1].updatedAt.lte)
        : row.id > where.id.gt && row.id <= where.id.lte && (
          (row.status === "PROCESSING" && (row.lastAttemptAt
            ? row.lastAttemptAt <= where.OR[1].OR[0].lastAttemptAt.lte
            : row.receivedAt <= where.OR[1].OR[1].receivedAt.lte)) ||
          (["RECEIVED", "FAILED"].includes(row.status) && row.attemptCount < where.OR[0].attemptCount.lt && row.receivedAt <= where.OR[0].receivedAt.lte &&
            (!row.lastAttemptAt || row.lastAttemptAt <= where.OR[0].OR[1].lastAttemptAt.lte))));
      return rows.sort((a, b) => a.id - b.id).slice(0, take);
    } },
    inquiryMessage: { findMany: async ({ where }: any) => (input.messages ?? []).filter(
      (row) => where.externalMessageId.in.includes(row.externalMessageId) && row.direction === "INBOUND") },
    inquiryFile: { findMany: async ({ where }: any) => (input.files ?? []).filter(
      (row) => where.providerFileId.in.includes(row.providerFileId) && row.provider === "LINE") },
    slackNotificationOutbox: { createMany: async ({ data }: any) => {
      for (const row of data) alerts.set(row.dedupeKey, row);
    } },
  };
  return { db: db as unknown as LineInboxHealthDb, alerts };
}

const event = (id: unknown, type: string, userId: unknown = "private-user") =>
  ({ message: { id, type }, source: { userId } });
const processed = (id: number, rawEvent: unknown, age = 2) =>
  ({ id, status: "PROCESSED", eventType: "message", processedAt: minutesAgo(age), rawEvent, attemptCount: 1 });

test("stale thresholds, exhausted attempts, and idempotent dedupe", async () => {
  const { db, alerts } = fakeDb({ inbox: [
    { id: 1, status: "RECEIVED", receivedAt: minutesAgo(5), lastAttemptAt: null, attemptCount: 0 },
    { id: 2, status: "FAILED", receivedAt: minutesAgo(20), lastAttemptAt: minutesAgo(4), attemptCount: 2 },
    { id: 3, status: "PROCESSING", lastAttemptAt: minutesAgo(15), attemptCount: 1 },
    { id: 4, status: "PROCESSING", lastAttemptAt: minutesAgo(14), attemptCount: 1 },
    { id: 5, status: "FAILED", receivedAt: minutesAgo(30), lastAttemptAt: minutesAgo(20), attemptCount: 5 },
    { id: 6, status: "PROCESSING", receivedAt: minutesAgo(15), lastAttemptAt: null, attemptCount: 1 },
    { id: 7, status: "PROCESSING", receivedAt: minutesAgo(30), lastAttemptAt: minutesAgo(15), attemptCount: 5 },
  ] });
  await checkLineInboxHealth(db, now);
  await checkLineInboxHealth(db, now);
  assert.deepEqual([...alerts.keys()], ["line-inbox-health:1:stale-waiting", "line-inbox-health:3:stale-processing", "line-inbox-health:6:stale-processing", "line-inbox-health:7:stale-processing"]);
});

test("rotating stale scan reaches rows after the first 200 IDs", async () => {
  const selected = Math.floor(now.getTime() / 60_000) % 2 === 1 ? now : new Date(now.getTime() + 60_000);
  const inbox = Array.from({ length: 201 }, (_, i) => ({
    id: i + 1, status: "RECEIVED", receivedAt: minutesAgo(20), lastAttemptAt: null, attemptCount: 0,
  }));
  const { db, alerts } = fakeDb({ inbox });
  const result = await checkLineInboxHealth(db, selected);
  assert.equal(result.status, "incomplete");
  assert.deepEqual([...alerts.keys()], ["line-inbox-health:201:stale-waiting"]);
});

test("processed exact inbound identity and stored linked image", async () => {
  const { db, alerts } = fakeDb({
    inbox: [processed(1, event("text-ok", "text")), processed(2, event("text-missing", "text")),
      processed(3, event("image-bad", "image")), processed(4, event("image-ok", "image")),
      processed(5, event("too-new", "text"), 1), processed(6, event("other", "sticker")),
      processed(7, event(null, "text")), processed(8, event("no-source", "image", null)),
      { ...processed(9, event("null-timestamp", "text")), processedAt: null, updatedAt: minutesAgo(2) },
      processed(10, event("image-no-message", "image"))],
    messages: [
      { id: 11, externalMessageId: "text-ok", direction: "INBOUND", messageType: "TEXT" },
      { id: 12, externalMessageId: "text-missing", direction: "OUTBOUND", messageType: "TEXT" },
      { id: 13, externalMessageId: "image-bad", direction: "INBOUND", messageType: "IMAGE" },
      { id: 14, externalMessageId: "image-ok", direction: "INBOUND", messageType: "IMAGE" },
    ],
    files: [
      { provider: "LINE", providerFileId: "image-bad", inquiryMessageId: 13, uploadStatus: "FAILED" },
      { provider: "LINE", providerFileId: "image-ok", inquiryMessageId: 14, uploadStatus: "STORED" },
    ],
  });
  const result = await checkLineInboxHealth(db, now);
  assert.equal(result.status, "alert");
  assert.deepEqual([...alerts.keys()], [
    "line-inbox-health:2:missing-inbound-message", "line-inbox-health:3:missing-stored-image",
    "line-inbox-health:7:invalid-identity", "line-inbox-health:8:invalid-identity",
    "line-inbox-health:9:missing-inbound-message",
    "line-inbox-health:10:missing-inbound-message",
  ]);
  assert.ok([...alerts.values()].every((row) => !row.text.includes("private-user") && !row.text.includes("image-bad")));
});

test("all good, incomplete scan, and lookup failure", async () => {
  const good = fakeDb({ inbox: [processed(1, event("ok", "text"))],
    messages: [{ id: 1, externalMessageId: "ok", direction: "INBOUND", messageType: "TEXT" }] });
  assert.equal((await checkLineInboxHealth(good.db, now)).status, "clear");
  const capped = fakeDb({ inbox: Array.from({ length: 201 }, (_, i) => processed(i + 1, event(`id-${i}`, "sticker"))) });
  assert.equal((await checkLineInboxHealth(capped.db, now)).status, "incomplete");
  await assert.rejects(checkLineInboxHealth(fakeDb({ fail: true }).db, now), /secret error payload/);
});
