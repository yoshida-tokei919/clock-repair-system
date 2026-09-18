import type { Prisma, PrismaClient } from "@prisma/client";

type LineEvent = {
  type?: unknown;
  timestamp?: unknown;
  source?: { userId?: unknown } | null;
  message?: { id?: unknown; type?: unknown; text?: unknown } | null;
};

export type LineInquiryProcessorDb = Pick<
  PrismaClient,
  "lineWebhookInbox" | "$transaction" | "customer" | "lineUser" | "inquiry" | "inquiryMessage"
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
  input: { lineUserId: string; eventType: string; now: Date },
) {
  const [existing, matchingCustomers] = await Promise.all([
    db.lineUser.findUnique({
      where: { lineUserId: input.lineUserId },
      select: { linkedCustomerId: true, linkedAt: true },
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
  return db.lineUser.upsert({
    where: { lineUserId: input.lineUserId },
    create: {
      lineUserId: input.lineUserId,
      firstReceivedAt: input.now,
      lastReceivedAt: input.now,
      lastEventType: input.eventType,
      linkedCustomerId,
      linkedAt,
    },
    update: {
      lastReceivedAt: input.now,
      lastEventType: input.eventType,
      ...(existing?.linkedCustomerId === null && matchedCustomerId
        ? { linkedCustomerId: matchedCustomerId, linkedAt }
        : {}),
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
      if (existingMessage) return existingMessage;

      const openInquiries = await tx.inquiry.findMany({
        where: { lineUserId: input.lineUserId, status: "OPEN" },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      const inquiry = openInquiries.length === 1
        ? openInquiries[0]
        : openInquiries.length === 0
          ? await tx.inquiry.create({
              data: {
                lineUserId: input.lineUserId,
                status: "OPEN",
                firstReceivedAt: input.receivedAt,
                lastReceivedAt: input.receivedAt,
              },
              select: { id: true },
            })
          : await tx.inquiry.findFirst({
              where: { lineUserId: input.lineUserId, status: "NEEDS_REVIEW" },
              orderBy: { id: "asc" },
              select: { id: true },
            }) ?? await tx.inquiry.create({
              data: {
                lineUserId: input.lineUserId,
                status: "NEEDS_REVIEW",
                firstReceivedAt: input.receivedAt,
                lastReceivedAt: input.receivedAt,
              },
              select: { id: true },
            });

      return tx.inquiryMessage.create({
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
      if (existingMessage) return existingMessage;
    }
    throw error;
  }
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

export async function processLineWebhookInboxItem(
  db: LineInquiryProcessorDb,
  inboxId: number,
  options: { handleImage?: LineInquiryImageHandler } = {},
): Promise<"processed" | "skipped"> {
  const inbox = await db.lineWebhookInbox.findUnique({
    where: { id: inboxId },
    select: {
      id: true,
      eventType: true,
      rawEvent: true,
      receivedAt: true,
      status: true,
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
      });

      if (
        inbox.eventType === "message" &&
        event?.message?.type === "text" &&
        typeof event.message.id === "string" &&
        event.message.id &&
        typeof event.message.text === "string"
      ) {
        await saveInboundMessage(db, {
          lineUserId: lineUser.id,
          externalMessageId: event.message.id,
          messageType: "TEXT",
          body: event.message.text,
          receivedAt,
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
    await db.lineWebhookInbox.update({
      where: { id: inbox.id },
      data: {
        status: "FAILED",
        lastError: errorMessage(error),
      },
    });
    throw error;
  }
}
