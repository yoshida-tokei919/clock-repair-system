import { createHmac, timingSafeEqual } from "crypto";
import type { PrismaClient } from "@prisma/client";

type LineWebhookEvent = {
  type?: unknown;
  source?: { userId?: unknown } | null;
};

export type LineWebhookDb = Pick<PrismaClient, "customer" | "lineUser">;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

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

  await db.lineUser.upsert({
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
    await saveLineUser(input.db, {
      lineUserId: event.source.userId,
      eventType: event.type,
      displayName,
      now: input.now?.() ?? new Date(),
    });
  }

  return { status: 200 };
}
