import { randomInt, randomUUID } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { reconcileInquiryMessageRepairLinks } from "./inquiry-message-repair-links";
import { lockLineUserInquiryTransaction } from "./inquiry-transaction-lock";

export type LineManagerSendOutboxDb = Pick<
  PrismaClient,
  "$transaction" | "inquiry" | "inquiryMessage" | "lineManagerChat" | "lineManagerSendOutbox" | "repair"
>;

export class LineManagerSendOutboxError extends Error {}

const CLAIM_LEASE_MS = 5 * 60 * 1000;
const RECONCILIATION_LEASE_MS = 5 * 60 * 1000;
const MAX_ERROR_LENGTH = 1000;

function nowOr(input?: Date) { return input ?? new Date(); }
function expiredBefore(now: Date) { return { lt: now }; }
function errorText(error: unknown) {
  const value = error instanceof Error ? error.message : String(error ?? "LINE Manager send failed");
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_LENGTH) || "LINE Manager send failed";
}

export function createLineManagerSendId(managerChatId: string, timestampMs = Date.now()) {
  return `${managerChatId}_${timestampMs}_${randomInt(1_000_000, 10_000_000)}`;
}

/** Registers only a destination demonstrated by an immutable inbound LINE message. */
export async function createVerifiedLineManagerChat(
  db: LineManagerSendOutboxDb,
  input: { lineUserId: number; managerBotId: string; managerChatId: string; evidenceInquiryMessageId: number; evidenceManagerMessageId: string; verifiedAt?: Date },
) {
  if (!input.managerBotId.trim() || !input.managerChatId.trim() || !input.evidenceManagerMessageId.trim()) {
    throw new LineManagerSendOutboxError("LINE Manager chat evidence does not prove this destination");
  }
  const evidence = await db.inquiryMessage.findUnique({
    where: { id: input.evidenceInquiryMessageId },
    select: {
      id: true,
      lineUserId: true,
      direction: true,
      externalMessageId: true,
      inquiry: { select: { lineUserId: true } },
    },
  });
  if (!evidence || evidence.direction !== "INBOUND" || evidence.lineUserId !== input.lineUserId || evidence.inquiry.lineUserId !== input.lineUserId || evidence.externalMessageId !== input.evidenceManagerMessageId) {
    throw new LineManagerSendOutboxError("LINE Manager chat evidence does not prove this destination");
  }
  const mapping = await db.lineManagerChat.upsert({
    where: { lineUserId: input.lineUserId },
    update: {},
    create: { ...input, verifiedAt: nowOr(input.verifiedAt) },
  });
  if (mapping.managerBotId !== input.managerBotId || mapping.managerChatId !== input.managerChatId || mapping.evidenceInquiryMessageId !== input.evidenceInquiryMessageId || mapping.evidenceManagerMessageId !== input.evidenceManagerMessageId) {
    throw new LineManagerSendOutboxError("A verified LINE Manager chat already exists and cannot be overwritten");
  }
  return mapping;
}

/** Creates an approved, immutable destination snapshot. sendId is generated exactly once here. */
export async function createApprovedLineManagerSendOutbox(
  db: LineManagerSendOutboxDb,
  input: { inquiryId: number; lineManagerChatId: number; text: string; idempotencyKey: string; sourceRepairId?: number; approvedAt?: Date },
) {
  if (input.sourceRepairId !== undefined && (!Number.isSafeInteger(input.sourceRepairId) || input.sourceRepairId <= 0)) throw new LineManagerSendOutboxError("Invalid source Repair ID");
  const [inquiry, chat, sourceRepair] = await Promise.all([
    db.inquiry.findUnique({ where: { id: input.inquiryId }, select: { id: true, lineUserId: true } }),
    db.lineManagerChat.findUnique({ where: { id: input.lineManagerChatId }, select: { id: true, lineUserId: true, managerBotId: true, managerChatId: true } }),
    input.sourceRepairId === undefined ? Promise.resolve(null) : db.repair.findUnique({ where: { id: input.sourceRepairId }, select: { id: true, inquiryWatchPromotion: { select: { inquiryId: true, promotedRepairId: true } } } }),
  ]);
  if (!inquiry || !chat || inquiry.lineUserId !== chat.lineUserId) throw new LineManagerSendOutboxError("Inquiry and verified LINE Manager chat do not belong to the same LINE user");
  if (input.sourceRepairId !== undefined && (!sourceRepair || sourceRepair.inquiryWatchPromotion?.inquiryId !== input.inquiryId || sourceRepair.inquiryWatchPromotion.promotedRepairId !== sourceRepair.id)) {
    throw new LineManagerSendOutboxError("Source Repair does not belong to the originating Inquiry");
  }
  const approvedAt = nowOr(input.approvedAt);
  const outbox = await db.lineManagerSendOutbox.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      inquiryId: input.inquiryId, sourceRepairId: input.sourceRepairId ?? null, lineManagerChatId: chat.id, text: input.text, idempotencyKey: input.idempotencyKey,
      sendId: createLineManagerSendId(chat.managerChatId, approvedAt.getTime()), approvedAt,
      managerBotIdSnapshot: chat.managerBotId, managerChatIdSnapshot: chat.managerChatId,
    },
  });
  if (outbox.inquiryId !== input.inquiryId || (outbox.sourceRepairId ?? null) !== (input.sourceRepairId ?? null) || outbox.lineManagerChatId !== chat.id || outbox.text !== input.text || outbox.managerBotIdSnapshot !== chat.managerBotId || outbox.managerChatIdSnapshot !== chat.managerChatId) {
    throw new LineManagerSendOutboxError("Outbox idempotency key conflicts with a different send intent");
  }
  return outbox;
}

