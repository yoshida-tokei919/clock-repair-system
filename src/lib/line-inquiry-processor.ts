import type { Prisma, PrismaClient } from "@prisma/client";
import type { LineProfileDisplayNameResolver } from "./line-profile";

type LineEvent = {
  type?: unknown;
  timestamp?: unknown;
  source?: { userId?: unknown } | null;
  message?: { id?: unknown; type?: unknown; text?: unknown } | null;
};

export type LineInquiryProcessorDb = Pick<
  PrismaClient,
  "lineWebhookInbox" | "$transaction" | "customer" | "lineUser" | "inquiry" | "inquiryMessage" | "inquiryFile" | "slackNotificationOutbox"
>;

const LINE_INQUIRY_ADVISORY_LOCK_NAMESPACE = 726_001;
const LINE_INBOX_MAX_ATTEMPTS = 5;
const LINE_INBOX_STALE_PROCESSING_MS = 10 * 60 * 1000;

function claimableInboxWhere(now: Date): Prisma.LineWebhookInboxWhereInput {
  const staleBefore = new Date(now.getTime() - LINE_INBOX_STALE_PROCESSING_MS);
  return {
    attemptCount: { lt: LINE_INBOX_MAX_ATTEMPTS },
    OR: [
      { status: { in: ["RECEIVED", "FAILED"] } },
      { status: "PROCESSING", lastAttemptAt: { lt: staleBefore } },
    ],
  };
}

export async function claimLineWebhookInboxBatch(
  db: LineInquiryProcessorDb,
  input: { take?: number; now?: Date } = {},
) {
  const take = input.take ?? 20;
  const now = input.now ?? new Date();
  const where = claimableInboxWhere(now);

  const candidates = await db.lineWebhookInbox.findMany({
    where,
    orderBy: { id: "asc" },
    take,
    select: { id: true },
  });

  const claimed: number[] = [];
  for (const candidate of candidates) {
    const result = await db.lineWebhookInbox.updateMany({
      where: { id: candidate.id, ...where },
      data: {
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
      },
    });
    if (result.count === 1) claimed.push(candidate.id);
  }

  return claimed;
}

function eventDate(timestamp: unknown, fallback: Date) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return fallback;
  const value = new Date(timestamp);
  return Number.isNaN(value.getTime()) ? fallback : value;
}

function asLineEvent(rawEvent: Prisma.JsonValue): LineEvent | null {
  if (typeof rawEvent !== "object" || rawEvent === null || Array.isArray(rawEvent)) return null;
  return rawEvent as LineEvent;
}
async function saveLineUser(
  db: LineInquiryProcessorDb,
  input: {
    lineUserId: string;
    eventType: string;
    now: Date;
    resolveDisplayName?: LineProfileDisplayNameResolver;
  },
) {
  const [existing, matchingCustomers] = await Promise.all([
    db.lineUser.findUnique({
      where: { lineUserId: input.lineUserId },
      select: { linkedCustomerId: true, linkedAt: true, displayName: true },
    }),
    db.customer.findMany({
      where: { lineId: input.lineUserId },
      select: { id: true },
    }),
  ]);

  if (matchingCustomers.length > 1) {
    console.warn("LINE inbox found multiple Customers with the same lineId; skipped auto-linking.");
  }

  const matchedCustomerId =
    matchingCustomers.length === 1 ? matchingCustomers[0].id : null;
  const linkedCustomerId = existing?.linkedCustomerId ?? matchedCustomerId;
  const linkedAt = existing?.linkedAt ?? (matchedCustomerId ? input.now : null);
  let displayName: string | null = null;
  if (!existing?.displayName && input.resolveDisplayName) {
    try {
      displayName = await input.resolveDisplayName(input.lineUserId);
    } catch {
      console.warn("LINE profile display name lookup failed; continuing inbox processing.");
    }
  }
  return db.lineUser.upsert({
    where: { lineUserId: input.lineUserId },
    create: {
      lineUserId: input.lineUserId,
      firstReceivedAt: input.now,
      lastReceivedAt: input.now,
      lastEventType: input.eventType,
      linkedCustomerId,
      linkedAt,
      ...(displayName ? { displayName } : {}),
    },
    update: {
      lastReceivedAt: input.now,
      lastEventType: input.eventType,
      ...(existing?.linkedCustomerId === null && matchedCustomerId
        ? { linkedCustomerId: matchedCustomerId, linkedAt }
        : {}),
      ...(displayName ? { displayName } : {}),
    },
  });
}

