import type { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { getCustomerRoutingRevision } from "./communication-routing-revision";
import { getCustomerSummaryHistoryRevision } from "./communication-summary-revision";
import { getCustomerPendingOutboxRevision } from "./communication-pending-outbox-revision";

export type CustomerCommunicationDb = Pick<PrismaClient, "customer" | "lineUser" | "inquiry" | "inquiryMessage" | "lineManagerSendOutbox">;

const CUSTOMER_MESSAGE_LIMIT = 500;
const INQUIRY_SUMMARY_LIMIT = 20;
const PENDING_OUTBOX_LIMIT = 20;
const PENDING_STATUSES = ["APPROVED", "CLAIMED", "PRE_SEND_FAILED", "POST_UNCONFIRMED"] as const;

export function occurredAt(message: {
  direction: "INBOUND" | "OUTBOUND";
  receivedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}) {
  return (message.direction === "INBOUND" ? message.receivedAt : message.sentAt) ?? message.createdAt;
}

export async function getCustomerCommunicationHub(db: CustomerCommunicationDb, customerId: number) {
  if (!Number.isSafeInteger(customerId) || customerId <= 0) return null;

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, type: true, name: true, companyName: true },
  });
  if (!customer) return null;

  const lineUsers = await db.lineUser.findMany({
    where: { linkedCustomerId: customerId },
    orderBy: { id: "asc" },
    select: { id: true, displayName: true, lineManagerChat: { select: { id: true, evidenceInquiryMessageId: true, verifiedAt: true, updatedAt: true } } },
  });
  const lineUserIds = lineUsers.map((user) => user.id);
  const destinations = await Promise.all(lineUsers.filter((user) => user.lineManagerChat).map(async (user) => ({
    lineUserId: user.id,
    label: user.displayName || `LINEユーザー #${user.id}`,
    verifiedAt: user.lineManagerChat!.verifiedAt,
    sendAvailable: Boolean(await db.inquiry.findFirst({ where: { lineUserId: user.id }, select: { id: true } })),
  })));
  // Mapping identity stays on the server. Only its digest joins the AI fingerprint.
  const destinationRevision = createHash("sha256").update(JSON.stringify(lineUsers
    .filter((user) => destinations.some((destination) => destination.lineUserId === user.id && destination.sendAvailable))
    .map((user) => ({ lineUserId: user.id, mappingId: user.lineManagerChat!.id,
      evidenceInquiryMessageId: user.lineManagerChat!.evidenceInquiryMessageId,
      verifiedAt: user.lineManagerChat!.verifiedAt, updatedAt: user.lineManagerChat!.updatedAt })))).digest("hex");
  if (lineUserIds.length === 0) return { customer, lineUsers, destinations, inquirySummaries: [], messages: [], pendingOutboxes: [], hasEarlierMessages: false, hasEarlierInquirySummaries: false, routingRevision: "", summaryHistoryRevision: "", pendingOutboxRevision: createHash("sha256").digest("hex"), destinationRevision };

  // Apply one customer-level limit across all linked LineUsers and Inquiries,
  // including CLOSED Inquiries. The extra row signals earlier saved messages.
  const [rows, pendingRows, summaryRows, routingRevision, summaryHistoryRevision, pendingOutboxRevision] = await Promise.all([db.inquiryMessage.findMany({
    where: {
      lineUserId: { in: lineUserIds },
      lineUser: { linkedCustomerId: customerId },
      inquiry: {
        lineUserId: { in: lineUserIds },
        lineUser: { linkedCustomerId: customerId },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CUSTOMER_MESSAGE_LIMIT + 1,
    select: {
      id: true,
      inquiryId: true,
      lineUserId: true,
      direction: true,
      messageType: true,
      body: true,
      receivedAt: true,
      sentAt: true,
      createdAt: true,
      inquiry: { select: { status: true, lineUserId: true } },
      files: {
        orderBy: { id: "asc" },
        select: { id: true, mimeType: true, uploadStatus: true },
      },
      classification: { select: {
        scope: true, source: true, confidence: true, confirmedAt: true,
        watchLinks: { select: { inquiryWatchId: true } },
        repairLinks: { select: { repairId: true, repair: { select: { customerId: true } } } },
      } },
      postIntakeRouting: { select: {
        customerId: true, source: true, confidence: true, hasGeneralContent: true,
        hasUnassignedContent: true, confirmedAt: true,
        repairLinks: { select: { repairId: true, customerId: true, repair: { select: { customerId: true } } } },
      } },
    },
  }), db.lineManagerSendOutbox.findMany({
    where: {
      idempotencyKey: { startsWith: `customer-line-reply:${customerId}:` },
      sourceRepairId: null,
      status: { in: [...PENDING_STATUSES] },
      inquiry: { lineUserId: { in: lineUserIds }, lineUser: { linkedCustomerId: customerId } },
      lineManagerChat: { lineUserId: { in: lineUserIds }, lineUser: { linkedCustomerId: customerId } },
    },
    orderBy: [{ approvedAt: "desc" }, { id: "desc" }],
    take: PENDING_OUTBOX_LIMIT,
    select: {
      id: true, idempotencyKey: true, text: true, status: true, approvedAt: true,
      inquiry: { select: { lineUserId: true } },
      lineManagerChat: { select: { lineUserId: true } },
    },
  }), db.inquiry.findMany({
    where: {
      lineUserId: { in: lineUserIds },
      lineUser: { linkedCustomerId: customerId },
      conversationSummary: { not: null },
    },
    orderBy: [{ lastReceivedAt: "desc" }, { id: "desc" }],
    take: INQUIRY_SUMMARY_LIMIT + 1,
    select: {
      id: true, status: true, conversationSummary: true, firstReceivedAt: true, lastReceivedAt: true,
      analyses: {
        where: { status: { not: "FAILED" }, conversationSummary: { not: null } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { completedAt: true, createdAt: true },
      },
    },
  }), getCustomerRoutingRevision(db, customerId), getCustomerSummaryHistoryRevision(db, customerId), getCustomerPendingOutboxRevision(db, customerId)]);

  const hasEarlierInquirySummaries = summaryRows.length > INQUIRY_SUMMARY_LIMIT;
  const inquirySummaries = summaryRows.slice(0, INQUIRY_SUMMARY_LIMIT)
    .filter((row) => Boolean(row.conversationSummary?.trim()))
    .map((row) => ({
      inquiryId: row.id,
      status: row.status,
      summary: row.conversationSummary!.trim(),
      firstReceivedAt: row.firstReceivedAt,
      lastReceivedAt: row.lastReceivedAt,
      analysisCompletedAt: row.analyses[0]?.completedAt ?? row.analyses[0]?.createdAt ?? null,
    }));

  const hasEarlierMessages = rows.length > CUSTOMER_MESSAGE_LIMIT;
  const messages = rows.slice(0, CUSTOMER_MESSAGE_LIMIT)
    .filter((row) => row.lineUserId === row.inquiry.lineUserId)
    .map((row) => ({
      id: row.id,
      channel: "LINE" as const,
      inquiryId: row.inquiryId,
      inquiryStatus: row.inquiry.status,
      lineUserId: row.lineUserId,
      direction: row.direction,
      messageType: row.messageType,
      body: row.body,
      occurredAt: occurredAt(row),
      files: row.files.map((file) => ({
        id: file.id,
        mimeType: file.mimeType,
        uploadStatus: file.uploadStatus,
      })),
      classification: row.classification ? {
        scope: row.classification.scope, source: row.classification.source,
        confidence: row.classification.confidence, confirmedAt: row.classification.confirmedAt,
        watchIds: row.classification.watchLinks.map((link) => link.inquiryWatchId).sort((a, b) => a - b),
        repairIds: row.classification.repairLinks.filter((link) => link.repair.customerId === customerId).map((link) => link.repairId).sort((a, b) => a - b),
      } : null,
      postIntakeRouting: row.postIntakeRouting?.customerId === customerId ? {
        source: row.postIntakeRouting.source, confidence: row.postIntakeRouting.confidence,
        hasGeneralContent: row.postIntakeRouting.hasGeneralContent,
        hasUnassignedContent: row.postIntakeRouting.hasUnassignedContent,
        confirmedAt: row.postIntakeRouting.confirmedAt,
        repairIds: row.postIntakeRouting.repairLinks.filter((link) => link.customerId === customerId && link.repair.customerId === customerId).map((link) => link.repairId).sort((a, b) => a - b),
      } : null,
    }))
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id - right.id);

  const pendingOutboxes = pendingRows
    .filter((row) => row.inquiry.lineUserId === row.lineManagerChat.lineUserId &&
      lineUserIds.includes(row.inquiry.lineUserId) &&
      row.idempotencyKey.startsWith(`customer-line-reply:${customerId}:${row.inquiry.lineUserId}:`))
    .map((row) => ({ id: row.id, lineUserId: row.inquiry.lineUserId, text: row.text, status: row.status, approvedAt: row.approvedAt }))
    .sort((left, right) => left.approvedAt.getTime() - right.approvedAt.getTime() || left.id - right.id);

  return { customer, lineUsers, destinations, inquirySummaries, messages, pendingOutboxes, hasEarlierMessages, hasEarlierInquirySummaries, routingRevision, summaryHistoryRevision, pendingOutboxRevision, destinationRevision };
}