export async function safeClaimLineManagerSendOutbox(db: LineManagerSendOutboxDb, input: { id: number; now?: Date; leaseMs?: number }) {
  const now = nowOr(input.now); const token = randomUUID(); const expires = new Date(now.getTime() + (input.leaseMs ?? CLAIM_LEASE_MS));
  const result = await db.lineManagerSendOutbox.updateMany({ where: { id: input.id, OR: [{ status: { in: ["APPROVED", "PRE_SEND_FAILED"] } }, { status: "CLAIMED", claimLeaseExpiresAt: expiredBefore(now) }] }, data: { status: "CLAIMED", claimToken: token, claimLeaseExpiresAt: expires, claimedAt: now, sendAttemptCount: { increment: 1 }, lastAttemptAt: now, lastError: null } });
  if (result.count !== 1) return null;
  const row = await db.lineManagerSendOutbox.findUnique({ where: { id: input.id } });
  return row?.claimToken === token ? { outbox: row, claimToken: token } : null;
}

export async function markLineManagerPreSendFailed(db: LineManagerSendOutboxDb, input: { id: number; claimToken: string; error: unknown }) {
  const result = await db.lineManagerSendOutbox.updateMany({ where: { id: input.id, status: "CLAIMED", claimToken: input.claimToken }, data: { status: "PRE_SEND_FAILED", claimToken: null, claimLeaseExpiresAt: null, lastError: errorText(input.error) } });
  return result.count === 1;
}

/** Mandatory durable fence: a sender may POST only after this returns true. */
export async function fenceLineManagerPostAttempt(db: LineManagerSendOutboxDb, input: { id: number; claimToken: string; now?: Date }) {
  const result = await db.lineManagerSendOutbox.updateMany({ where: { id: input.id, status: "CLAIMED", claimToken: input.claimToken }, data: { status: "POST_UNCONFIRMED", postAttemptedAt: nowOr(input.now), claimToken: null, claimLeaseExpiresAt: null, lastError: null } });
  return result.count === 1;
}

export async function cancelLineManagerSendOutbox(db: LineManagerSendOutboxDb, input: { id: number; now?: Date }) {
  const result = await db.lineManagerSendOutbox.updateMany({ where: { id: input.id, status: { in: ["APPROVED", "PRE_SEND_FAILED"] } }, data: { status: "CANCELLED", claimToken: null, claimLeaseExpiresAt: null, lastError: null } });
  return result.count === 1;
}

export async function claimLineManagerReconciliation(db: LineManagerSendOutboxDb, input: { id: number; now?: Date; leaseMs?: number }) {
  const now = nowOr(input.now); const token = randomUUID(); const expires = new Date(now.getTime() + (input.leaseMs ?? RECONCILIATION_LEASE_MS));
  const result = await db.lineManagerSendOutbox.updateMany({ where: { id: input.id, status: "POST_UNCONFIRMED", OR: [{ reconciliationToken: null }, { reconciliationLeaseExpiresAt: expiredBefore(now) }] }, data: { reconciliationToken: token, reconciliationLeaseExpiresAt: expires, lastHistoryCheckedAt: now } });
  if (result.count !== 1) return null;
  const row = await db.lineManagerSendOutbox.findUnique({ where: { id: input.id } });
  return row?.reconciliationToken === token ? { outbox: row, reconciliationToken: token } : null;
}

