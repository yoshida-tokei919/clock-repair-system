import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { PrismaClient } from "@prisma/client";

export class ObservedSyncInputError extends Error {}
export class ObservedSyncConflictError extends Error {}
export const MAX_IMPORT_BYTES = 1_100_000;
const MAX_EVENTS = 50;
const UNRESOLVED = ["APPROVED", "CLAIMED", "PRE_SEND_FAILED", "POST_UNCONFIRMED"] as const;
const VERSION = "observed-history-v1";
const validString = (v: unknown, max = 256): v is string => typeof v === "string" && v.length > 0 && v.length <= max && v.trim().length > 0;
const validId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

export function parseObservedStartAt(value: string | undefined, now: number): number {
  if (!value || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) throw new ObservedSyncInputError();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value || parsed.getTime() > now) throw new ObservedSyncInputError();
  return parsed.getTime();
}

// Worker attestation of a Manager read, not cryptographic proof from LINE.
export function verifyObservedSignature(raw: Buffer, timestamp: string | null, signature: string | null, key: string | undefined, now = Date.now()) {
  if (!key || !/^[a-f0-9]{64}$/.test(key) || !timestamp || !/^(0|[1-9]\d{0,11})$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(now - seconds * 1000) > 120_000) return false;
  const expected = createHmac("sha256", Buffer.from(key, "hex")).update(timestamp).update(".").update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function parseObservedBatch(value: unknown, now = Date.now(), startAt = process.env.LINE_MANAGER_SYNC_START_AT) {
  const cutoff = parseObservedStartAt(startAt, now);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ObservedSyncInputError();
  const batch = value as Record<string, unknown>;
  if (Object.keys(batch).some((key) => !["mappingId", "managerBotId", "managerChatId", "startAt", "events"].includes(key)) || batch.startAt !== startAt || typeof batch.startAt !== "string") throw new ObservedSyncInputError();
  if (!validId(batch.mappingId) || !validString(batch.managerBotId) || !validString(batch.managerChatId) || !Array.isArray(batch.events) || batch.events.length < 1 || batch.events.length > MAX_EVENTS) throw new ObservedSyncInputError();
  const seen = new Set<string>();
  const events = batch.events.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ObservedSyncInputError();
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some((key) => !["messageId", "text", "chatId", "timestamp", "verifiedAt", "sendId"].includes(key))) throw new ObservedSyncInputError();
    if (!validString(row.messageId) || !validString(row.text, 5000) || row.chatId !== batch.managerChatId || (row.sendId != null && !validString(row.sendId))) throw new ObservedSyncInputError();
    if (typeof row.timestamp !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.timestamp)) throw new ObservedSyncInputError();
    const sentAt = new Date(row.timestamp);
    if (!Number.isFinite(sentAt.getTime()) || sentAt.toISOString() !== row.timestamp || sentAt.getTime() < Date.UTC(2000, 0, 1) || sentAt.getTime() > now + 120_000 || sentAt.getTime() <= cutoff || seen.has(row.messageId)) throw new ObservedSyncInputError();
    if (typeof row.verifiedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.verifiedAt)) throw new ObservedSyncInputError();
    const verifiedAt = new Date(row.verifiedAt);
    if (!Number.isFinite(verifiedAt.getTime()) || verifiedAt.toISOString() !== row.verifiedAt || verifiedAt.getTime() < now - 120_000 || verifiedAt.getTime() > now + 120_000 || sentAt.getTime() > verifiedAt.getTime() + 120_000) throw new ObservedSyncInputError();
    seen.add(row.messageId);
    return { messageId: row.messageId as string, text: row.text as string, sentAt, verifiedAt, sendId: (row.sendId ?? null) as string | null };
  });
  return { mappingId: batch.mappingId, managerBotId: batch.managerBotId, managerChatId: batch.managerChatId, events };
}

export async function listObservedMappings(db: Pick<PrismaClient, "lineManagerChat">, afterId: number) {
  if (!Number.isSafeInteger(afterId) || afterId < 0) throw new ObservedSyncInputError();
  const rows = await db.lineManagerChat.findMany({ where: { id: { gt: afterId } }, orderBy: { id: "asc" }, take: 21, select: {
    id: true, lineUserId: true, managerBotId: true, managerChatId: true, evidenceInquiryMessageId: true, evidenceManagerMessageId: true,
    lineUser: { select: { linkedCustomerId: true } },
    evidenceMessage: { select: { id: true, direction: true, lineUserId: true, externalMessageId: true, inquiry: { select: { lineUserId: true } } } },
  } });
  const items = rows.slice(0, 20).map((row) => {
    if (!row.lineUser.linkedCustomerId || row.evidenceMessage.id !== row.evidenceInquiryMessageId || row.evidenceMessage.direction !== "INBOUND" || row.evidenceMessage.lineUserId !== row.lineUserId || row.evidenceMessage.inquiry.lineUserId !== row.lineUserId || row.evidenceMessage.externalMessageId !== row.evidenceManagerMessageId) throw new ObservedSyncConflictError();
    return { id: row.id, managerBotId: row.managerBotId, managerChatId: row.managerChatId };
  });
  return { items, nextAfterId: rows.length > 20 ? rows[19].id : null };
}

