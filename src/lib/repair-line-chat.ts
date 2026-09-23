import type { PrismaClient } from "@prisma/client";
import { parseInquiryLineReply, InquiryLineChatInputError, InquiryLineChatNotFoundError, InquiryLineChatUnavailableError } from "./inquiry-line-chat";
import { createApprovedLineManagerSendOutbox, type LineManagerSendOutboxDb } from "./line-manager-send-outbox";

export type RepairLineChatDb = LineManagerSendOutboxDb & Pick<PrismaClient, "inquiryWatch" | "inquiryMessage">;
const MESSAGE_LIMIT = 200;
const PENDING_OUTBOX_LIMIT = 20;

export function filterRepairLineTimeline<T extends { relatedToCurrentRepair: boolean }>(items: T[], showFull: boolean): T[] {
  return showFull ? items : items.filter((item) => item.relatedToCurrentRepair);
}

async function origin(db: RepairLineChatDb, repairId: number) {
  if (!Number.isSafeInteger(repairId) || repairId <= 0) throw new InquiryLineChatInputError("Invalid Repair ID");
  const repair = await db.repair.findUnique({
    where: { id: repairId },
    select: { id: true, inquiryWatchPromotion: { select: { id: true, inquiryId: true, promotedRepairId: true, promotedAt: true, inquiry: { select: { lineUser: { select: { lineManagerChat: { select: { id: true, verifiedAt: true } } } } } } } } },
  });
  if (!repair) throw new InquiryLineChatNotFoundError("Repair not found");
  const promotion = repair.inquiryWatchPromotion;
  return promotion?.promotedRepairId === repairId ? promotion : null;
}

export async function getRepairLineChat(db: RepairLineChatDb, repairId: number) {
  const promotion = await origin(db, repairId);
  if (!promotion) return { available: false, sourceInquiryId: null, promotedAt: null, sendAvailable: false, mappingVerifiedAt: null, messages: [], pendingOutboxes: [], siblingRepairs: [], watchOptions: [], hasEarlierMessages: false, unassignedCount: 0 };
  const inquiryId = promotion.inquiryId;
  const [rows, outboxes, watches] = await Promise.all([
    db.inquiryMessage.findMany({
      where: { inquiryId }, orderBy: { id: "desc" }, take: MESSAGE_LIMIT + 1,
      select: {
        id: true, direction: true, messageType: true, body: true, receivedAt: true, sentAt: true, createdAt: true, status: true,
        files: { orderBy: { id: "asc" }, select: { id: true, mimeType: true, width: true, height: true, uploadStatus: true } },
        classification: { select: { scope: true, source: true, confidence: true, confirmedAt: true,
          watchLinks: { select: { inquiryWatchId: true } }, repairLinks: { select: { repairId: true } },
        } },
      },
    }),
    db.lineManagerSendOutbox.findMany({
      where: { inquiryId, status: { notIn: ["CONFIRMED", "CANCELLED"] } }, orderBy: { id: "desc" },
      take: PENDING_OUTBOX_LIMIT,
      select: { id: true, text: true, status: true, approvedAt: true, createdAt: true, sourceRepairId: true },
    }),
    db.inquiryWatch.findMany({
      where: { inquiryId }, orderBy: { position: "asc" },
      select: { id: true, position: true, label: true, promotedRepairId: true, promotedRepair: { select: { inquiryNumber: true } } },
    }),
  ]);
  const messages = rows.slice(0, MESSAGE_LIMIT).map((row) => ({
    id: row.id, direction: row.direction, messageType: row.messageType, body: row.body,
    receivedAt: row.receivedAt, sentAt: row.sentAt, createdAt: row.createdAt, status: row.status,
    files: row.files.map((file) => ({ id: file.id, mimeType: file.mimeType, width: file.width, height: file.height, uploadStatus: file.uploadStatus })),
    classification: row.classification ? { scope: row.classification.scope, source: row.classification.source, confidence: row.classification.confidence, confirmedAt: row.classification.confirmedAt, watchIds: row.classification.watchLinks.map((link) => link.inquiryWatchId) } : null,
    relatedRepairIds: row.classification?.repairLinks.map((link) => link.repairId) ?? [],
    relatedToCurrentRepair: row.classification?.repairLinks.some((link) => link.repairId === repairId) ?? false,
  })).sort((a, b) => {
    const at = (a.receivedAt ?? a.sentAt ?? a.createdAt).getTime();
    const bt = (b.receivedAt ?? b.sentAt ?? b.createdAt).getTime();
    return at - bt || a.id - b.id;
  });
  return {
    available: true, sourceInquiryId: inquiryId, promotedAt: promotion.promotedAt,
    sendAvailable: Boolean(promotion.inquiry.lineUser.lineManagerChat),
    mappingVerifiedAt: promotion.inquiry.lineUser.lineManagerChat?.verifiedAt ?? null,
    messages,
    pendingOutboxes: outboxes.map((row) => ({ id: row.id, text: row.text, status: row.status, approvedAt: row.approvedAt, createdAt: row.createdAt, relatedToCurrentRepair: row.sourceRepairId === repairId, relatedRepairIds: row.sourceRepairId ? [row.sourceRepairId] : [] })).sort((a, b) => a.approvedAt.getTime() - b.approvedAt.getTime() || a.id - b.id),
    siblingRepairs: watches.filter((watch) => watch.promotedRepairId !== null).map((watch) => ({ repairId: watch.promotedRepairId!, position: watch.position, label: watch.label, inquiryNumber: watch.promotedRepair?.inquiryNumber ?? null })),
    watchOptions: watches.map((watch) => ({ id: watch.id, position: watch.position, label: watch.label })),
    hasEarlierMessages: rows.length > MESSAGE_LIMIT,
    unassignedCount: messages.filter((message) => !message.classification || message.classification.scope === "UNASSIGNED").length,
  };
}

export async function createRepairLineReply(db: RepairLineChatDb, repairId: number, rawBody: unknown, createApproved = createApprovedLineManagerSendOutbox) {
  const input = parseInquiryLineReply(rawBody);
  const promotion = await origin(db, repairId);
  if (!promotion) throw new InquiryLineChatUnavailableError("Repair has no originating Inquiry");
  const mapping = promotion.inquiry.lineUser.lineManagerChat;
  if (!mapping) throw new InquiryLineChatUnavailableError("Verified LINE Manager destination is not available");
  const outbox = await createApproved(db, { inquiryId: promotion.inquiryId, lineManagerChatId: mapping.id, sourceRepairId: repairId, text: input.text, idempotencyKey: `repair-line-reply:${repairId}:${input.idempotencyKey}` });
  return { id: outbox.id, status: outbox.status, approvedAt: outbox.approvedAt, createdAt: outbox.createdAt };
}
