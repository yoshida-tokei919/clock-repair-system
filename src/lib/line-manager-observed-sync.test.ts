import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { importObservedBatch, listObservedMappings, parseObservedBatch, verifyObservedSignature } from "./line-manager-observed-sync";

const now = new Date("2026-10-24T00:00:00.000Z");
const event = { messageId: "message", chatId: "chat", text: "hello", timestamp: "2026-10-23T23:00:00.000Z", verifiedAt: now.toISOString(), sendId: null };
const batch = { mappingId: 1, managerBotId: "bot", managerChatId: "chat", events: [event] };
const mapping = { id: 1, lineUserId: 2, managerBotId: "bot", managerChatId: "chat", evidenceInquiryMessageId: 3, evidenceManagerMessageId: "inbound",
  lineUser: { linkedCustomerId: 4 }, evidenceMessage: { id: 3, direction: "INBOUND", lineUserId: 2, externalMessageId: "inbound", inquiry: { lineUserId: 2 } } };

test("signature requires configured key, current timestamp and exact raw body", () => {
  const raw = Buffer.from(JSON.stringify(batch));
  const timestamp = String(now.getTime() / 1000);
  const key = "ab".repeat(32); // test fixture only; deployment key must be generated independently
  const signature = createHmac("sha256", Buffer.from(key, "hex")).update(timestamp).update(".").update(raw).digest("hex");
  assert.equal(verifyObservedSignature(raw, timestamp, signature, key, now.getTime()), true);
  assert.equal(verifyObservedSignature(raw, timestamp, signature, undefined, now.getTime()), false);
  assert.equal(verifyObservedSignature(raw, timestamp, signature, "weak", now.getTime()), false);
  assert.equal(verifyObservedSignature(raw, timestamp, signature, key.toUpperCase(), now.getTime()), false);
  assert.equal(verifyObservedSignature(Buffer.from(" ".concat(raw.toString())), timestamp, signature, key, now.getTime()), false);
  assert.equal(verifyObservedSignature(raw, timestamp, signature, key, now.getTime() + 120_001), false);
});

test("parser bounds, strict timestamp, and duplicate IDs", () => {
  assert.equal(parseObservedBatch(batch, now.getTime()).events.length, 1);
  assert.throws(() => parseObservedBatch({ ...batch, events: [event, event] }, now.getTime()));
  assert.throws(() => parseObservedBatch({ ...batch, events: [] }, now.getTime()));
  assert.throws(() => parseObservedBatch({ ...batch, unexpected: true }, now.getTime()));
  assert.throws(() => parseObservedBatch({ ...batch, events: [{ ...event, unexpected: true }] }, now.getTime()));
  assert.throws(() => parseObservedBatch({ ...batch, events: [{ ...event, timestamp: "1999-01-01T00:00:00.000Z" }] }, now.getTime()));
  assert.throws(() => parseObservedBatch({ ...batch, events: [{ ...event, timestamp: "2026-10-23T23:00:00Z" }] }, now.getTime()));
  assert.throws(() => parseObservedBatch({ ...batch, events: [{ ...event, chatId: "other" }] }, now.getTime()));
});

test("mapping list validates immutable inbound evidence and linked customer", async () => {
  const db = { lineManagerChat: { findMany: async () => [mapping] } };
  assert.equal((await listObservedMappings(db as never, 0)).items.length, 1);
  await assert.rejects(listObservedMappings({ lineManagerChat: { findMany: async () => [{ ...mapping, lineUser: { linkedCustomerId: null } }] } } as never, 0));
});

function fakeDb(options: { unresolved?: boolean; prior?: object; source?: object; outboxes?: object[]; mapped?: object } = {}) {
  const writes: object[] = [];
  const tx = {
    $executeRaw: async () => undefined,
    lineManagerChat: { findUnique: async () => options.mapped ?? mapping },
    lineManagerSendOutbox: { findFirst: async () => options.unresolved ? { id: 8 } : null, findMany: async () => options.outboxes ?? [] },
    inquiryMessage: { findUnique: async () => options.source ?? null },
    lineManagerObservedOutbound: { findUnique: async () => options.prior ?? null, create: async (value: object) => { writes.push(value); } },
  };
  return { db: { $transaction: async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx) }, writes };
}

test("unresolved outbox defers without writing", async () => {
  const { db, writes } = fakeDb({ unresolved: true });
  assert.deepEqual(await importObservedBatch(db as never, batch, now), { imported: 0, existing: 0, deferred: 1 });
  assert.equal(writes.length, 0);
});

test("new observation writes only observed table and replay is unchanged", async () => {
  const first = fakeDb();
  assert.equal((await importObservedBatch(first.db as never, batch, now)).imported, 1);
  const created = (first.writes[0] as { data: object }).data;
  const second = fakeDb({ prior: { ...created, sentAt: new Date(event.timestamp) } });
  assert.equal((await importObservedBatch(second.db as never, batch, now)).existing, 1);
  assert.equal(second.writes.length, 0);
  await assert.rejects(importObservedBatch(fakeDb({ prior: { ...created, body: "different", sentAt: new Date(event.timestamp) } }).db as never, batch, now));
});

test("conflicting source and broken mapping reject", async () => {
  await assert.rejects(importObservedBatch(fakeDb({ source: { lineUserId: 2, direction: "OUTBOUND", messageType: "TEXT", body: "wrong", sentAt: new Date(event.timestamp) } }).db as never, batch, now));
  await assert.rejects(importObservedBatch(fakeDb({ mapped: { ...mapping, evidenceManagerMessageId: "wrong" } }).db as never, batch, now));
});