export async function importObservedBatch(db: Pick<PrismaClient, "$transaction">, raw: unknown, now = new Date(), startAt = process.env.LINE_MANAGER_SYNC_START_AT) {
  const batch = parseObservedBatch(raw, now.getTime(), startAt);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(203, 5)`;
    const mapping = await tx.lineManagerChat.findUnique({ where: { id: batch.mappingId }, select: {
      id: true, lineUserId: true, managerBotId: true, managerChatId: true, evidenceInquiryMessageId: true, evidenceManagerMessageId: true,
      lineUser: { select: { linkedCustomerId: true } },
      evidenceMessage: { select: { id: true, direction: true, lineUserId: true, externalMessageId: true, inquiry: { select: { lineUserId: true } } } },
    } });
    if (!mapping || !mapping.lineUser.linkedCustomerId || mapping.managerBotId !== batch.managerBotId || mapping.managerChatId !== batch.managerChatId || mapping.evidenceMessage.id !== mapping.evidenceInquiryMessageId || mapping.evidenceMessage.direction !== "INBOUND" || mapping.evidenceMessage.lineUserId !== mapping.lineUserId || mapping.evidenceMessage.inquiry.lineUserId !== mapping.lineUserId || mapping.evidenceMessage.externalMessageId !== mapping.evidenceManagerMessageId) throw new ObservedSyncConflictError();
    if (await tx.lineManagerSendOutbox.findFirst({ where: { lineManagerChatId: mapping.id, status: { in: [...UNRESOLVED] } }, select: { id: true } })) return { imported: 0, existing: 0, deferred: batch.events.length };
    let imported = 0, existing = 0, deferred = 0;
    for (const event of batch.events) {
      const outboxes = await tx.lineManagerSendOutbox.findMany({ where: { OR: [
        { confirmedManagerMessageId: event.messageId }, { sendId: event.messageId }, ...(event.sendId ? [{ sendId: event.sendId }] : []),
      ] }, select: { status: true, lineManagerChatId: true, managerBotIdSnapshot: true, managerChatIdSnapshot: true, confirmedManagerMessageId: true, confirmedInquiryMessageId: true, sendId: true, text: true } });
      if (outboxes.length > 1) throw new ObservedSyncConflictError();
      const outbox = outboxes[0];
      if (outbox && (outbox.status !== "CONFIRMED" || outbox.confirmedManagerMessageId !== event.messageId || outbox.lineManagerChatId !== mapping.id || outbox.managerBotIdSnapshot !== batch.managerBotId || outbox.managerChatIdSnapshot !== batch.managerChatId || outbox.text !== event.text || (event.sendId && event.sendId !== outbox.sendId))) throw new ObservedSyncConflictError();
      const source = await tx.inquiryMessage.findUnique({ where: { externalMessageId: event.messageId }, select: { id: true, lineUserId: true, direction: true, messageType: true, body: true, sentAt: true } });
      if (source && (source.lineUserId !== mapping.lineUserId || source.direction !== "OUTBOUND" || source.messageType !== "TEXT" || source.body !== event.text || source.sentAt?.getTime() !== event.sentAt.getTime())) throw new ObservedSyncConflictError();
      if (outbox && (!source || source.id !== outbox.confirmedInquiryMessageId)) throw new ObservedSyncConflictError();
      const prior = await tx.lineManagerObservedOutbound.findUnique({ where: { managerBotIdSnapshot_externalMessageId: { managerBotIdSnapshot: batch.managerBotId, externalMessageId: event.messageId } } });
      const digest = createHash("sha256").update(JSON.stringify([batch.managerBotId, batch.managerChatId, event.messageId, event.text, event.sentAt.toISOString(), event.sendId])).digest("hex");
      if (prior) {
        if (prior.lineUserId !== mapping.lineUserId || prior.lineManagerChatId !== mapping.id || prior.managerBotIdSnapshot !== batch.managerBotId || prior.managerChatIdSnapshot !== batch.managerChatId || prior.externalMessageId !== event.messageId || prior.messageType !== "TEXT" || prior.body !== event.text || prior.sentAt.getTime() !== event.sentAt.getTime() || prior.sourceKind !== "LINE_MANAGER_HISTORY" || prior.evidenceDigest !== digest || prior.verifierVersion !== VERSION) throw new ObservedSyncConflictError();
        existing++; continue;
      }
      if (source || outbox) { existing++; continue; }
      // A sendId alone cannot establish app or smartphone origin.
      await tx.lineManagerObservedOutbound.create({ data: { lineUserId: mapping.lineUserId, lineManagerChatId: mapping.id, managerBotIdSnapshot: batch.managerBotId, managerChatIdSnapshot: batch.managerChatId, externalMessageId: event.messageId, messageType: "TEXT", body: event.text, sentAt: event.sentAt, observedAt: now, verifiedAt: event.verifiedAt, sourceKind: "LINE_MANAGER_HISTORY", evidenceDigest: digest, verifierVersion: VERSION } });
      imported++;
    }
    return { imported, existing, deferred };
  }, { timeout: 20_000 });
}
