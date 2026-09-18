import { createHmac, timingSafeEqual } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

type LineWebhookEvent = {
  type?: unknown;
  webhookEventId?: unknown;
};

export type LineWebhookDb = Pick<PrismaClient, "lineWebhookInbox">;

const LINE_WEBHOOK_EVENT_TYPES = new Set(["message", "follow", "unfollow", "postback"]);

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

export async function processVerifiedLineWebhook(input: {
  rawBody: string;
  signature: string | null;
  channelSecret: string | undefined;
  db: LineWebhookDb;
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

  const receivedAt = input.now?.() ?? new Date();
  const events = (payload.events as unknown[]).flatMap((rawEvent) => {
    if (typeof rawEvent !== "object" || rawEvent === null) return [];

    const event = rawEvent as LineWebhookEvent;
    if (
      typeof event.webhookEventId !== "string" ||
      !event.webhookEventId ||
      typeof event.type !== "string" ||
      !LINE_WEBHOOK_EVENT_TYPES.has(event.type)
    ) {
      return [];
    }

    return [{
      webhookEventId: event.webhookEventId,
      eventType: event.type,
      rawEvent: rawEvent as Prisma.InputJsonValue,
      receivedAt,
      status: "RECEIVED" as const,
    }];
  });

  if (events.length > 0) {
    await input.db.lineWebhookInbox.createMany({
      data: events,
      skipDuplicates: true,
    });
  }

  return { status: 200 };
}
