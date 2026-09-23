import type { PrismaClient } from "@prisma/client";
import { reconcileInquiryMessageRepairLinks } from "./inquiry-message-repair-links";
import { lockLineUserInquiryTransaction } from "./inquiry-transaction-lock";

import {
  createApprovedLineManagerSendOutbox,
  type LineManagerSendOutboxDb,
} from "./line-manager-send-outbox";

const MESSAGE_LIMIT = 200;
const PENDING_OUTBOX_LIMIT = 20;
const MAX_REPLY_LENGTH = 5000;
const MAX_CLASSIFICATION_WATCHES = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLASSIFICATION_SCOPES = ["WATCHES", "COMMON", "UNASSIGNED"] as const;

export type InquiryLineChatDb = LineManagerSendOutboxDb &
  Pick<PrismaClient, "inquiryMessage" | "lineManagerSendOutbox" | "inquiryWatch">;

export type InquiryMessageClassificationScope = (typeof CLASSIFICATION_SCOPES)[number];

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

export function parseInquiryMessageClassification(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InquiryLineChatInputError("Invalid LINE classification body");
  }

  const body = value as Record<string, unknown>;
  if (!isPositiveSafeId(body.messageId)) {
    throw new InquiryLineChatInputError("messageId is required");
  }
  if (typeof body.scope !== "string" || !CLASSIFICATION_SCOPES.includes(body.scope as InquiryMessageClassificationScope)) {
    throw new InquiryLineChatInputError("Invalid classification scope");
  }
  if (!Array.isArray(body.watchIds)) {
    throw new InquiryLineChatInputError("watchIds must be an array");
  }

  const watchIds = body.watchIds.map((id) => {
    if (!isPositiveSafeId(id)) throw new InquiryLineChatInputError("watchIds must contain positive IDs");
    return id;
  });
  if (watchIds.length > MAX_CLASSIFICATION_WATCHES) {
    throw new InquiryLineChatInputError("Too many watch IDs");
  }
  if (new Set(watchIds).size !== watchIds.length) {
    throw new InquiryLineChatInputError("watchIds must be unique");
  }

  const scope = body.scope as InquiryMessageClassificationScope;
  if (scope === "WATCHES" && watchIds.length === 0) {
    throw new InquiryLineChatInputError("WATCHES requires at least one watch");
  }
  if (scope !== "WATCHES" && watchIds.length !== 0) {
    throw new InquiryLineChatInputError("COMMON and UNASSIGNED cannot have watch IDs");
  }

  return { messageId: body.messageId, scope, watchIds };
}

function effectiveMessageTime(message: {
  receivedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}) {
  return message.receivedAt ?? message.sentAt ?? message.createdAt;
}

function safeClassification(classification: any) {
  if (!classification) return null;
  return {
    scope: classification.scope,
    source: classification.source,
    confidence: classification.confidence,
    evidence: classification.evidence,
    confirmedAt: classification.confirmedAt,
    watchIds: (classification.watchLinks ?? [])
      .map((link: any) => link.inquiryWatch?.id)
      .filter((id: unknown): id is number => isPositiveSafeId(id)),
  };
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
      reviewWatches: {
        orderBy: { position: "asc" },
        select: { id: true, position: true, label: true },
      },
    },
  });

  if (!inquiry) return null;

  const [messageRows, pendingOutboxRows] = await Promise.all([
    (db.inquiryMessage as any).findMany({
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
        classification: {
          select: {
            scope: true,
            source: true,
            confidence: true,
            evidence: true,
            confirmedAt: true,
            watchLinks: {
              orderBy: { inquiryWatchId: "asc" },
              select: {
                inquiryWatch: {
                  select: { id: true },
                },
              },
            },
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
    .sort((left: any, right: any) => {
      const timeDifference = effectiveMessageTime(left).getTime() - effectiveMessageTime(right).getTime();
      return timeDifference || left.id - right.id;
    })
    .map((message: any) => ({
      id: message.id,
      direction: message.direction,
      messageType: message.messageType,
      body: message.body,
      receivedAt: message.receivedAt,
      sentAt: message.sentAt,
      createdAt: message.createdAt,
      status: message.status,
      classification: safeClassification(message.classification),
      files: message.files.map((file: any) => ({
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
    watchOptions: inquiry.reviewWatches.map((watch) => ({
      id: watch.id,
      position: watch.position,
      label: watch.label,
    })),
    messages,
    pendingOutboxes,
    hasEarlierMessages,
  };
}

export async function updateInquiryMessageClassification(
  db: InquiryLineChatDb,
  inquiryId: number,
  rawBody: unknown,
  now = new Date(),
) {
  if (!isPositiveSafeId(inquiryId)) throw new InquiryLineChatInputError("Invalid inquiry ID");
  const input = parseInquiryMessageClassification(rawBody);

  return db.$transaction(async (tx: any) => {
    const message = await tx.inquiryMessage.findFirst({
      where: { id: input.messageId, inquiryId },
      select: { id: true, lineUserId: true },
    });
    if (!message) throw new InquiryLineChatNotFoundError("Inquiry message not found");
    // Serialize manual reclassification with promotion for the same LINE user.
    await lockLineUserInquiryTransaction(tx, message.lineUserId);

    if (input.scope === "WATCHES") {
      const watches = await tx.inquiryWatch.findMany({
        where: { inquiryId, id: { in: input.watchIds } },
        select: { id: true },
      });
      if (watches.length !== input.watchIds.length) {
        throw new InquiryLineChatInputError("All selected watches must belong to this Inquiry");
      }
    }

    const classification = await tx.inquiryMessageClassification.upsert({
      where: { inquiryMessageId: input.messageId },
      update: {
        scope: input.scope,
        source: "MANUAL",
        confidence: null,
        evidence: null,
        confirmedAt: now,
      },
      create: {
        inquiryMessageId: input.messageId,
        inquiryId,
        scope: input.scope,
        source: "MANUAL",
        confirmedAt: now,
      },
      select: { id: true, scope: true, source: true, confidence: true, evidence: true, confirmedAt: true },
    });

    await tx.inquiryMessageWatchLink.deleteMany({
      where: { classificationId: classification.id },
    });

    if (input.scope === "WATCHES") {
      await tx.inquiryMessageWatchLink.createMany({
        data: input.watchIds.map((inquiryWatchId) => ({
          classificationId: classification.id,
          inquiryWatchId,
          inquiryId,
        })),
      });
    }

    await reconcileInquiryMessageRepairLinks(tx, classification.id);

    return {
      scope: classification.scope,
      source: classification.source,
      confidence: classification.confidence,
      evidence: classification.evidence,
      confirmedAt: classification.confirmedAt,
      watchIds: input.scope === "WATCHES" ? input.watchIds.slice().sort((a, b) => a - b) : [],
    };
  });
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
  MAX_CLASSIFICATION_WATCHES,
};