async function saveInboundMessage(
  db: LineInquiryProcessorDb,
  input: {
    lineUserId: number;
    externalMessageId: string;
    messageType: "TEXT" | "IMAGE";
    body?: string;
    receivedAt: Date;
  },
) {
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ${LINE_INQUIRY_ADVISORY_LOCK_NAMESPACE}::int,
          ${input.lineUserId}::int
        )
      `;

      const existingMessage = await tx.inquiryMessage.findUnique({
        where: { externalMessageId: input.externalMessageId },
        select: { id: true, inquiryId: true },
      });
      if (existingMessage) return { ...existingMessage, created: false };

      const openInquiries = await tx.inquiry.findMany({
        where: { lineUserId: input.lineUserId, status: "OPEN" },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      const createdNewInquiry = openInquiries.length === 0;
      const inquiry = openInquiries.length === 1
        ? { ...openInquiries[0], status: "OPEN" as const }
        : createdNewInquiry
          ? await tx.inquiry.create({
              data: {
                lineUserId: input.lineUserId,
                status: "OPEN",
                firstReceivedAt: input.receivedAt,
                lastReceivedAt: input.receivedAt,
              },
              select: { id: true, status: true },
            })
          : await tx.inquiry.findFirst({
              where: { lineUserId: input.lineUserId, status: "NEEDS_REVIEW" },
              orderBy: { id: "asc" },
              select: { id: true, status: true },
            }) ?? await tx.inquiry.create({
              data: {
                lineUserId: input.lineUserId,
                status: "NEEDS_REVIEW",
                firstReceivedAt: input.receivedAt,
                lastReceivedAt: input.receivedAt,
              },
              select: { id: true, status: true },
            });

      const message = await tx.inquiryMessage.create({
        data: {
          inquiryId: inquiry.id,
          lineUserId: input.lineUserId,
          externalMessageId: input.externalMessageId,
          direction: "INBOUND",
          messageType: input.messageType,
          body: input.body ?? null,
          receivedAt: input.receivedAt,
        },
        select: { id: true, inquiryId: true },
      });
      return { ...message, created: true };
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const existingMessage = await db.inquiryMessage.findUnique({
        where: { externalMessageId: input.externalMessageId },
        select: { id: true, inquiryId: true },
      });
      if (existingMessage) return { ...existingMessage, created: false };
    }
    throw error;
  }
}

async function ensureInboundMessageNotification(
  db: LineInquiryProcessorDb,
  input: {
    inquiryId: number;
    externalMessageId: string;
    messageType: "TEXT" | "IMAGE";
  },
) {
  return db.$transaction(async (tx) => {
    const [inquiry, messageCount, imageCount] = await Promise.all([
      tx.inquiry.findUnique({
        where: { id: input.inquiryId },
        select: {
          status: true,
          lineUser: {
            select: {
              displayName: true,
              linkedCustomer: { select: { name: true } },
            },
          },
        },
      }),
      tx.inquiryMessage.count({
        where: { inquiryId: input.inquiryId, direction: "INBOUND" },
      }),
      tx.inquiryFile.count({
        where: { inquiryId: input.inquiryId, uploadStatus: "STORED" },
      }),
    ]);
    if (!inquiry) throw new Error("Inquiry was not found while ensuring Slack notification.");

    const kind = inquiry.status === "NEEDS_REVIEW"
      ? "NEEDS_REVIEW"
      : messageCount === 1
        ? "NEW_INQUIRY"
        : input.messageType === "IMAGE"
          ? "IMAGE_ADDED"
          : "INQUIRY_UPDATED";
    return tx.slackNotificationOutbox.upsert({
      where: { dedupeKey: `line-inquiry-message:${input.externalMessageId}` },
      create: {
        target: "REPAIR_INBOX",
        kind,
        dedupeKey: `line-inquiry-message:${input.externalMessageId}`,
        inquiryId: input.inquiryId,
        text: formatInquiryNotification({
          kind,
          inquiryId: input.inquiryId,
          customerName: inquiry.lineUser.linkedCustomer?.name ?? null,
          lineDisplayName: inquiry.lineUser.displayName,
          messageCount,
          imageCount,
          inquiryStatus: inquiry.status,
        }),
      },
      update: {},
    });
  });
}

function formatInquiryNotification(input: {
  kind: "NEW_INQUIRY" | "IMAGE_ADDED" | "INQUIRY_UPDATED" | "NEEDS_REVIEW";
  inquiryId: number;
  customerName: string | null;
  lineDisplayName: string | null;
  messageCount: number;
  imageCount: number;
  inquiryStatus: string;
}) {
  return [
    `[${input.kind}]`,
    `Inquiry: I-${input.inquiryId}`,
    input.customerName
      ? `${input.customerName}さま（既存）からお問い合わせが来ています。`
      : `${input.lineDisplayName ?? "LINE表示名未取得"}（未登録）からお問い合わせが来ています。`,
    `Inbound messages: ${input.messageCount}`,
    `Stored images: ${input.imageCount}`,
    `Status: ${input.inquiryStatus}`,
    "AI processing: pending (not analyzed)",
  ].join("\n");
}
function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error).slice(0, 1000);
}

export type LineInquiryImageHandler = (input: {
  inquiryId: number;
  inquiryMessageId: number;
  externalMessageId: string;
  receivedAt: Date;
}) => Promise<unknown>;

export type LineInquiryProcessorOptions = {
  handleImage?: LineInquiryImageHandler;
  resolveDisplayName?: LineProfileDisplayNameResolver;
};

export async function processLineWebhookInboxItem(
  db: LineInquiryProcessorDb,
  inboxId: number,
  options: LineInquiryProcessorOptions = {},
): Promise<"processed" | "skipped"> {
  const inbox = await db.lineWebhookInbox.findUnique({
    where: { id: inboxId },
    select: {
      id: true,
      eventType: true,
      rawEvent: true,
      receivedAt: true,
      status: true,
      attemptCount: true,
    },
  });

  if (!inbox || inbox.status !== "PROCESSING") return "skipped";

  try {
    const event = asLineEvent(inbox.rawEvent);
    const userId = typeof event?.source?.userId === "string" && event.source.userId
      ? event.source.userId
      : null;
    const receivedAt = eventDate(event?.timestamp, inbox.receivedAt);

    if (userId && (inbox.eventType === "follow" || inbox.eventType === "message")) {
      const lineUser = await saveLineUser(db, {
        lineUserId: userId,
        eventType: inbox.eventType,
        now: receivedAt,
        resolveDisplayName: options.resolveDisplayName,
      });

      if (
        inbox.eventType === "message" &&
        event?.message?.type === "text" &&
        typeof event.message.id === "string" &&
        event.message.id &&
        typeof event.message.text === "string"
      ) {
        const message = await saveInboundMessage(db, {
          lineUserId: lineUser.id,
          externalMessageId: event.message.id,
          messageType: "TEXT",
          body: event.message.text,
          receivedAt,
        });
        await ensureInboundMessageNotification(db, {
          inquiryId: message.inquiryId,
          externalMessageId: event.message.id,
          messageType: "TEXT",
        });
      }

      if (
        inbox.eventType === "message" &&
        event?.message?.type === "image" &&
        typeof event.message.id === "string" &&
        event.message.id
      ) {
        if (!options.handleImage) {
          throw new Error("LINE image processor is not configured.");
        }

        const message = await saveInboundMessage(db, {
          lineUserId: lineUser.id,
          externalMessageId: event.message.id,
          messageType: "IMAGE",
          receivedAt,
        });

        await options.handleImage({
          inquiryId: message.inquiryId,
          inquiryMessageId: message.id,
          externalMessageId: event.message.id,
          receivedAt,
        });
        const file = await db.inquiryFile.findUnique({
          where: {
            provider_providerFileId: {
              provider: "LINE",
              providerFileId: event.message.id,
            },
          },
          select: { uploadStatus: true },
        });
        if (file?.uploadStatus !== "STORED") {
          throw new Error("LINE image handler completed without storing the InquiryFile.");
        }
        await ensureInboundMessageNotification(db, {
          inquiryId: message.inquiryId,
          externalMessageId: event.message.id,
          messageType: "IMAGE",
        });
      }
    }
    await db.lineWebhookInbox.update({
      where: { id: inbox.id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        lastError: null,
      },
    });

    return "processed";
  } catch (error: unknown) {
    await db.$transaction(async (tx) => {
      await tx.lineWebhookInbox.update({
        where: { id: inbox.id },
        data: {
          status: "FAILED",
          lastError: errorMessage(error),
        },
      });
      if (inbox.attemptCount >= LINE_INBOX_MAX_ATTEMPTS) {
        await tx.slackNotificationOutbox.upsert({
          where: { dedupeKey: `line-inbox-final-failure:${inbox.id}` },
          create: {
            target: "REPAIR_ERRORS",
            kind: "INBOX_PROCESSING_FAILED",
            dedupeKey: `line-inbox-final-failure:${inbox.id}`,
            inboxId: inbox.id,
            text: [
              "[INBOX_PROCESSING_FAILED]",
              `Inbox: ${inbox.id}`,
              "LINE inbox processing exhausted its retry limit.",
              "Persisted LINE data has been retained for review.",
            ].join("\n"),
          },
          update: {},
        });
      }
    });
    throw error;
  }
}
