import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalUuid, approveReply, BridgeNotFoundError, BridgeStaleError, BridgeUnavailableError,
  getReplyApprovalContext, getReplyApprovalStatus, parseApproval, parseStatus, parseTarget,
} from "./chatgpt-line-reply-bridge";

const now = new Date("2026-10-08T01:00:00.000Z");
const promotion = { id: 5, inquiryId: 7, promotedRepairId: 10, promotedAt: now,
  inquiry: { lineUserId: 2, status: "OPEN", lastReceivedAt: now,
    lineUser: { linkedCustomerId: 1, lineManagerChat: { id: 30, verifiedAt: now } } } };

function source(id: number, inquiryId = 7) {
  return { id, inquiryId, lineUserId: 2, inquiry: { lineUserId: 2 }, direction: "INBOUND", messageType: "TEXT",
    body: `body ${id}`, receivedAt: now, sentAt: null, createdAt: now, status: "received", externalMessageId: "secret-external",
    files: [{ id: 70 + id, mimeType: "image/png", fileSize: 10, width: 1, height: 1, uploadStatus: "STORED", objectKey: "secret-object", updatedAt: now }],
    classification: inquiryId === 7 ? { scope: "WATCHES", source: "MANUAL", confidence: null, confirmedAt: now, evidence: null,
      watchLinks: [{ inquiryWatchId: 5, inquiryWatch: { id: 5 } }], repairLinks: [{ repairId: 10 }] } : null,
    postIntakeRouting: inquiryId === 8 ? { customerId: 1, repairLinks: [{ repairId: 10 }] } : null };
}

function fixture() {
  const state = { messages: [source(1), source(2, 8)], rows: [] as any[], mapping: true, origin: promotion as typeof promotion | null,
    lineUserId: 2, log: [] as string[], createCount: 0, transactionOptions: null as any };
  const db: any = {
    $executeRaw: async () => { state.log.push("lock"); },
    $transaction: async (fn: (tx: any) => Promise<unknown>, options?: any) => { state.transactionOptions = options ?? null; state.log.push("begin"); const result = await fn(db); state.log.push("commit"); return result; },
    inquiry: { findUnique: async (query: any) => query.where.id === 7 ? !query.select.lineUserId
      ? { id: 7, lineUser: { lineManagerChat: state.mapping ? { id: 30, verifiedAt: now } : null }, reviewWatches: [] }
      : { id: 7, lineUserId: state.lineUserId, status: "OPEN", lastReceivedAt: now,
        lineUser: { linkedCustomerId: 1 } } : null },
    repair: { findUnique: async (query: any) => query.where.id === 10
      ? { id: 10, customerId: 1, inquiryWatchPromotion: state.origin && {
        ...state.origin, inquiry: { ...state.origin.inquiry, lineUser: {
          ...state.origin.inquiry.lineUser, lineManagerChat: state.mapping ? { id: 30, verifiedAt: now } : null,
        } },
      } } : null },
    lineManagerChat: { findUnique: async (query: any) => state.mapping ? {
      id: 30, lineUserId: 2, managerBotId: "secret-bot", managerChatId: "secret-chat", verifiedAt: now,
    } : null },
    inquiryMessage: { findMany: async (query: any) => {
      state.log.push("messages");
      return query.where.inquiryId === 7 ? state.messages.filter((row) => row.inquiryId === 7).slice().reverse() : state.messages.slice().reverse();
    } },
    inquiryFile: { findMany: async () => state.messages.map((row) => row.files.map((file) => ({ ...file, inquiryMessageId: row.id }))).flat() },
    inquiryWatch: { findMany: async () => [{ id: 5, position: 1, label: "mine", promotedRepairId: 10, promotedRepair: { inquiryNumber: "R-10" } }] },
    lineManagerSendOutbox: {
      findMany: async (query: any) => {
        state.log.push("pending");
        return state.rows.filter((row) => row.inquiryId === query.where.inquiryId &&
          (query.where.sourceRepairId === undefined || row.sourceRepairId === query.where.sourceRepairId) &&
          row.status !== "CONFIRMED" && row.status !== "CANCELLED");
      },
      findUnique: async (query: any) => query.where.idempotencyKey
        ? state.rows.find((row) => row.idempotencyKey === query.where.idempotencyKey) ?? null
        : state.rows.find((row) => row.id === query.where.id) ?? null,
      upsert: async (query: any) => {
        state.log.push("upsert");
        const existing = state.rows.find((row) => row.idempotencyKey === query.where.idempotencyKey);
        if (existing) return existing;
        state.createCount++;
        const row = { id: 100 + state.createCount, ...query.create, status: "APPROVED", createdAt: now,
          confirmedAt: null, confirmedInquiryMessageId: null };
        state.rows.push(row);
        return row;
      },
    },
  };
  return { db, state };
}

