import assert from "node:assert/strict";
import test from "node:test";
import {
  claimLineManagerReconciliation,
  confirmLineManagerSendOutbox,
  createApprovedLineManagerSendOutbox,
  createLineManagerSendId,
  createVerifiedLineManagerChat,
  fenceLineManagerPostAttempt,
  markLineManagerPreSendFailed,
  safeClaimLineManagerSendOutbox,
} from "./line-manager-send-outbox";

test("mapping rejects non-inbound, another LINE user, and mismatched evidence ids", async () => {
  for (const evidence of [
    { direction: "OUTBOUND", lineUserId: 1, externalMessageId: "actual", inquiry: { lineUserId: 1 } },
    { direction: "INBOUND", lineUserId: 2, externalMessageId: "actual", inquiry: { lineUserId: 2 } },
    { direction: "INBOUND", lineUserId: 1, externalMessageId: "other", inquiry: { lineUserId: 1 } },
    { direction: "INBOUND", lineUserId: 1, externalMessageId: "actual", inquiry: { lineUserId: 2 } },
  ]) {
    const db: any = { inquiryMessage: { findUnique: async () => evidence }, lineManagerChat: {} };
    await assert.rejects(createVerifiedLineManagerChat(db, { lineUserId: 1, managerBotId: "bot", managerChatId: "chat", evidenceInquiryMessageId: 1, evidenceManagerMessageId: "actual" }));
  }
});

test("mapping rejects blank manager identifiers without creating a record", async () => {
  for (const input of [
    { managerBotId: " ", managerChatId: "chat", evidenceManagerMessageId: "actual" },
    { managerBotId: "bot", managerChatId: "\t", evidenceManagerMessageId: "actual" },
    { managerBotId: "bot", managerChatId: "chat", evidenceManagerMessageId: "\n" },
  ]) {
    let upserted = false;
    const db: any = {
      inquiryMessage: { findUnique: async () => ({ id: 3, direction: "INBOUND", lineUserId: 1, externalMessageId: "actual", inquiry: { lineUserId: 1 } }) },
      lineManagerChat: { upsert: async () => { upserted = true; } },
    };
    await assert.rejects(createVerifiedLineManagerChat(db, { lineUserId: 1, evidenceInquiryMessageId: 3, ...input }));
    assert.equal(upserted, false);
  }
});

test("same verified mapping is idempotent and a different destination is not overwritten", async () => {
  const row = { managerBotId: "bot", managerChatId: "chat", evidenceInquiryMessageId: 3, evidenceManagerMessageId: "actual" };
  const db: any = { inquiryMessage: { findUnique: async () => ({ id: 3, direction: "INBOUND", lineUserId: 1, externalMessageId: "actual", inquiry: { lineUserId: 1 } }) }, lineManagerChat: { upsert: async () => row } };
  assert.equal(await createVerifiedLineManagerChat(db, { lineUserId: 1, ...row }), row);
  await assert.rejects(createVerifiedLineManagerChat(db, { lineUserId: 1, managerBotId: "bot", managerChatId: "other", evidenceInquiryMessageId: 3, evidenceManagerMessageId: "actual" }));
});

test("approved outbox requires inquiry and verified mapping to share a LINE user and freezes destination", async () => {
  const db: any = { lineManagerSendOutbox: { upsert: async (args: any) => args.create }, inquiry: { findUnique: async () => ({ id: 1, lineUserId: 1 }) }, lineManagerChat: { findUnique: async () => ({ id: 2, lineUserId: 1, managerBotId: "bot", managerChatId: "chat" }) } };
  const row = await createApprovedLineManagerSendOutbox(db, { inquiryId: 1, lineManagerChatId: 2, text: "hello", idempotencyKey: "key" });
  assert.equal(row.managerBotIdSnapshot, "bot"); assert.equal(row.managerChatIdSnapshot, "chat"); assert.match(row.sendId, /^chat_\d{13}_\d{7}$/);
});

test("sendId has the LINELib manager-chat prefix and is generated only in upsert create data", () => {
  assert.match(createLineManagerSendId("chat-123", 1_700_000_000_000), /^chat-123_1700000000000_\d{7}$/);
});

