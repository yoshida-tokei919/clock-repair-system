import type { Prisma } from "@prisma/client";
import {
  cancelLineManagerSendOutbox,
  claimLineManagerReconciliation,
  confirmLineManagerSendOutbox,
  fenceLineManagerPostAttempt,
  LineManagerSendOutboxError,
  markLineManagerPreSendFailed,
  safeClaimLineManagerSendOutbox,
  type LineManagerSendOutboxDb,
} from "./line-manager-send-outbox";

const CANDIDATE_SCAN_LIMIT = 20;

type OutboxRow = Awaited<ReturnType<LineManagerSendOutboxDb["lineManagerSendOutbox"]["findUnique"]>>;

export class LineManagerSenderInputError extends Error {}

/** Converts request JSON parse failures into the same client-input error used by sender routes. */
export async function parseLineManagerSenderJson(request: { json(): Promise<unknown> }) {
  try {
    return await request.json();
  } catch {
    throw new LineManagerSenderInputError("Invalid JSON");
  }
}

function isPositiveSafeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function requireNonemptyString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) throw new LineManagerSenderInputError(`${name} is required`);
  return value;
}

export function parseLineManagerSenderId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) throw new LineManagerSenderInputError("Invalid outbox id");
  const id = Number(value);
  if (!isPositiveSafeId(id)) throw new LineManagerSenderInputError("Invalid outbox id");
  return id;
}

export function parseClaimAcknowledgement(value: unknown) {
  const body = value as Record<string, unknown> | null;
  return {
    claimToken: requireNonemptyString(body?.claimToken, "claimToken"),
    error: body?.error === undefined ? "LINE Manager pre-send failed" : requireNonemptyString(body.error, "error"),
  };
}

export function parseReconciliationAcknowledgement(value: unknown) {
  const body = value as Record<string, unknown> | null;
  return { reconciliationToken: requireNonemptyString(body?.reconciliationToken, "reconciliationToken") };
}

export function parseLineManagerConfirmation(value: unknown) {
  const body = value as Record<string, unknown> | null;
  const timestampText = requireNonemptyString(body?.timestamp, "timestamp");
  const timestamp = new Date(timestampText);
  if (Number.isNaN(timestamp.getTime())) throw new LineManagerSenderInputError("timestamp must be valid");
  return {
    reconciliationToken: requireNonemptyString(body?.reconciliationToken, "reconciliationToken"),
    actualMessageId: requireNonemptyString(body?.actualMessageId, "actualMessageId"),
    text: requireNonemptyString(body?.text, "text"),
    timestamp,
    managerBotId: requireNonemptyString(body?.managerBotId, "managerBotId"),
    managerChatId: requireNonemptyString(body?.managerChatId, "managerChatId"),
  };
}

function senderCandidateWhere(now: Date): Prisma.LineManagerSendOutboxWhereInput {
  return { OR: [{ status: { in: ["APPROVED", "PRE_SEND_FAILED"] } }, { status: "CLAIMED", claimLeaseExpiresAt: { lt: now } }] };
}

function reconciliationCandidateWhere(now: Date): Prisma.LineManagerSendOutboxWhereInput {
  return { status: "POST_UNCONFIRMED", OR: [{ reconciliationToken: null }, { reconciliationLeaseExpiresAt: { lt: now } }] };
}

function sendItem(row: NonNullable<OutboxRow>, claimToken: string) {
  return {
    id: row.id, inquiryId: row.inquiryId, text: row.text, sendId: row.sendId,
    managerBotId: row.managerBotIdSnapshot, managerChatId: row.managerChatIdSnapshot,
    claimToken, status: row.status, approvedAt: row.approvedAt, claimedAt: row.claimedAt,
    claimLeaseExpiresAt: row.claimLeaseExpiresAt, lastAttemptAt: row.lastAttemptAt,
  };
}

function reconciliationItem(row: NonNullable<OutboxRow>, reconciliationToken: string) {
  return {
    id: row.id, inquiryId: row.inquiryId, text: row.text, sendId: row.sendId,
    managerBotId: row.managerBotIdSnapshot, managerChatId: row.managerChatIdSnapshot,
    reconciliationToken, status: row.status, approvedAt: row.approvedAt,
    postAttemptedAt: row.postAttemptedAt, reconciliationLeaseExpiresAt: row.reconciliationLeaseExpiresAt,
    lastHistoryCheckedAt: row.lastHistoryCheckedAt,
  };
}

export async function claimLineManagerSenderWork(db: LineManagerSendOutboxDb, now = new Date()) {
  const candidates = await db.lineManagerSendOutbox.findMany({
    where: senderCandidateWhere(now), orderBy: { id: "asc" }, take: CANDIDATE_SCAN_LIMIT, select: { id: true },
  });
  for (const candidate of candidates) {
    const claimed = await safeClaimLineManagerSendOutbox(db, { id: candidate.id, now });
    if (claimed) return sendItem(claimed.outbox, claimed.claimToken);
  }
  return null;
}

export async function claimLineManagerReconciliationWork(db: LineManagerSendOutboxDb, now = new Date()) {
  const candidates = await db.lineManagerSendOutbox.findMany({
    where: reconciliationCandidateWhere(now), orderBy: { id: "asc" }, take: CANDIDATE_SCAN_LIMIT, select: { id: true },
  });
  for (const candidate of candidates) {
    const claimed = await claimLineManagerReconciliation(db, { id: candidate.id, now });
    if (claimed) return reconciliationItem(claimed.outbox, claimed.reconciliationToken);
  }
  return null;
}

export async function acknowledgeLineManagerPreSendFailure(db: LineManagerSendOutboxDb, id: number, body: unknown) {
  const input = parseClaimAcknowledgement(body);
  return markLineManagerPreSendFailed(db, { id, ...input });
}

export async function fenceLineManagerSenderPost(db: LineManagerSendOutboxDb, id: number, body: unknown) {
  const input = parseClaimAcknowledgement(body);
  return fenceLineManagerPostAttempt(db, { id, claimToken: input.claimToken });
}

export async function confirmLineManagerSenderWork(db: LineManagerSendOutboxDb, id: number, body: unknown) {
  const input = parseLineManagerConfirmation(body);
  return confirmLineManagerSendOutbox(db, { id, ...input });
}

export async function cancelLineManagerSenderWork(db: LineManagerSendOutboxDb, id: number) {
  return cancelLineManagerSendOutbox(db, { id });
}

export const LINE_MANAGER_SENDER_INTERNAL_LIMITS = { CANDIDATE_SCAN_LIMIT };
export { LineManagerSendOutboxError };
