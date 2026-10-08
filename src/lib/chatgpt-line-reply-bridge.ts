import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { createInquiryLineReply, getInquiryLineChat, InquiryLineChatInputError, InquiryLineChatNotFoundError, InquiryLineChatUnavailableError } from "./inquiry-line-chat";
import { lockLineUserInquiryTransaction } from "./inquiry-transaction-lock";
import { LineManagerSendOutboxError } from "./line-manager-send-outbox";
import { createRepairLineReply, getRepairLineChat } from "./repair-line-chat";

export type ReplyTargetType = "INQUIRY" | "REPAIR";
type Target = { targetType: ReplyTargetType; targetId: number };
type BridgeDb = PrismaClient;
type TargetIdentity = { lineUserId: number | null; sourceInquiryId: number | null; customerId: number | null;
  linkedCustomerId: number | null; inquiryStatus: string | null; lastReceivedAt: Date | null;
  promotionId: number | null; promotedAt: Date | null };

export class BridgeInputError extends Error {}
export class BridgeNotFoundError extends Error {}
export class BridgeStaleError extends Error {}
export class BridgeUnavailableError extends Error {}
export class BridgeConflictError extends Error {}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : null;
const id = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function parseTarget(value: unknown): Target {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BridgeInputError();
  const body = value as Record<string, unknown>;
  if ((body.targetType !== "INQUIRY" && body.targetType !== "REPAIR") || !id(body.targetId)) throw new BridgeInputError();
  return { targetType: body.targetType, targetId: body.targetId };
}

export function parseApproval(value: unknown) {
  const target = parseTarget(value);
  const body = value as Record<string, unknown>;
  if (typeof body.approvalFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.approvalFingerprint) ||
      typeof body.text !== "string" || !body.text.trim() || body.text.length > 5000) throw new BridgeInputError();
  return { ...target, approvalFingerprint: body.approvalFingerprint, text: body.text };
}

export function parseStatus(value: unknown) {
  const target = parseTarget(value);
  const body = value as Record<string, unknown>;
  if (!id(body.approvalId)) throw new BridgeInputError();
  return { ...target, approvalId: body.approvalId };
}

async function identity(db: BridgeDb, target: Target): Promise<TargetIdentity> {
  if (target.targetType === "INQUIRY") {
    const row = await db.inquiry.findUnique({ where: { id: target.targetId }, select: {
      lineUserId: true, status: true, lastReceivedAt: true, lineUser: { select: { linkedCustomerId: true } },
    } });
    if (!row) throw new BridgeNotFoundError();
    return { lineUserId: row.lineUserId, sourceInquiryId: target.targetId, customerId: null,
      linkedCustomerId: row.lineUser.linkedCustomerId, inquiryStatus: row.status, lastReceivedAt: row.lastReceivedAt,
      promotionId: null, promotedAt: null };
  }
  const row = await db.repair.findUnique({ where: { id: target.targetId }, select: {
    customerId: true,
    inquiryWatchPromotion: { select: { id: true, inquiryId: true, promotedRepairId: true, promotedAt: true,
      inquiry: { select: { lineUserId: true, status: true, lastReceivedAt: true,
        lineUser: { select: { linkedCustomerId: true } } } } } },
  } });
  if (!row) throw new BridgeNotFoundError();
  const promotion = row.inquiryWatchPromotion;
  const valid = promotion?.promotedRepairId === target.targetId && promotion.inquiry.lineUser.linkedCustomerId === row.customerId;
  return { lineUserId: valid ? promotion.inquiry.lineUserId : null, sourceInquiryId: valid ? promotion.inquiryId : null,
    customerId: row.customerId, linkedCustomerId: valid ? promotion.inquiry.lineUser.linkedCustomerId : null,
    inquiryStatus: valid ? promotion.inquiry.status : null, lastReceivedAt: valid ? promotion.inquiry.lastReceivedAt : null,
    promotionId: valid ? promotion.id : null, promotedAt: valid ? promotion.promotedAt : null };
}

function messageSnapshot(message: any) {
  const classification = message.classification;
  return {
    id: message.id, inquiryId: message.inquiryId ?? null, lineUserId: message.lineUserId ?? null, direction: message.direction,
    messageType: message.messageType, bodyHash: hash(message.body ?? ""),
    receivedAt: iso(message.receivedAt), sentAt: iso(message.sentAt), createdAt: iso(message.createdAt), status: message.status,
    files: message.files.map((file: any) => ({ id: file.id, mimeType: file.mimeType, width: file.width, height: file.height,
      uploadStatus: file.uploadStatus, fileSize: file.fileSize ?? null, objectKeyHash: file.objectKey ? hash(file.objectKey) : null,
      updatedAt: iso(file.updatedAt) })),
    classification: classification ? {
      scope: classification.scope, source: classification.source, confidence: classification.confidence,
      confirmedAt: iso(classification.confirmedAt), evidenceHash: classification.evidence == null ? null : hash(classification.evidence),
      watchIds: classification.watchIds ?? classification.watchLinks?.map((link: any) => link.inquiryWatchId) ?? [],
    } : null,
    editable: message.editable ?? null, relatedRepairIds: message.relatedRepairIds ?? null,
  };
}