test("mapping and outbox upserts converge concurrent equal requests and fail closed on differing rows", async () => {
  const mapping = { managerBotId: "bot", managerChatId: "chat", evidenceInquiryMessageId: 3, evidenceManagerMessageId: "actual" };
  let mappingCreates = 0; let outboxCreates = 0;
  const db: any = {
    inquiryMessage: { findUnique: async () => ({ id: 3, direction: "INBOUND", lineUserId: 1, externalMessageId: "actual", inquiry: { lineUserId: 1 } }) },
    lineManagerChat: {
      upsert: async (args: any) => { mappingCreates++; return args.create; },
      findUnique: async () => ({ id: 2, lineUserId: 1, managerBotId: "bot", managerChatId: "chat" }),
    },
    inquiry: { findUnique: async () => ({ id: 1, lineUserId: 1 }) },
    lineManagerSendOutbox: { upsert: async (args: any) => { outboxCreates++; return args.create; } },
  };
  await Promise.all([createVerifiedLineManagerChat(db, { lineUserId: 1, ...mapping }), createVerifiedLineManagerChat(db, { lineUserId: 1, ...mapping })]);
  await Promise.all([createApprovedLineManagerSendOutbox(db, { inquiryId: 1, lineManagerChatId: 2, text: "hello", idempotencyKey: "key" }), createApprovedLineManagerSendOutbox(db, { inquiryId: 1, lineManagerChatId: 2, text: "hello", idempotencyKey: "key" })]);
  assert.equal(mappingCreates, 2); assert.equal(outboxCreates, 2);
  db.lineManagerSendOutbox.upsert = async () => ({ inquiryId: 99, lineManagerChatId: 2, text: "hello", managerBotIdSnapshot: "bot", managerChatIdSnapshot: "chat" });
  await assert.rejects(createApprovedLineManagerSendOutbox(db, { inquiryId: 1, lineManagerChatId: 2, text: "hello", idempotencyKey: "conflict" }));
});

test("concurrent send claims permit exactly one worker", async () => {
  let token: string | undefined; let claimed = false;
  const db: any = { lineManagerSendOutbox: { updateMany: async (a: any) => { if (claimed) return { count: 0 }; claimed = true; token = a.data.claimToken; return { count: 1 }; }, findUnique: async () => ({ id: 1, claimToken: token }) } };
  const result = await Promise.all([safeClaimLineManagerSendOutbox(db, { id: 1 }), safeClaimLineManagerSendOutbox(db, { id: 1 })]);
  assert.equal(result.filter(Boolean).length, 1);
});

test("stale CLAIMED is reclaimable, but POST_UNCONFIRMED is never a send-claim candidate", async () => {
  const updates: any[] = []; const db: any = { lineManagerSendOutbox: { updateMany: async (a: any) => { updates.push(a); return { count: 0 }; } } };
  await safeClaimLineManagerSendOutbox(db, { id: 1, now: new Date("2026-09-23T00:00:00Z") });
  const where = updates[0].where;
  assert.equal(where.OR[1].status, "CLAIMED"); assert.equal(where.OR.some((x: any) => x.status === "POST_UNCONFIRMED"), false);
});

test("PRE_SEND_FAILED is retryable and stale claim tokens cannot fail or fence a newer claim", async () => {
  const updates: any[] = []; const db: any = { lineManagerSendOutbox: { updateMany: async (a: any) => { updates.push(a); return { count: 0 }; } } };
  await safeClaimLineManagerSendOutbox(db, { id: 1 });
  assert.deepEqual(updates[0].where.OR[0], { status: { in: ["APPROVED", "PRE_SEND_FAILED"] } });
  assert.equal(await markLineManagerPreSendFailed(db, { id: 1, claimToken: "old", error: "no" }), false);
  assert.equal(await fenceLineManagerPostAttempt(db, { id: 1, claimToken: "old" }), false);
  assert.equal(updates[2].where.status, "CLAIMED"); assert.equal(updates[2].where.claimToken, "old");
});

test("fence transitions only the current CLAIMED worker to POST_UNCONFIRMED, never back to send retry", async () => {
  const db: any = { lineManagerSendOutbox: { updateMany: async (a: any) => { assert.equal(a.where.status, "CLAIMED"); assert.equal(a.data.status, "POST_UNCONFIRMED"); return { count: 1 }; } } };
  assert.equal(await fenceLineManagerPostAttempt(db, { id: 1, claimToken: "current" }), true);
});