function noSecrets(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const secret of ["secret-bot", "secret-chat", "secret-external", "secret-object", "managerBotId", "managerChatId", "sendId", "externalMessageId", "objectKey", "claimToken", "lastError"]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
}

test("Inquiry fingerprint is deterministic, private, and changes with message and pending state", async () => {
  const { db, state } = fixture();
  const target = parseTarget({ targetType: "INQUIRY", targetId: 7 });
  const first = await getReplyApprovalContext(db, target);
  assert.equal(first.approvalFingerprint, (await getReplyApprovalContext(db, target)).approvalFingerprint);
  assert.equal(first.messages.length, 1);
  noSecrets(first);
  state.messages[0].body = "new inbound";
  const second = await getReplyApprovalContext(db, target);
  assert.notEqual(first.approvalFingerprint, second.approvalFingerprint);
  (state.messages[0].classification as { evidence: string | null }).evidence = "updated evidence";
  const evidenceChanged = await getReplyApprovalContext(db, target);
  assert.notEqual(second.approvalFingerprint, evidenceChanged.approvalFingerprint);
  state.rows.push({ id: 50, inquiryId: 7, sourceRepairId: null, text: "pending", status: "APPROVED", approvedAt: now, createdAt: now });
  const third = await getReplyApprovalContext(db, target);
  assert.notEqual(evidenceChanged.approvalFingerprint, third.approvalFingerprint);
  state.rows[0].status = "CLAIMED";
  assert.notEqual(third.approvalFingerprint, (await getReplyApprovalContext(db, target)).approvalFingerprint);
});

test("Repair fingerprint uses cross-Inquiry projection and sourceRepairId pending intent", async () => {
  const { db, state } = fixture();
  const target = parseTarget({ targetType: "REPAIR", targetId: 10 });
  const first = await getReplyApprovalContext(db, target);
  assert.deepEqual(first.messages.map((message: { inquiryId: number }) => message.inquiryId), [7, 8]);
  assert.equal(first.sourceInquiryId, 7);
  noSecrets(first);
  state.messages[1].body = "cross Inquiry changed";
  const second = await getReplyApprovalContext(db, target);
  assert.notEqual(first.approvalFingerprint, second.approvalFingerprint);
  state.rows.push({ id: 50, inquiryId: 7, sourceRepairId: 10, text: "Repair pending", status: "APPROVED", approvedAt: now, createdAt: now });
  assert.notEqual(second.approvalFingerprint, (await getReplyApprovalContext(db, target)).approvalFingerprint);
});

test("approval locks before revalidation, stale context writes nothing, exact retry converges", async () => {
  const { db, state } = fixture();
  const target = parseTarget({ targetType: "INQUIRY", targetId: 7 });
  const context = await getReplyApprovalContext(db, target);
  state.messages[0].body = "changed";
  await assert.rejects(approveReply(db, parseApproval({ ...target, approvalFingerprint: context.approvalFingerprint, text: "approved" })), BridgeStaleError);
  assert.equal(state.createCount, 0);
  const fresh = await getReplyApprovalContext(db, target);
  state.log.length = 0;
  const input = parseApproval({ ...target, approvalFingerprint: fresh.approvalFingerprint, text: "approved" });
  const first = await approveReply(db, input);
  assert.equal(first.status, "APPROVED");
  assert.equal(first.sent, false);
  assert.ok(state.log.indexOf("lock") < state.log.indexOf("messages"));
  assert.ok(state.log.indexOf("messages") < state.log.indexOf("upsert"));
  assert.ok(state.log.indexOf("upsert") < state.log.indexOf("commit"));
  assert.equal(state.transactionOptions?.isolationLevel, "Serializable");
  assert.equal((await approveReply(db, input)).approvalId, first.approvalId);
  assert.equal(state.createCount, 1);
  assert.notEqual(approvalUuid(target, fresh.approvalFingerprint, "approved"), approvalUuid(target, fresh.approvalFingerprint, "different"));
  assert.notEqual(approvalUuid(target, fresh.approvalFingerprint, "approved"), approvalUuid(target, context.approvalFingerprint, "approved"));
  noSecrets(first);
});

