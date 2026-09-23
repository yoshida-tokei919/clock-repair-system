import type { PrismaClient } from "@prisma/client";

import {
  createApprovedLineManagerSendOutbox,
  type LineManagerSendOutboxDb,
} from "./line-manager-send-outbox";

const MESSAGE_LIMIT = 200;
const PENDING_OUTBOX_LIMIT = 20;
const MAX_REPLY_LENGTH = 5000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InquiryLineChatDb = LineManagerSendOutboxDb &
  Pick<PrismaClient, "inquiryMessage" | "lineManagerSendOutbox">;

export class InquiryLineChatInputError extends Error {}
export class InquiryLineChatNotFoundError extends Error {}
export class InquiryLineChatUnavailableError extends Error {}

function isPositiveSafeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parseInquiryLineReply(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InquiryLineChatInputError("Invalid LINE reply body");
  }

  const body = value as Record<string, unknown>;
  if (typeof body.text !== "string" || !body.text.trim()) {
    throw new InquiryLineChatInputError("LINE reply text is required");
  }
  if (body.text.length > MAX_REPLY_LENGTH) {
    throw new InquiryLineChatInputError(`LINE reply text must be at most ${MAX_REPLY_LENGTH} characters`);
  }
  if (typeof body.idempotencyKey !== "string" || !UUID_PATTERN.test(body.idempotencyKey)) {
    throw new InquiryLineChatInputError("A canonical UUID idempotency key is required");
  }

  return { text: body.text, idempotencyKey: body.idempotencyKey };
}

function effectiveMessageTime(message: {
  receivedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}) {
  return message.receivedAt ?? message.sentAt ?? message.createdAt;
}

export async function getInquiryLineChat(db: InquiryLineChatDb, inquiryId: number) {
  if (!isPositiveSafeId(inquiryId)) throw new InquiryLineChatInputError("Invalid inquiry ID");

  const inquiry = await db.inquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true,
      lineUser: {
        select: {
          lineManagerChat: {
            select: { verifiedAt: true },
          },
        },
      },
    },
  });

  if (!inquiry) return null;

  const [messageRows, pendingOutboxRows] = await Promise.all([
    db.inquiryMessage.findMany({
      where: { inquiryId },
      orderBy: { id: "desc" },
      take: MESSAGE_LIMIT + 1,
      select: {
        id: true,
        direction: true,
        messageType: true,
        body: true,
        receivedAt: true,
        sentAt: true,
        createdAt: true,
        status: true,
        files: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            mimeType: true,
            width: true,
            height: true,
            uploadStatus: true,
          },
        },
      },
    }),
    db.lineManagerSendOutbox.findMany({
      where: {
        inquiryId,
        status: { notIn: ["CONFIRMED", "CANCELLED"] },
      },
      orderBy: { id: "desc" },
      take: PENDING_OUTBOX_LIMIT,
      select: {
        id: true,
        text: true,
        status: true,
        approvedAt: true,
        createdAt: true,
      },
    }),
  ]);

  const hasEarlierMessages = messageRows.length > MESSAGE_LIMIT;
  const messages = messageRows
    .slice(0, MESSAGE_LIMIT)
    .sort((left, right) => {
      const timeDifference = effectiveMessageTime(left).getTime() - effectiveMessageTime(right).getTime();
      return timeDifference || left.id - right.id;
    })
    .map((message) => ({
      id: message.id,
      direction: message.direction,
      messageType: message.messageType,
      body: message.body,
      receivedAt: message.receivedAt,
      sentAt: message.sentAt,
      createdAt: message.createdAt,
      status: message.status,
      files: message.files.map((file) => ({
        id: file.id,
        mimeType: file.mimeType,
        width: file.width,
        height: file.height,
        uploadStatus: file.uploadStatus,
      })),
    }));

  const pendingOutboxes = pendingOutboxRows
    .slice()
    .sort((left, right) => left.approvedAt.getTime() - right.approvedAt.getTime() || left.id - right.id)
    .map((outbox) => ({
      id: outbox.id,
      text: outbox.text,
      status: outbox.status,
      approvedAt: outbox.approvedAt,
      createdAt: outbox.createdAt,
    }));

  return {
    inquiryId: inquiry.id,
    sendAvailable: Boolean(inquiry.lineUser.lineManagerChat),
    mappingVerifiedAt: inquiry.lineUser.lineManagerChat?.verifiedAt ?? null,
    messages,
    pendingOutboxes,
    hasEarlierMessages,
  };
}

type CreateApprovedOutbox = typeof createApprovedLineManagerSendOutbox;

export async function createInquiryLineReply(
  db: InquiryLineChatDb,
  inquiryId: number,
  rawBody: unknown,
  createApprovedOutbox: CreateApprovedOutbox = createApprovedLineManagerSendOutbox,
) {
  if (!isPositiveSafeId(inquiryId)) throw new InquiryLineChatInputError("Invalid inquiry ID");
  const input = parseInquiryLineReply(rawBody);

  const inquiry = await db.inquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true,
      lineUser: {
        select: {
          lineManagerChat: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (!inquiry) throw new InquiryLineChatNotFoundError("Inquiry not found");
  const mapping = inquiry.lineUser.lineManagerChat;
  if (!mapping) {
    throw new InquiryLineChatUnavailableError("Verified LINE Manager destination is not available");
  }

  const outbox = await createApprovedOutbox(db, {
    inquiryId,
    lineManagerChatId: mapping.id,
    text: input.text,
    idempotencyKey: `inquiry-line-reply:${inquiryId}:${input.idempotencyKey}`,
  });

  return {
    id: outbox.id,
    status: outbox.status,
    approvedAt: outbox.approvedAt,
    createdAt: outbox.createdAt,
  };
}

export const INQUIRY_LINE_CHAT_LIMITS = {
  MESSAGE_LIMIT,
  PENDING_OUTBOX_LIMIT,
  MAX_REPLY_LENGTH,
};