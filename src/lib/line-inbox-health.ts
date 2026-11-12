import type { PrismaClient } from "@prisma/client";

export type LineInboxHealthDb = Pick<
  PrismaClient,
  "lineWebhookInbox" | "inquiryMessage" | "inquiryFile" | "slackNotificationOutbox"
>;

const STALE_WAIT_MS = 5 * 60_000;
const STALE_PROCESSING_MS = 15 * 60_000;
const PROCESSED_GRACE_MS = 2 * 60_000;
const SCAN_LIMIT = 200;

type Discrepancy = { inboxId: number; category: string };

function identity(raw: unknown): { id: string; type: "TEXT" | "IMAGE" } | "invalid" | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const event = raw as { message?: unknown; source?: unknown };
  if (!event.message || typeof event.message !== "object" || Array.isArray(event.message)) return null;
  const message = event.message as { id?: unknown; type?: unknown };
  if (message.type !== "text" && message.type !== "image") return null;
  const source = event.source as { userId?: unknown } | null;
  if (typeof message.id !== "string" || !message.id.trim() ||
      !source || typeof source !== "object" || typeof source.userId !== "string" || !source.userId.trim()) {
    return "invalid";
  }
  return { id: message.id, type: message.type === "text" ? "TEXT" : "IMAGE" };
}

export async function checkLineInboxHealth(db: LineInboxHealthDb, now = new Date()) {
  const waitBefore = new Date(now.getTime() - STALE_WAIT_MS);
  const processingBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
  const processedBefore = new Date(now.getTime() - PROCESSED_GRACE_MS);
  const newest = await db.lineWebhookInbox.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  // Rotate bounded ID ranges each minute so a large history cannot permanently hide newer rows.
  const maxId = newest?.id ?? 0;
  const page = Math.floor(now.getTime() / 60_000) % Math.max(1, Math.ceil(maxId / SCAN_LIMIT));
  const afterId = page * SCAN_LIMIT;
  const [stale, processed] = await Promise.all([
    db.lineWebhookInbox.findMany({
      where: { id: { gt: afterId, lte: afterId + SCAN_LIMIT }, OR: [
        { status: { in: ["RECEIVED", "FAILED"] }, attemptCount: { lt: 5 }, receivedAt: { lte: waitBefore },
          OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: waitBefore } }] },
        { status: "PROCESSING", OR: [
          { lastAttemptAt: { lte: processingBefore } },
          { lastAttemptAt: null, receivedAt: { lte: processingBefore } },
        ] },
      ] },
      orderBy: { id: "asc" }, take: SCAN_LIMIT + 1,
      select: { id: true, status: true },
    }),
    db.lineWebhookInbox.findMany({
      where: { id: { gt: afterId, lte: afterId + SCAN_LIMIT },
        status: "PROCESSED", eventType: "message", OR: [
          { processedAt: { lte: processedBefore } },
          { processedAt: null, updatedAt: { lte: processedBefore } },
        ] },
      orderBy: { id: "asc" }, take: SCAN_LIMIT + 1,
      select: { id: true, rawEvent: true },
    }),
  ]);
  const incomplete = stale.length > SCAN_LIMIT || maxId > SCAN_LIMIT || processed.length > SCAN_LIMIT;
  const discrepancies: Discrepancy[] = stale.slice(0, SCAN_LIMIT).map((row) => ({
    inboxId: row.id, category: row.status === "PROCESSING" ? "stale-processing" : "stale-waiting",
  }));
  const candidates = processed.slice(0, SCAN_LIMIT).map((row) => ({ id: row.id, identity: identity(row.rawEvent) }));
  const valid = candidates.filter((row): row is { id: number; identity: { id: string; type: "TEXT" | "IMAGE" } } =>
    row.identity !== null && row.identity !== "invalid");
  const ids = [...new Set(valid.map((row) => row.identity.id))];
  const [messages, files] = await Promise.all([
    ids.length ? db.inquiryMessage.findMany({
      where: { externalMessageId: { in: ids }, direction: "INBOUND" },
      select: { id: true, externalMessageId: true, messageType: true },
    }) : Promise.resolve([]),
    ids.length ? db.inquiryFile.findMany({
      where: { provider: "LINE", providerFileId: { in: ids } },
      select: { providerFileId: true, inquiryMessageId: true, uploadStatus: true },
    }) : Promise.resolve([]),
  ]);
  const messageById = new Map(messages.map((row) => [row.externalMessageId, row]));
  const fileById = new Map(files.map((row) => [row.providerFileId, row]));
  for (const row of candidates) {
    if (row.identity === "invalid") {
      discrepancies.push({ inboxId: row.id, category: "invalid-identity" });
    } else if (row.identity) {
      const message = messageById.get(row.identity.id);
      if (!message || message.messageType !== row.identity.type) {
        discrepancies.push({ inboxId: row.id, category: "missing-inbound-message" });
      }
      if (row.identity.type === "IMAGE") {
        const file = fileById.get(row.identity.id);
        if (message && (!file || file.uploadStatus !== "STORED" || file.inquiryMessageId !== message.id)) {
          discrepancies.push({ inboxId: row.id, category: "missing-stored-image" });
        }
      }
    }
  }
  if (discrepancies.length) {
    await db.slackNotificationOutbox.createMany({
      data: discrepancies.map(({ inboxId, category }) => ({
        target: "REPAIR_ERRORS" as const,
        kind: "INBOX_PROCESSING_FAILED" as const,
        dedupeKey: `line-inbox-health:${inboxId}:${category}`,
        inboxId,
        text: `[INBOX_PROCESSING_FAILED]\nInbox: ${inboxId}\nLINE inbox health: ${category}. Review persisted records.`,
      })),
      skipDuplicates: true,
    });
  }
  return { status: incomplete ? "incomplete" as const : discrepancies.length ? "alert" as const : "clear" as const,
    scanned: stale.length > SCAN_LIMIT ? SCAN_LIMIT : stale.length,
    checkedProcessed: Math.min(processed.length, SCAN_LIMIT), alerts: discrepancies.length };
}