test("reconciliation claims only POST_UNCONFIRMED and competing workers cannot both claim", async () => {
  let used = false; let token: string | undefined;
  const db: any = { lineManagerSendOutbox: { updateMany: async (a: any) => { assert.equal(a.where.status, "POST_UNCONFIRMED"); if (used) return { count: 0 }; used = true; token = a.data.reconciliationToken; return { count: 1 }; }, findUnique: async () => ({ id: 1, reconciliationToken: token }) } };
  const result = await Promise.all([claimLineManagerReconciliation(db, { id: 1 }), claimLineManagerReconciliation(db, { id: 1 })]);
  assert.equal(result.filter(Boolean).length, 1);
});

test("confirmation creates one OUTBOUND record using actual message id and is idempotent", async () => {
  const timestamp = new Date("2026-09-23T01:02:03.000Z"); let created: any; let status = "POST_UNCONFIRMED";
  const outbox = { id: 1, status, reconciliationToken: "reconcile", text: "reply", inquiryId: 10, managerBotIdSnapshot: "bot", managerChatIdSnapshot: "chat", inquiry: { lineUserId: 7 }, lineManagerChat: { lineUserId: 7, managerBotId: "bot", managerChatId: "chat" } };
  const tx: any = { lineManagerSendOutbox: { findUnique: async () => status === "CONFIRMED" ? { ...outbox, status, confirmedManagerMessageId: "actual", confirmedInquiryMessageId: 99, confirmedInquiryMessage: created } : { ...outbox, status }, updateMany: async () => { status = "CONFIRMED"; return { count: 1 }; } }, inquiryMessage: { findUnique: async () => null, create: async (a: any) => { created = { id: 99, ...a.data }; return created; } } };
  const db: any = { $transaction: async (fn: any) => fn(tx) };
  await confirmLineManagerSendOutbox(db, { id: 1, reconciliationToken: "reconcile", actualMessageId: "actual", text: "reply", timestamp, managerBotId: "bot", managerChatId: "chat" });
  assert.deepEqual(created, { id: 99, inquiryId: 10, lineUserId: 7, externalMessageId: "actual", direction: "OUTBOUND", messageType: "TEXT", body: "reply", sentAt: timestamp, status: "sent" });
  await confirmLineManagerSendOutbox(db, { id: 1, reconciliationToken: "ignored", actualMessageId: "actual", text: "reply", timestamp, managerBotId: "bot", managerChatId: "chat" });
  await assert.rejects(confirmLineManagerSendOutbox(db, { id: 1, reconciliationToken: "ignored", actualMessageId: "actual", text: "reply", timestamp, managerBotId: "bot", managerChatId: "other-chat" }));
});

test("confirmation fails closed for text mismatch or an actual message id already used differently", async () => {
  const base: any = { id: 1, status: "POST_UNCONFIRMED", reconciliationToken: "token", text: "approved", inquiryId: 10, managerBotIdSnapshot: "bot", managerChatIdSnapshot: "chat", inquiry: { lineUserId: 7 }, lineManagerChat: { lineUserId: 7, managerBotId: "bot", managerChatId: "chat" } };
  const tx: any = { lineManagerSendOutbox: { findUnique: async () => base }, inquiryMessage: { findUnique: async () => ({ inquiryId: 99, lineUserId: 7, direction: "OUTBOUND", messageType: "TEXT", body: "approved", sentAt: new Date(), status: "sent" }) } };
  const db: any = { $transaction: async (fn: any) => fn(tx) };
  await assert.rejects(confirmLineManagerSendOutbox(db, { id: 1, reconciliationToken: "token", actualMessageId: "actual", text: "different", timestamp: new Date(), managerBotId: "bot", managerChatId: "chat" }));
  await assert.rejects(confirmLineManagerSendOutbox(db, { id: 1, reconciliationToken: "token", actualMessageId: "actual", text: "approved", timestamp: new Date(), managerBotId: "bot", managerChatId: "chat" }));
});

