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

async function saveInboundTextMessage(
  db: LineInquiryProcessorDb,
  input: { lineUserId: number; externalMessageId: string; body: string; receivedAt: Date },
) {
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ${LINE_INQUIRY_ADVISORY_LOCK_NAMESPACE}::int,
          ${input.lineUserId}::int
        )
      `;

      const existingMessage = await tx.inquiryMessage.findUnique({
        where: { externalMessageId: input.externalMessageId },
        select: { id: true },
      });
      if (existingMessage) return;

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

      await tx.inquiryMessage.create({
        data: {
          inquiryId: inquiry.id,
          lineUserId: input.lineUserId,
          externalMessageId: input.externalMessageId,
          direction: "INBOUND",
          messageType: "TEXT",
          body: input.body,
          receivedAt: input.receivedAt,
        },
      });
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }
}
function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error).slice(0, 1000);
}

export async function processLineWebhookInboxItem(
  db: LineInquiryProcessorDb,
  inboxId: number,
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

  if (!inbox || inbox.status !== "RECEIVED") return "skipped";

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
        await saveInboundTextMessage(db, {
          lineUserId: lineUser.id,
          externalMessageId: event.message.id,
          body: event.message.text,
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
