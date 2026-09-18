import { createHmac, timingSafeEqual } from "crypto";
import type { PrismaClient } from "@prisma/client";

type LineWebhookEvent = {
  type?: unknown;
  source?: { userId?: unknown } | null;
  timestamp?: unknown;
  message?: { id?: unknown; type?: unknown; text?: unknown } | null;
};

export type LineWebhookDb = Pick<
  PrismaClient,
  "$transaction" | "customer" | "lineUser" | "inquiry" | "inquiryMessage"
>;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// The two-int advisory-lock form has a separate key space from the legacy single-key locks.
const LINE_INQUIRY_ADVISORY_LOCK_NAMESPACE = 726_001;

export function isValidLineWebhookSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string | undefined,
) {
  if (!signature || !channelSecret) return false;

  const expected = createHmac("sha256", channelSecret)
    .update(rawBody, "utf8")
    .digest("base64");
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(signature, "utf8");

  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

export async function getLineProfileDisplayName(
  lineUserId: string,
  channelAccessToken: string | undefined,
  fetcher: FetchLike = fetch,
): Promise<string | null> {
  if (!channelAccessToken) return null;

  try {
    const response = await fetcher(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
      { headers: { Authorization: `Bearer ${channelAccessToken}` } },
    );
    if (!response.ok) return null;

    const profile: unknown = await response.json();
    if (
      typeof profile === "object" &&
      profile !== null &&
      "displayName" in profile &&
      typeof profile.displayName === "string"
    ) {
      return profile.displayName;
    }
  } catch {
    // A profile lookup must not prevent userId retention. Do not log credentials or payloads.
  }

  return null;
}

async function saveLineUser(
  db: LineWebhookDb,
  input: { lineUserId: string; eventType: string; displayName: string | null; now: Date },
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
    console.warn("LINE webhook found multiple Customers with the same lineId; skipped auto-linking.");
  }

  const matchedCustomerId =
    matchingCustomers.length === 1 ? matchingCustomers[0].id : null;
  const linkedCustomerId = existing?.linkedCustomerId ?? matchedCustomerId;
  const linkedAt = existing?.linkedAt ?? (matchedCustomerId ? input.now : null);
  const displayNameData = input.displayName === null ? {} : { displayName: input.displayName };

  return db.lineUser.upsert({
    where: { lineUserId: input.lineUserId },
    create: {
      lineUserId: input.lineUserId,
      firstReceivedAt: input.now,
      lastReceivedAt: input.now,
      lastEventType: input.eventType,
      linkedCustomerId,
      linkedAt,
      ...displayNameData,
    },
    update: {
      lastReceivedAt: input.now,
      lastEventType: input.eventType,
      ...displayNameData,
      ...(existing?.linkedCustomerId === null && matchedCustomerId
        ? { linkedCustomerId: matchedCustomerId, linkedAt: linkedAt }
        : {}),
    },
  });
}

function receivedAtFromEvent(timestamp: unknown, fallback: Date) {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return fallback;

  const receivedAt = new Date(timestamp);
  return Number.isNaN(receivedAt.getTime()) ? fallback : receivedAt;
}

async function saveInboundTextMessage(
  db: LineWebhookDb,
  input: { lineUserId: number; externalMessageId: string; body: string; receivedAt: Date },
) {
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(${LINE_INQUIRY_ADVISORY_LOCK_NAMESPACE}, ${input.lineUserId})
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
    // The database unique key is the final idempotency guard for concurrent deliveries.
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

export async function processVerifiedLineWebhook(input: {
  rawBody: string;
  signature: string | null;
  channelSecret: string | undefined;
  channelAccessToken: string | undefined;
  db: LineWebhookDb;
  fetcher?: FetchLike;
  now?: () => Date;
}): Promise<{ status: number }> {
  if (!input.channelSecret) return { status: 503 };
  if (!isValidLineWebhookSignature(input.rawBody, input.signature, input.channelSecret)) {
    return { status: 401 };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return { status: 400 };
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("events" in payload) ||
    !Array.isArray(payload.events)
  ) {
    return { status: 400 };
  }

  for (const event of payload.events as LineWebhookEvent[]) {
    if ((event.type !== "follow" && event.type !== "message") ||
      typeof event.source?.userId !== "string" || !event.source.userId) {
      continue;
    }

    const displayName = await getLineProfileDisplayName(
      event.source.userId,
      input.channelAccessToken,
      input.fetcher,
    );
    const now = input.now?.() ?? new Date();
    const lineUser = await saveLineUser(input.db, {
      lineUserId: event.source.userId,
      eventType: event.type,
      displayName,
      now,
    });

    if (
      event.type === "message" &&
      event.message?.type === "text" &&
      typeof event.message.id === "string" &&
      event.message.id &&
      typeof event.message.text === "string"
    ) {
      await saveInboundTextMessage(input.db, {
        lineUserId: lineUser.id,
        externalMessageId: event.message.id,
        body: event.message.text,
        receivedAt: receivedAtFromEvent(event.timestamp, now),
      });
    }
  }

  return { status: 200 };
}
