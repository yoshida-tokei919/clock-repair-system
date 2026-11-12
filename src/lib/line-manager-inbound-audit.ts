import type { PrismaClient } from "@prisma/client";

export class InboundAuditInputError extends Error {}
export class InboundAuditConflictError extends Error {}

const validString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);

export function parseInboundAuditBatch(raw: unknown, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InboundAuditInputError();
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).sort().join() !== "events,managerBotId,managerChatId,mappingId") throw new InboundAuditInputError();
  if (typeof body.mappingId !== "number" || !Number.isSafeInteger(body.mappingId) || body.mappingId <= 0 || !validString(body.managerBotId) || !validString(body.managerChatId) || !Array.isArray(body.events) || body.events.length > 100) throw new InboundAuditInputError();
  const seen = new Set<string>();
  const events = body.events.map((rawEvent: unknown) => {
    if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) throw new InboundAuditInputError();
    const event = rawEvent as Record<string, unknown>;
    if (Object.keys(event).sort().join() !== "messageId,timestamp,type" || !validString(event.messageId) || (event.type !== "text" && event.type !== "image") || typeof event.timestamp !== "number" || !Number.isSafeInteger(event.timestamp) || event.timestamp < Date.UTC(2000, 0, 1) || event.timestamp > now - 300_000 || seen.has(event.messageId)) throw new InboundAuditInputError();
    seen.add(event.messageId);
    return { messageId: event.messageId as string, type: event.type as "text" | "image", timestamp: event.timestamp as number };
  });
  return { mappingId: body.mappingId, managerBotId: body.managerBotId, managerChatId: body.managerChatId, events };
}

export async function compareInboundAudit(db: Pick<PrismaClient, "lineManagerChat" | "inquiryMessage" | "inquiryFile">, raw: unknown, now = Date.now()) {
  const batch = parseInboundAuditBatch(raw, now);
  const mapping = await db.lineManagerChat.findUnique({ where: { id: batch.mappingId }, select: {
    id: true, lineUserId: true, managerBotId: true, managerChatId: true, evidenceInquiryMessageId: true, evidenceManagerMessageId: true,
    lineUser: { select: { linkedCustomerId: true } },
    evidenceMessage: { select: { id: true, direction: true, lineUserId: true, externalMessageId: true, inquiry: { select: { lineUserId: true } } } },
  } });
  if (!mapping || !mapping.lineUser.linkedCustomerId || mapping.managerBotId !== batch.managerBotId || mapping.managerChatId !== batch.managerChatId || mapping.evidenceMessage.id !== mapping.evidenceInquiryMessageId || mapping.evidenceMessage.direction !== "INBOUND" || mapping.evidenceMessage.lineUserId !== mapping.lineUserId || mapping.evidenceMessage.inquiry.lineUserId !== mapping.lineUserId || mapping.evidenceMessage.externalMessageId !== mapping.evidenceManagerMessageId) throw new InboundAuditConflictError();
  if (batch.events.length === 0) return { status: "recent_page_compared", eligibleCount: 0, missingMessageCount: 0, missingImageCount: 0, mismatchCount: 0, historyComplete: false };
  const messages = await db.inquiryMessage.findMany({ where: { externalMessageId: { in: batch.events.map((event) => event.messageId) } }, select: {
    id: true, inquiryId: true, externalMessageId: true, lineUserId: true, direction: true, messageType: true, inquiry: { select: { lineUserId: true } },
  } });
  const byExternalId = new Map(messages.map((message) => [message.externalMessageId, message]));
  const images = messages.filter((message) => message.messageType === "IMAGE" && message.direction === "INBOUND" && message.lineUserId === mapping.lineUserId && message.inquiry.lineUserId === mapping.lineUserId && batch.events.some((event) => event.messageId === message.externalMessageId && event.type === "image"));
  const files = images.length ? await db.inquiryFile.findMany({ where: { provider: "LINE", providerFileId: { in: images.map((message) => message.externalMessageId) } }, select: { inquiryMessageId: true, inquiryId: true, providerFileId: true, uploadStatus: true } }) : [];
  const byProviderFileId = new Map(files.map((file) => [file.providerFileId, file]));
  let missingMessageCount = 0, missingImageCount = 0, mismatchCount = 0;
  for (const event of batch.events) {
    const message = byExternalId.get(event.messageId);
    if (!message) { missingMessageCount++; continue; }
    if (message.lineUserId !== mapping.lineUserId || message.inquiry.lineUserId !== mapping.lineUserId || message.direction !== "INBOUND" || message.messageType !== (event.type === "text" ? "TEXT" : "IMAGE")) { mismatchCount++; continue; }
    if (event.type === "image") {
      const file = byProviderFileId.get(event.messageId);
      if (!file || file.inquiryMessageId !== message.id || file.inquiryId !== message.inquiryId || file.uploadStatus !== "STORED") missingImageCount++;
    }
  }
  return { status: "recent_page_compared", eligibleCount: batch.events.length, missingMessageCount, missingImageCount, mismatchCount, historyComplete: false };
}
