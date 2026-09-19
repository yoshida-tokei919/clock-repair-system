import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

export type InquiryAiContextDb = Pick<PrismaClient, "inquiry">;
export type InquiryFileSignedReadUrl = (key: string, expiresIn?: number) => Promise<string>;

const PENDING_STATUSES = ["OPEN", "AI_PENDING", "NEEDS_REVIEW"] as const;
export const INQUIRY_AI_PENDING_DEFAULT_LIMIT = 20;
export const INQUIRY_AI_PENDING_MAX_LIMIT = 50;

type FingerprintMessage = {
  id: number;
  direction: string;
  messageType: string;
  body: string | null;
  receivedAt: Date | null;
  sentAt: Date | null;
  status: string;
  createdAt: Date;
};

type FingerprintFile = {
  id: number;
  inquiryMessageId?: number | null;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  uploadStatus: string;
  objectKey: string;
  createdAt: Date;
  updatedAt?: Date;
};

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function bodyHash(body: string | null) {
  return body === null ? null : createHash("sha256").update(body).digest("hex");
}

/** Server-owned, URL-free input record retained with an AI snapshot. */
export function buildInquiryAiInputSnapshot(input: {
  inquiryId: number;
  messages: FingerprintMessage[];
  files: FingerprintFile[];
}) {
  return {
    inquiryId: input.inquiryId,
    messages: [...input.messages]
      .sort((a, b) => a.id - b.id)
      .map((message) => ({
        id: message.id,
        direction: message.direction,
        messageType: message.messageType,
        bodyHash: bodyHash(message.body),
        receivedAt: iso(message.receivedAt),
        sentAt: iso(message.sentAt),
        status: message.status,
        createdAt: iso(message.createdAt),
      })),
    files: input.files
      .filter((file) => file.uploadStatus === "STORED")
      .sort((a, b) => a.id - b.id)
      .map((file) => ({
        id: file.id,
        inquiryMessageId: file.inquiryMessageId ?? null,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        width: file.width,
        height: file.height,
        uploadStatus: file.uploadStatus,
        objectKey: file.objectKey,
        createdAt: iso(file.createdAt),
        updatedAt: iso(file.updatedAt),
      })),
  };
}

export function fingerprintInquiryAiInput(snapshot: ReturnType<typeof buildInquiryAiInputSnapshot>) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function identity(lineUser: {
  displayName: string | null;
  linkedCustomer: { id: number; name: string; type: string } | null;
}) {
  if (lineUser.linkedCustomer) {
    return {
      identity: "existing" as const,
      displayName: lineUser.linkedCustomer.name,
      customer: lineUser.linkedCustomer,
    };
  }
  return {
    identity: "unregistered" as const,
    displayName: lineUser.displayName ?? "LINE display name unavailable",
  };
}

function conversationTimestamp(message: {
  direction: string;
  receivedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}) {
  return message.direction === "INBOUND"
    ? (message.receivedAt ?? message.sentAt ?? message.createdAt)
    : (message.sentAt ?? message.receivedAt ?? message.createdAt);
}

export async function listPendingInquiryAiContexts(
  db: InquiryAiContextDb,
  input: { limit?: number } = {},
) {
  const requestedLimit = input.limit ?? INQUIRY_AI_PENDING_DEFAULT_LIMIT;
  const take = Math.max(1, Math.min(requestedLimit, INQUIRY_AI_PENDING_MAX_LIMIT));
  const inquiries = await db.inquiry.findMany({
    where: { status: { in: [...PENDING_STATUSES] } },
    orderBy: { lastReceivedAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      firstReceivedAt: true,
      lastReceivedAt: true,
      lineUser: {
        select: {
          displayName: true,
          linkedCustomer: { select: { id: true, name: true, type: true } },
        },
      },
      _count: {
        select: {
          messages: true,
          files: { where: { uploadStatus: "STORED" } },
        },
      },
    },
  });
  return inquiries.map((inquiry) => ({
    inquiryId: inquiry.id,
    status: inquiry.status,
    firstReceivedAt: inquiry.firstReceivedAt,
    lastReceivedAt: inquiry.lastReceivedAt,
    ...identity(inquiry.lineUser),
    messageCount: inquiry._count.messages,
    storedImageCount: inquiry._count.files,
  }));
}

export async function getInquiryAiContext(
  db: InquiryAiContextDb,
  inquiryId: number,
  getSignedReadUrl: InquiryFileSignedReadUrl,
) {
  const inquiry = await db.inquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true,
      status: true,
      firstReceivedAt: true,
      lastReceivedAt: true,
      lineUser: {
        select: {
          id: true,
          displayName: true,
          linkedCustomer: { select: { id: true, name: true, type: true } },
        },
      },
      messages: {
        select: {
          id: true,
          direction: true,
          messageType: true,
          body: true,
          receivedAt: true,
          sentAt: true,
          status: true,
          createdAt: true,
        },
      },
      files: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          mimeType: true,
          fileSize: true,
          width: true,
          height: true,
          uploadStatus: true,
          objectKey: true,
          createdAt: true,
          updatedAt: true,
          inquiryMessageId: true,
        },
      },
    },
  });
  if (!inquiry) return null;

  const inputSnapshot = buildInquiryAiInputSnapshot({
    inquiryId: inquiry.id,
    messages: inquiry.messages,
    files: inquiry.files,
  });
  const inputFingerprint = fingerprintInquiryAiInput(inputSnapshot);

  const messages = [...inquiry.messages].sort((left, right) => {
    const timestampDifference = conversationTimestamp(left).getTime() - conversationTimestamp(right).getTime();
    if (timestampDifference !== 0) return timestampDifference;
    const createdAtDifference = left.createdAt.getTime() - right.createdAt.getTime();
    if (createdAtDifference !== 0) return createdAtDifference;
    return left.id - right.id;
  });

  const contextIdentity = inquiry.lineUser.linkedCustomer
    ? {
        identity: "existing" as const,
        customer: inquiry.lineUser.linkedCustomer,
      }
    : {
        identity: "unregistered" as const,
        lineUser: {
          id: inquiry.lineUser.id,
          displayName: inquiry.lineUser.displayName ?? "LINE display name unavailable",
        },
      };

  return {
    inquiryId: inquiry.id,
    status: inquiry.status,
    firstReceivedAt: inquiry.firstReceivedAt,
    lastReceivedAt: inquiry.lastReceivedAt,
    inputFingerprint,
    ...contextIdentity,
    messages,
    files: await Promise.all(inquiry.files.map(async (file) => ({
      id: file.id,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      width: file.width,
      height: file.height,
      uploadStatus: file.uploadStatus,
      createdAt: file.createdAt,
      signedReadUrl: file.uploadStatus === "STORED"
        ? await getSignedReadUrl(file.objectKey, 300)
        : null,
    }))),
  };
}
