import { randomUUID } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export type SlackNotificationOutboxDb = Pick<PrismaClient, "slackNotificationOutbox">;

const MAX_ATTEMPTS = 5;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const MAX_ERROR_LENGTH = 1000;

function claimableWhere(now: Date): Prisma.SlackNotificationOutboxWhereInput {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
  return {
    attemptCount: { lt: MAX_ATTEMPTS },
    OR: [
      { status: { in: ["PENDING", "FAILED"] } },
      { status: "PROCESSING", lastAttemptAt: { lt: staleBefore } },
    ],
  };
}

export function sanitizeSlackNotificationError(value: unknown) {
  const text = value instanceof Error ? value.message : String(value ?? "Slack delivery failed");
  return text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_LENGTH)
    || "Slack delivery failed";
}

export async function claimSlackNotificationBatch(
  db: SlackNotificationOutboxDb,
  input: { take?: number; now?: Date } = {},
) {
  const take = Math.min(Math.max(input.take ?? 20, 1), 100);
  const now = input.now ?? new Date();
  const where = claimableWhere(now);
  const candidates = await db.slackNotificationOutbox.findMany({
    where,
    orderBy: { id: "asc" },
    take,
    select: { id: true },
  });

  const claimed: Array<{ id: number; target: "REPAIR_INBOX" | "REPAIR_ERRORS"; text: string; claimToken: string }> = [];
  for (const candidate of candidates) {
    const claimToken = randomUUID();
    const result = await db.slackNotificationOutbox.updateMany({
      where: { id: candidate.id, ...where },
      data: {
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        processingToken: claimToken,
      },
    });
    if (result.count !== 1) continue;

    const row = await db.slackNotificationOutbox.findUnique({
      where: { id: candidate.id },
      select: { id: true, target: true, text: true, processingToken: true },
    });
    if (row?.processingToken === claimToken) {
      claimed.push({ id: row.id, target: row.target, text: row.text, claimToken });
    }
  }
  return claimed;
}

export async function markSlackNotificationSent(
  db: SlackNotificationOutboxDb,
  input: { id: number; claimToken: string; now?: Date },
) {
  const result = await db.slackNotificationOutbox.updateMany({
    where: { id: input.id, status: "PROCESSING", processingToken: input.claimToken },
    data: { status: "SENT", sentAt: input.now ?? new Date(), lastError: null, processingToken: null },
  });
  return result.count === 1;
}

export async function markSlackNotificationFailed(
  db: SlackNotificationOutboxDb,
  input: { id: number; claimToken: string; error: unknown },
) {
  const result = await db.slackNotificationOutbox.updateMany({
    where: { id: input.id, status: "PROCESSING", processingToken: input.claimToken },
    data: { status: "FAILED", lastError: sanitizeSlackNotificationError(input.error), processingToken: null },
  });
  return result.count === 1;
}

export const SLACK_NOTIFICATION_OUTBOX_LIMITS = { MAX_ATTEMPTS, STALE_PROCESSING_MS };
