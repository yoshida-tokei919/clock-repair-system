import { test } from "node:test";
import assert from "node:assert/strict";
import { compareInboundAudit, parseInboundAuditBatch } from "./line-manager-inbound-audit";

const now = Date.UTC(2026, 10, 13);
const event = { messageId: "image-1", type: "image", timestamp: now - 300_000 };
const batch = { mappingId: 1, managerBotId: "bot", managerChatId: "chat", events: [event] };
const mapping = { id: 1, lineUserId: 2, managerBotId: "bot", managerChatId: "chat", evidenceInquiryMessageId: 3, evidenceManagerMessageId: "proof",
  lineUser: { linkedCustomerId: 4 }, evidenceMessage: { id: 3, direction: "INBOUND", lineUserId: 2, externalMessageId: "proof", inquiry: { lineUserId: 2 } } };
const message = { id: 5, inquiryId: 6, externalMessageId: "image-1", lineUserId: 2, direction: "INBOUND", messageType: "IMAGE", inquiry: { lineUserId: 2 } };
const file = { inquiryMessageId: 5, inquiryId: 6, provider: "LINE", providerFileId: "image-1", uploadStatus: "STORED" };

function fakeDb(changes: { mapping?: unknown; messages?: unknown[]; files?: unknown[] } = {}) {
  const calls: string[] = [];
  const fileQueries: unknown[] = [];
  const db = { lineManagerChat: { findUnique: async () => { calls.push("mapping"); return changes.mapping === undefined ? mapping : changes.mapping; } },
    inquiryMessage: { findMany: async () => { calls.push("messages"); return changes.messages ?? [message]; } },
    inquiryFile: { findMany: async (query: unknown) => { calls.push("files"); fileQueries.push(query); return changes.files ?? [file]; } } };
  return { db, calls, fileQueries };
}

test("strict bounded payload and five minute grace", () => {
  assert.equal(parseInboundAuditBatch(batch, now).events.length, 1);
  for (const value of [{ ...batch, events: [event, event] }, { ...batch, events: [{ ...event, timestamp: now - 299_999 }] },
    { ...batch, events: [{ ...event, timestamp: "2026-11-13" }] }, { ...batch, events: [{ ...event, type: "file" }] },
    { ...batch, events: [{ ...event, messageId: "bad\n" }] }, { ...batch, events: Array(101).fill(event) }, { ...batch, extra: true }])
    assert.throws(() => parseInboundAuditBatch(value, now));
});

test("exact mapping evidence, chat and linked customer required before message reads", async () => {
  for (const changed of [{ ...mapping, managerChatId: "wrong" }, { ...mapping, lineUser: { linkedCustomerId: null } },
    { ...mapping, evidenceMessage: { ...mapping.evidenceMessage, externalMessageId: "wrong" } }]) {
    const { db, calls } = fakeDb({ mapping: changed });
    await assert.rejects(compareInboundAudit(db as never, batch, now));
    assert.deepEqual(calls, ["mapping"]);
  }
});

test("classifies missing, wrong user and false image links without writes", async () => {
  const matched = await compareInboundAudit(fakeDb().db as never, batch, now);
  assert.equal(matched.missingImageCount, 0);
  assert.equal(matched.historyComplete, false);
  assert.equal((await compareInboundAudit(fakeDb({ messages: [] }).db as never, batch, now)).missingMessageCount, 1);
  const wrongUser = fakeDb({ messages: [{ ...message, inquiry: { lineUserId: 9 } }] });
  assert.equal((await compareInboundAudit(wrongUser.db as never, batch, now)).mismatchCount, 1);
  assert.deepEqual(wrongUser.fileQueries, []);
  for (const bad of [{ ...file, inquiryId: 99 }, { ...file, providerFileId: "other" }, { ...file, inquiryMessageId: 99 }, { ...file, uploadStatus: "PENDING" }])
    assert.equal((await compareInboundAudit(fakeDb({ files: [bad] }).db as never, batch, now)).missingImageCount, 1);
});

test("exact LINE provider file wins regardless of unrelated file order", async () => {
  const unrelated = { ...file, provider: "OTHER", providerFileId: "other" };
  for (const files of [[unrelated, file], [file, unrelated]]) {
    const fake = fakeDb({ files });
    assert.equal((await compareInboundAudit(fake.db as never, batch, now)).missingImageCount, 0);
    assert.deepEqual(fake.fileQueries[0], { where: { provider: "LINE", providerFileId: { in: ["image-1"] } },
      select: { inquiryMessageId: true, inquiryId: true, providerFileId: true, uploadStatus: true } });
  }
});