/** Confirms history evidence and creates the OUTBOUND source record with the actual LINE message id. */
export async function confirmLineManagerSendOutbox(
  db: LineManagerSendOutboxDb,
  input: { id: number; reconciliationToken: string; actualMessageId: string; text: string; timestamp: Date; managerBotId: string; managerChatId: string; now?: Date },
) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const outbox = await tx.lineManagerSendOutbox.findUnique({ where: { id: input.id }, include: { inquiry: true, lineManagerChat: true, confirmedInquiryMessage: true } });
    if (!outbox) throw new LineManagerSendOutboxError("Outbox not found");
    if (outbox.status === "CONFIRMED") {
      const message = outbox.confirmedInquiryMessage;
      if (
        outbox.confirmedManagerMessageId === input.actualMessageId &&
        outbox.text === input.text &&
        input.managerBotId === outbox.managerBotIdSnapshot &&
        input.managerChatId === outbox.managerChatIdSnapshot &&
        message &&
        message.id === outbox.confirmedInquiryMessageId &&
        message.inquiryId === outbox.inquiryId &&
        message.lineUserId === outbox.inquiry.lineUserId &&
        message.externalMessageId === input.actualMessageId &&
        message.direction === "OUTBOUND" &&
        message.messageType === "TEXT" &&
        message.body === input.text &&
        message.sentAt?.getTime() === input.timestamp.getTime() &&
        message.status === "sent"
      ) return outbox;
      throw new LineManagerSendOutboxError("Confirmed outbox conflicts with history evidence");
    }
    if (outbox.status !== "POST_UNCONFIRMED" || outbox.reconciliationToken !== input.reconciliationToken) throw new LineManagerSendOutboxError("Reconciliation claim is no longer current");
    if (outbox.text !== input.text) throw new LineManagerSendOutboxError("LINE Manager history text does not match approved outbox text");
    if (input.managerBotId !== outbox.managerBotIdSnapshot || input.managerChatId !== outbox.managerChatIdSnapshot) throw new LineManagerSendOutboxError("LINE Manager history destination does not match the frozen snapshot");
    if (outbox.inquiry.lineUserId !== outbox.lineManagerChat.lineUserId || outbox.managerBotIdSnapshot !== outbox.lineManagerChat.managerBotId || outbox.managerChatIdSnapshot !== outbox.lineManagerChat.managerChatId) throw new LineManagerSendOutboxError("Verified chat mapping no longer matches this outbox destination");
    let sourceInquiryWatchId: number | null = null;
    if (outbox.sourceRepairId != null) {
      const sourceRepair = await tx.repair.findUnique({ where: { id: outbox.sourceRepairId }, select: { inquiryWatchPromotion: { select: { id: true, inquiryId: true, promotedRepairId: true } } } });
      const promotion = sourceRepair?.inquiryWatchPromotion;
      if (!promotion || promotion.inquiryId !== outbox.inquiryId || promotion.promotedRepairId !== outbox.sourceRepairId) throw new LineManagerSendOutboxError("Source Repair no longer belongs to the originating Inquiry");
      sourceInquiryWatchId = promotion.id;
      await lockLineUserInquiryTransaction(tx, outbox.inquiry.lineUserId);
    }
    const existingMessage = await tx.inquiryMessage.findUnique({ where: { externalMessageId: input.actualMessageId } });
    let message = existingMessage;
    if (message) {
      if (message.inquiryId !== outbox.inquiryId || message.lineUserId !== outbox.inquiry.lineUserId || message.direction !== "OUTBOUND" || message.messageType !== "TEXT" || message.body !== input.text || message.sentAt?.getTime() !== input.timestamp.getTime() || message.status !== "sent") throw new LineManagerSendOutboxError("Actual LINE message id is already bound to different source data");
    } else {
      message = await tx.inquiryMessage.create({ data: { inquiryId: outbox.inquiryId, lineUserId: outbox.inquiry.lineUserId, externalMessageId: input.actualMessageId, direction: "OUTBOUND", messageType: "TEXT", body: input.text, sentAt: input.timestamp, status: "sent" } });
    }
    if (sourceInquiryWatchId !== null) {
      const prior = await tx.inquiryMessageClassification.findUnique({ where: { inquiryMessageId: message.id }, select: { id: true, source: true } });
      if (prior?.source !== "MANUAL") {
        const classification = await tx.inquiryMessageClassification.upsert({
          where: { inquiryMessageId: message.id },
          update: { scope: "WATCHES", source: "MANUAL", confidence: null, evidence: null, confirmedAt: nowOr(input.now) },
          create: { inquiryMessageId: message.id, inquiryId: outbox.inquiryId, scope: "WATCHES", source: "MANUAL", confirmedAt: nowOr(input.now) },
          select: { id: true },
        });
        await tx.inquiryMessageWatchLink.deleteMany({ where: { classificationId: classification.id } });
        await tx.inquiryMessageWatchLink.create({ data: { classificationId: classification.id, inquiryWatchId: sourceInquiryWatchId, inquiryId: outbox.inquiryId } });
        await reconcileInquiryMessageRepairLinks(tx, classification.id);
      } else {
        await reconcileInquiryMessageRepairLinks(tx, prior.id);
      }
    }
    const updated = await tx.lineManagerSendOutbox.updateMany({ where: { id: outbox.id, status: "POST_UNCONFIRMED", reconciliationToken: input.reconciliationToken }, data: { status: "CONFIRMED", confirmedManagerMessageId: input.actualMessageId, confirmedInquiryMessageId: message.id, confirmedAt: nowOr(input.now), reconciliationToken: null, reconciliationLeaseExpiresAt: null, lastError: null } });
    if (updated.count !== 1) throw new LineManagerSendOutboxError("Reconciliation claim changed before confirmation");
    return tx.lineManagerSendOutbox.findUnique({ where: { id: outbox.id } });
  });
}

export const LINE_MANAGER_SEND_OUTBOX_LIMITS = { CLAIM_LEASE_MS, RECONCILIATION_LEASE_MS };
