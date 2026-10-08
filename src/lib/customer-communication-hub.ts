import type { PrismaClient } from "@prisma/client";

export type CustomerCommunicationDb = Pick<PrismaClient, "customer" | "lineUser" | "inquiry" | "inquiryMessage" | "lineManagerSendOutbox">;

const CUSTOMER_MESSAGE_LIMIT = 500;
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
    select: { id: true, displayName: true, lineManagerChat: { select: { verifiedAt: true } } },
  });
  const lineUserIds = lineUsers.map((user) => user.id);
  const destinations = await Promise.all(lineUsers.filter((user) => user.lineManagerChat).map(async (user) => ({
    lineUserId: user.id,
    label: user.displayName || `LINEユーザー #${user.id}`,
    verifiedAt: user.lineManagerChat!.verifiedAt,
    sendAvailable: Boolean(await db.inquiry.findFirst({ where: { lineUserId: user.id }, select: { id: true } })),
  })));
  if (lineUserIds.length === 0) return { customer, lineUsers, destinations, messages: [], pendingOutboxes: [], hasEarlierMessages: false };

  // Apply one customer-level limit across all linked LineUsers and Inquiries,
  // including CLOSED Inquiries. The extra row signals earlier saved messages.
  const [rows, pendingRows] = await Promise.all([db.inquiryMessage.findMany({
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
  })]);

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
    }))
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id - right.id);

  const pendingOutboxes = pendingRows
    .filter((row) => row.inquiry.lineUserId === row.lineManagerChat.lineUserId &&
      lineUserIds.includes(row.inquiry.lineUserId) &&
      row.idempotencyKey.startsWith(`customer-line-reply:${customerId}:${row.inquiry.lineUserId}:`))
    .map((row) => ({ id: row.id, lineUserId: row.inquiry.lineUserId, text: row.text, status: row.status, approvedAt: row.approvedAt }))
    .sort((left, right) => left.approvedAt.getTime() - right.approvedAt.getTime() || left.id - right.id);

  return { customer, lineUsers, destinations, messages, pendingOutboxes, hasEarlierMessages };
}