function outboxSnapshot(row: any) {
  return { id: row.id, status: row.status, textHash: hash(row.text), approvedAt: iso(row.approvedAt), createdAt: iso(row.createdAt), sourceRepairId: row.sourceRepairId ?? null };
}

export function approvalFingerprint(snapshot: unknown) { return hash(JSON.stringify(snapshot)); }

export function approvalUuid(target: Target, fingerprint: string, text: string) {
  const hex = hash(JSON.stringify([target.targetType, target.targetId, fingerprint, hash(text)]));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function getReplyApprovalContext(db: BridgeDb, target: Target) {
  const origin = await identity(db, target);
  const repairChat = target.targetType === "REPAIR" ? await getRepairLineChat(db, target.targetId) : null;
  const chat = target.targetType === "INQUIRY"
    ? await getInquiryLineChat(db, target.targetId)
    : repairChat;
  if (!chat) throw new BridgeNotFoundError();

  // The visible projection has limits. Inquiry fingerprinting reads every source row and
  // pending intent so an older row changing cannot leave a recent-200 approval valid.
  const messages = target.targetType === "INQUIRY"
    ? await db.inquiryMessage.findMany({ where: { inquiryId: target.targetId }, orderBy: { id: "asc" }, select: {
      id: true, lineUserId: true, direction: true, messageType: true, body: true, receivedAt: true, sentAt: true, createdAt: true, status: true,
      files: { orderBy: { id: "asc" }, select: { id: true, mimeType: true, fileSize: true, width: true, height: true, uploadStatus: true, objectKey: true, updatedAt: true } },
      classification: { select: { scope: true, source: true, confidence: true, evidence: true, confirmedAt: true,
        watchLinks: { orderBy: { inquiryWatchId: "asc" }, select: { inquiryWatchId: true } } } },
    } })
    : chat.messages;
  const pending = await db.lineManagerSendOutbox.findMany({
    where: target.targetType === "INQUIRY"
      ? { inquiryId: target.targetId, status: { notIn: ["CONFIRMED", "CANCELLED"] } }
      : { inquiryId: origin.sourceInquiryId ?? -1, sourceRepairId: target.targetId, status: { notIn: ["CONFIRMED", "CANCELLED"] } },
    orderBy: { id: "asc" },
    select: { id: true, status: true, text: true, approvedAt: true, createdAt: true, sourceRepairId: true },
  });
  const mapping = origin.lineUserId === null ? null : await db.lineManagerChat.findUnique({
    where: { lineUserId: origin.lineUserId }, select: { verifiedAt: true },
  });
  const sendAvailable = chat.sendAvailable && Boolean(mapping) && iso(mapping?.verifiedAt) === iso(chat.mappingVerifiedAt);
  const fileStorage = target.targetType === "REPAIR" && chat.messages.length
    ? await db.inquiryFile.findMany({
      where: { inquiryMessageId: { in: chat.messages.map((message: { id: number }) => message.id) } }, orderBy: { id: "asc" },
      select: { id: true, inquiryMessageId: true, objectKey: true, fileSize: true, updatedAt: true },
    }) : [];
  const snapshot = {
    version: 1, targetType: target.targetType, targetId: target.targetId,
    lineUserId: origin.lineUserId, sourceInquiryId: origin.sourceInquiryId,
    customerId: origin.customerId, linkedCustomerId: origin.linkedCustomerId,
    inquiryStatus: origin.inquiryStatus, lastReceivedAt: iso(origin.lastReceivedAt),
    promotionId: origin.promotionId, promotedAt: iso(origin.promotedAt),
    sendAvailable, mappingPresent: Boolean(mapping), mappingVerifiedAt: iso(chat.mappingVerifiedAt),
    messages: messages.map(messageSnapshot), pendingOutboxes: pending.map(outboxSnapshot),
    fileStorage: fileStorage.map((file) => ({ id: file.id, inquiryMessageId: file.inquiryMessageId, objectKeyHash: hash(file.objectKey), fileSize: file.fileSize, updatedAt: iso(file.updatedAt) })),
    hasEarlierMessages: chat.hasEarlierMessages,
    ...(repairChat ? { siblingRepairs: repairChat.siblingRepairs, watchOptions: repairChat.watchOptions } : {}),
  };
  return {
    targetType: target.targetType, targetId: target.targetId,
    approvalFingerprint: approvalFingerprint(snapshot),
    sendAvailable, mappingVerifiedAt: chat.mappingVerifiedAt,
    messages: chat.messages, pendingOutboxes: chat.pendingOutboxes, hasEarlierMessages: chat.hasEarlierMessages,
    ...(repairChat ? {
      customerId: origin.customerId, sourceInquiryId: origin.sourceInquiryId, promotedAt: origin.promotedAt,
      available: repairChat.available, siblingRepairs: repairChat.siblingRepairs, watchOptions: repairChat.watchOptions,
    } : {}),
  };
}

function rowOwnership(row: { inquiryId: number; sourceRepairId: number | null }, target: Target, origin: TargetIdentity) {
  return target.targetType === "INQUIRY"
    ? row.inquiryId === target.targetId && row.sourceRepairId === null
    : row.sourceRepairId === target.targetId && origin.sourceInquiryId !== null && row.inquiryId === origin.sourceInquiryId;
}

function safeApproval(row: { id: number; status: string; approvedAt: Date; createdAt: Date; confirmedAt?: Date | null; confirmedInquiryMessageId?: number | null }) {
  return { approvalId: row.id, status: row.status, approvedAt: row.approvedAt, createdAt: row.createdAt,
    sent: row.status === "CONFIRMED", ...(row.status === "CONFIRMED" ? { confirmedAt: row.confirmedAt ?? null, confirmedInquiryMessageId: row.confirmedInquiryMessageId ?? null } : {}) };
}

export async function approveReply(db: BridgeDb, input: ReturnType<typeof parseApproval>) {
  const target = { targetType: input.targetType, targetId: input.targetId };
  const before = await identity(db, target);
  if (before.lineUserId === null || before.sourceInquiryId === null) throw new BridgeUnavailableError();
  const uuid = approvalUuid(target, input.approvalFingerprint, input.text);
  const key = `${target.targetType === "INQUIRY" ? "inquiry" : "repair"}-line-reply:${target.targetId}:${uuid}`;
  try {
    return await db.$transaction(async (tx) => {
      await lockLineUserInquiryTransaction(tx, before.lineUserId!);
      const current = await identity(tx as unknown as BridgeDb, target);
      if (current.lineUserId !== before.lineUserId || current.sourceInquiryId !== before.sourceInquiryId ||
          current.customerId !== before.customerId || current.linkedCustomerId !== before.linkedCustomerId ||
          current.inquiryStatus !== before.inquiryStatus || iso(current.lastReceivedAt) !== iso(before.lastReceivedAt) ||
          current.promotionId !== before.promotionId || iso(current.promotedAt) !== iso(before.promotedAt)) throw new BridgeStaleError();
      // An exact retry remains identifiable even after its first APPROVED row changed the snapshot.
      const existing = await tx.lineManagerSendOutbox.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (!rowOwnership(existing, target, current) || existing.text !== input.text) throw new BridgeConflictError();
        return safeApproval(existing);
      }
      const context = await getReplyApprovalContext(tx as unknown as BridgeDb, target);
      if (context.approvalFingerprint !== input.approvalFingerprint) throw new BridgeStaleError();
      if (!context.sendAvailable) throw new BridgeUnavailableError();
      const item = target.targetType === "INQUIRY"
        ? await createInquiryLineReply(tx as unknown as BridgeDb, target.targetId, { text: input.text, idempotencyKey: uuid })
        : await createRepairLineReply(tx as unknown as BridgeDb, target.targetId, { text: input.text, idempotencyKey: uuid });
      return safeApproval({ id: item.id, status: item.status, approvedAt: item.approvedAt, createdAt: item.createdAt });
    }, { timeout: 20_000, isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2034") {
      throw new BridgeStaleError();
    }
    throw error;
  }
}

export async function getReplyApprovalStatus(db: BridgeDb, input: ReturnType<typeof parseStatus>) {
  const target = { targetType: input.targetType, targetId: input.targetId };
  let origin: TargetIdentity;
  try { origin = await identity(db, target); } catch (error) {
    if (error instanceof BridgeNotFoundError) throw error;
    throw error;
  }
  const row = await db.lineManagerSendOutbox.findUnique({ where: { id: input.approvalId }, select: {
    id: true, inquiryId: true, sourceRepairId: true, status: true, approvedAt: true, createdAt: true, confirmedAt: true, confirmedInquiryMessageId: true,
  } });
  if (!row || !rowOwnership(row, target, origin)) throw new BridgeNotFoundError();
  return safeApproval(row);
}

export function bridgeError(error: unknown): { status: number; code: string } {
  if (error instanceof BridgeInputError || error instanceof InquiryLineChatInputError) return { status: 400, code: "invalid_input" };
  if (error instanceof BridgeNotFoundError || error instanceof InquiryLineChatNotFoundError) return { status: 404, code: "not_found" };
  if (error instanceof BridgeStaleError) return { status: 409, code: "stale" };
  if (error instanceof BridgeUnavailableError || error instanceof InquiryLineChatUnavailableError) return { status: 409, code: "unavailable" };
  if (error instanceof BridgeConflictError || error instanceof LineManagerSendOutboxError) return { status: 409, code: "conflict" };
  return { status: 500, code: "internal_error" };
}