test("serialization conflict is reported as stale", async () => {
  const { db } = fixture();
  const target = parseTarget({ targetType: "INQUIRY", targetId: 7 });
  const context = await getReplyApprovalContext(db, target);
  db.$transaction = async () => { throw Object.assign(new Error("write conflict"), { code: "P2034" }); };
  await assert.rejects(
    approveReply(db, parseApproval({ ...target, approvalFingerprint: context.approvalFingerprint, text: "approved" })),
    BridgeStaleError,
  );
});

test("Repair approval preserves sourceRepairId and unavailable or changed origin fails closed", async () => {
  const { db, state } = fixture();
  const target = parseTarget({ targetType: "REPAIR", targetId: 10 });
  const context = await getReplyApprovalContext(db, target);
  const result = await approveReply(db, parseApproval({ ...target, approvalFingerprint: context.approvalFingerprint, text: "Repair reply" }));
  assert.equal(result.status, "APPROVED");
  assert.equal(state.rows[0].sourceRepairId, 10);
  assert.equal(state.rows[0].inquiryId, 7);
  state.mapping = false;
  const unavailable = await getReplyApprovalContext(db, target);
  assert.equal(unavailable.sendAvailable, false);
  await assert.rejects(approveReply(db, parseApproval({ ...target, approvalFingerprint: unavailable.approvalFingerprint, text: "new" })), BridgeUnavailableError);
  state.origin = null;
  await assert.rejects(getReplyApprovalStatus(db, parseStatus({ ...target, approvalId: result.approvalId })), BridgeNotFoundError);
});

test("status is target-bound and only CONFIRMED is sent", async () => {
  const { db, state } = fixture();
  const inquiry = parseTarget({ targetType: "INQUIRY", targetId: 7 });
  const repair = parseTarget({ targetType: "REPAIR", targetId: 10 });
  state.rows.push({ id: 51, inquiryId: 7, sourceRepairId: null, text: "x", status: "APPROVED", approvedAt: now, createdAt: now });
  state.rows.push({ id: 52, inquiryId: 7, sourceRepairId: 10, text: "x", status: "APPROVED", approvedAt: now, createdAt: now });
  state.rows.push({ id: 53, inquiryId: 7, sourceRepairId: 11, text: "x", status: "APPROVED", approvedAt: now, createdAt: now });
  await assert.rejects(getReplyApprovalStatus(db, { ...inquiry, approvalId: 52 }), BridgeNotFoundError);
  await assert.rejects(getReplyApprovalStatus(db, { ...repair, approvalId: 51 }), BridgeNotFoundError);
  await assert.rejects(getReplyApprovalStatus(db, { ...repair, approvalId: 53 }), BridgeNotFoundError);
  for (const status of ["APPROVED", "CLAIMED", "PRE_SEND_FAILED", "POST_UNCONFIRMED", "CANCELLED", "CONFIRMED"]) {
    state.rows[0].status = status;
    state.rows[0].lastError = "secret-error";
    const result = await getReplyApprovalStatus(db, { ...inquiry, approvalId: 51 });
    assert.equal(result.sent, status === "CONFIRMED");
    noSecrets(result);
  }
  await assert.rejects(getReplyApprovalStatus(db, { ...inquiry, approvalId: 999 }), BridgeNotFoundError);
});