test("source Repair must belong to the same Inquiry and is part of outbox idempotency", async () => {
  const promotion = { inquiryId: 10, promotedRepairId: 3 };
  let saved: any;
  const db: any = {
    inquiry: { findUnique: async () => ({ id: 10, lineUserId: 7 }) },
    lineManagerChat: { findUnique: async () => ({ id: 2, lineUserId: 7, managerBotId: "bot", managerChatId: "chat" }) },
    repair: { findUnique: async () => ({ id: 3, inquiryWatchPromotion: promotion }) },
    lineManagerSendOutbox: { upsert: async (args: any) => saved ?? (saved = args.create) },
  };
  const input = { inquiryId: 10, lineManagerChatId: 2, sourceRepairId: 3, text: "hello", idempotencyKey: "repair-key" };
  assert.equal((await createApprovedLineManagerSendOutbox(db, input)).sourceRepairId, 3);
  await assert.rejects(createApprovedLineManagerSendOutbox(db, { ...input, sourceRepairId: undefined }));
  promotion.inquiryId = 99;
  await assert.rejects(createApprovedLineManagerSendOutbox(db, input));
  promotion.inquiryId = 10; promotion.promotedRepairId = 4;
  await assert.rejects(createApprovedLineManagerSendOutbox(db, input));
});

test("Repair confirmation classifies with MANUAL WATCHES and preserves human MANUAL priority", async () => {
  for (const initialSource of [null, "AI", "MANUAL"] as const) {
    const timestamp = new Date("2026-09-24T01:02:03Z");
    let status = "POST_UNCONFIRMED";
    let classification: any = initialSource ? { id: 50, source: initialSource, scope: initialSource === "MANUAL" ? "COMMON" : "UNASSIGNED" } : null;
    let createdMessage: any = null;
    let watchCreates = 0, watchDeletes = 0, repairCreates = 0, locks = 0;
    const outbox = { id: 1, status, sourceRepairId: 3, reconciliationToken: "token", text: "reply", inquiryId: 10, managerBotIdSnapshot: "bot", managerChatIdSnapshot: "chat", inquiry: { lineUserId: 7 }, lineManagerChat: { lineUserId: 7, managerBotId: "bot", managerChatId: "chat" } };
    const tx: any = {
      $executeRaw: async () => { locks++; },
      repair: { findUnique: async () => ({ inquiryWatchPromotion: { id: 5, inquiryId: 10, promotedRepairId: 3 } }) },
      inquiryMessage: { findUnique: async () => null, create: async (args: any) => (createdMessage = { id: 99, ...args.data }) },
      inquiryMessageClassification: {
        findUnique: async (args: any) => args.where.inquiryMessageId ? classification : { inquiryId: 10, scope: classification.scope, watchLinks: classification.scope === "WATCHES" ? [{ inquiryWatch: { promotedRepairId: 3 } }] : [], repairLinks: [] },
        upsert: async (args: any) => { classification = { id: 50, ...args.create }; return { id: 50 }; },
      },
      inquiryMessageWatchLink: { deleteMany: async () => { watchDeletes++; }, create: async (args: any) => { watchCreates++; assert.equal(args.data.inquiryWatchId, 5); } },
      inquiryMessageRepairLink: { deleteMany: async () => ({ count: 0 }), createMany: async (args: any) => { repairCreates++; assert.equal(args.data[0].repairId, 3); } },
      inquiryWatch: { findMany: async () => [{ promotedRepairId: 3 }] },
      lineManagerSendOutbox: { findUnique: async () => status === "CONFIRMED" ? { ...outbox, status, confirmedManagerMessageId: "actual", confirmedInquiryMessageId: 99, confirmedInquiryMessage: createdMessage } : outbox, updateMany: async () => { status = "CONFIRMED"; return { count: 1 }; } },
    };
    const db: any = { $transaction: async (fn: any) => fn(tx) };
    const input = { id: 1, reconciliationToken: "token", actualMessageId: "actual", text: "reply", timestamp, managerBotId: "bot", managerChatId: "chat" };
    await confirmLineManagerSendOutbox(db, input);
    assert.equal(locks, 1);
    assert.equal(repairCreates, 1);
    assert.equal(classification.scope, initialSource === "MANUAL" ? "COMMON" : "WATCHES");
    assert.equal(classification.source, "MANUAL");
    assert.equal(watchCreates, initialSource === "MANUAL" ? 0 : 1);
    assert.equal(watchDeletes, initialSource === "MANUAL" ? 0 : 1);
    await confirmLineManagerSendOutbox(db, input);
    assert.equal(watchCreates, initialSource === "MANUAL" ? 0 : 1);
  }
});
