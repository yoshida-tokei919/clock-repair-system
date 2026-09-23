import type { Prisma, PrismaClient } from "@prisma/client";
import { createVerifiedLineManagerChat, type LineManagerSendOutboxDb } from "./line-manager-send-outbox";

const CANDIDATE_LIMIT = 20;
const EVIDENCE_LIMIT = 5;

export type LineManagerMappingDb = Pick<PrismaClient, "lineUser"> & LineManagerSendOutboxDb;

export class LineManagerMappingInputError extends Error {}

function isPositiveSafeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function requireNonblankString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new LineManagerMappingInputError(`${field} is required`);
  return value;
}

/** Parses only the immutable fields required to verify a Manager destination. */
export function parseLineManagerMappingVerification(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LineManagerMappingInputError("Invalid JSON body");
  const body = value as Record<string, unknown>;
  if (!isPositiveSafeId(body.lineUserId)) throw new LineManagerMappingInputError("lineUserId must be a positive safe integer");
  if (!isPositiveSafeId(body.evidenceInquiryMessageId)) throw new LineManagerMappingInputError("evidenceInquiryMessageId must be a positive safe integer");
  return {
    lineUserId: body.lineUserId,
    evidenceInquiryMessageId: body.evidenceInquiryMessageId,
    evidenceManagerMessageId: requireNonblankString(body.evidenceManagerMessageId, "evidenceManagerMessageId"),
    managerBotId: requireNonblankString(body.managerBotId, "managerBotId"),
    managerChatId: requireNonblankString(body.managerChatId, "managerChatId"),
  };
}

/** Returns privacy-minimized immutable inbound evidence for at most 20 unmapped LINE users. */
export async function listLineManagerMappingCandidates(db: Pick<PrismaClient, "lineUser">) {
  const rows = await db.lineUser.findMany({
    where: {
      lineManagerChat: null,
      inquiryMessages: { some: { direction: "INBOUND", externalMessageId: { not: "" } } },
    },
    orderBy: [{ lastReceivedAt: "desc" }, { id: "desc" }],
    take: CANDIDATE_LIMIT,
    select: {
      id: true,
      inquiryMessages: {
        where: { direction: "INBOUND", externalMessageId: { not: "" } },
        orderBy: [{ receivedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
        take: EVIDENCE_LIMIT,
        select: { id: true, externalMessageId: true, receivedAt: true },
      },
    },
  });
  return rows.map((row) => ({
    lineUserId: row.id,
    evidence: row.inquiryMessages
      .filter((message) => typeof message.externalMessageId === "string" && message.externalMessageId.trim().length > 0)
      .map((message) => ({ inquiryMessageId: message.id, externalMessageId: message.externalMessageId, receivedAt: message.receivedAt })),
  })).filter((row) => row.evidence.length > 0);
}

export async function verifyLineManagerMapping(
  db: LineManagerMappingDb,
  body: unknown,
  create: typeof createVerifiedLineManagerChat = createVerifiedLineManagerChat,
) {
  const input = parseLineManagerMappingVerification(body);
  const row = await create(db, input);
  return { id: row.id, lineUserId: row.lineUserId, verifiedAt: row.verifiedAt };
}

export const LINE_MANAGER_MAPPING_INTERNAL_LIMITS = { CANDIDATE_LIMIT, EVIDENCE_LIMIT };
export type LineManagerMappingCandidateWhere = Prisma.LineUserWhereInput;
