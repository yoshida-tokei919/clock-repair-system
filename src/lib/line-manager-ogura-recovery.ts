import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { lockLineUserInquiryTransaction } from "./inquiry-transaction-lock";
import type { handleLineInquiryImage } from "./line-inquiry-image";

const IMAGE_DIGEST = "3a8b8911bb3ede6876230b623fafef9c4308a563812871687aeddf47c95c4c22";
const TEXT_DIGEST = "19bf5fd7cee506208dedef4c001fd7ab8f1b0adcda0453692bbbf0d527736fc2";
const BODY_DIGEST = "b5c88ead067d3fe2c9cf4af7664d10ad5780a540efc75671529faade61bfeeb6";
const MAX_IMAGE = 20 * 1024 * 1024;
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export class OguraRecoveryInputError extends Error {}
export class OguraRecoveryConflictError extends Error {}
export class OguraRecoveryPartialError extends Error {}

type Event = { messageId: string; type: "image" | "text"; timestamp: number; text?: string };
type Input = { action: "check" | "apply"; mappingId: 12; inquiryId: 13; managerBotId: string; managerChatId: string; events: [Event, Event] };
type ReadDb = Pick<PrismaClient, "lineManagerChat" | "lineUser" | "inquiry" | "inquiryMessage" | "inquiryFile">;
type Db = ReadDb & Pick<PrismaClient, "$transaction">;

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
}

export function parseOguraRecovery(value: unknown, digest: (value: string) => string = sha): Input {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OguraRecoveryInputError();
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).sort().join() !== "action,events,inquiryId,managerBotId,managerChatId,mappingId" ||
      !["check", "apply"].includes(raw.action as string) || raw.mappingId !== 12 || raw.inquiryId !== 13 ||
      !validId(raw.managerBotId) || !validId(raw.managerChatId) || !Array.isArray(raw.events) || raw.events.length !== 2) throw new OguraRecoveryInputError();
  const events = raw.events as unknown[];
  const image = events[0] as Record<string, unknown> | null;
  const text = events[1] as Record<string, unknown> | null;
  if (!image || typeof image !== "object" || Array.isArray(image) || Object.keys(image).sort().join() !== "messageId,timestamp,type" ||
      !validId(image.messageId) || digest(image.messageId) !== IMAGE_DIGEST || image.type !== "image" || image.timestamp !== 1794319649332 ||
      !text || typeof text !== "object" || Array.isArray(text) || Object.keys(text).sort().join() !== "messageId,text,timestamp,type" ||
      !validId(text.messageId) || digest(text.messageId) !== TEXT_DIGEST || text.type !== "text" || text.timestamp !== 1794319904836 ||
      typeof text.text !== "string" || [...text.text].length !== 448 || digest(text.text) !== BODY_DIGEST || image.messageId === text.messageId) throw new OguraRecoveryInputError();
  return raw as Input;
}

async function assertIdentity(db: ReadDb, input: Input) {
  const mapping = await db.lineManagerChat.findUnique({ where: { id: 12 }, include: { evidenceMessage: { include: { inquiry: true } } } });
  if (!mapping || mapping.lineUserId !== 102 || mapping.managerBotId !== input.managerBotId || mapping.managerChatId !== input.managerChatId ||
      !mapping.verifiedAt || mapping.evidenceMessage.id !== mapping.evidenceInquiryMessageId || mapping.evidenceMessage.direction !== "INBOUND" ||
      mapping.evidenceMessage.lineUserId !== 102 || mapping.evidenceMessage.inquiry.lineUserId !== 102 ||
      mapping.evidenceMessage.externalMessageId !== mapping.evidenceManagerMessageId) throw new OguraRecoveryConflictError();
  const user = await db.lineUser.findUnique({ where: { id: 102 } });
  const inquiry = await db.inquiry.findUnique({ where: { id: 13 } });
  if (!user || user.linkedCustomerId !== 16 || !inquiry || inquiry.lineUserId !== 102 || inquiry.status !== "CLOSED") throw new OguraRecoveryConflictError();
  const existing = await db.inquiryMessage.findMany({ where: { externalMessageId: { in: input.events.map((event) => event.messageId) } } });
  const byId = new Map(existing.map((row) => [row.externalMessageId, row]));
  for (const event of input.events) {
    const row = byId.get(event.messageId);
    if (row && (row.inquiryId !== 13 || row.lineUserId !== 102 || row.direction !== "INBOUND" || row.messageType !== (event.type === "image" ? "IMAGE" : "TEXT") ||
        row.receivedAt?.getTime() !== event.timestamp || row.sentAt !== null || row.status !== "received" || row.body !== (event.type === "text" ? event.text : null))) throw new OguraRecoveryConflictError();
  }
  const file = await db.inquiryFile.findUnique({ where: { provider_providerFileId: { provider: "LINE", providerFileId: input.events[0].messageId } } });
  if (file && (file.inquiryId !== 13 || !byId.get(input.events[0].messageId) || file.inquiryMessageId !== byId.get(input.events[0].messageId)?.id)) throw new OguraRecoveryConflictError();
  return { byId, file };
}

async function preflightImage(messageId: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new OguraRecoveryPartialError();
  try {
    const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok || !/^image\//i.test(response.headers.get("content-type") ?? "")) throw new Error();
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_IMAGE)) throw new Error();
    if (!response.body) throw new Error();
    const reader = response.body.getReader();
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_IMAGE) throw new Error();
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (size === 0) throw new Error();
  } catch { throw new OguraRecoveryPartialError(); }
}

export async function recoverOgura(db: Db, raw: unknown, deps: { preflight?: (id: string) => Promise<void>; storeImage?: typeof handleLineInquiryImage } = {}) {
  const input = parseOguraRecovery(raw);
  return recoverOguraValidated(db, input, deps);
}

/** The authenticated route must call recoverOgura; this seam keeps fake-based tests independent of private evidence. */
export async function recoverOguraValidated(db: Db, input: Input, deps: { preflight?: (id: string) => Promise<void>; storeImage?: typeof handleLineInquiryImage } = {}) {
  const checked = await assertIdentity(db, input);
  if (input.action === "check") return { status: "checked", existingMessageCount: checked.byId.size, imageStored: checked.file?.uploadStatus === "STORED" };
  await (deps.preflight ?? preflightImage)(input.events[0].messageId);
  const outcome = await db.$transaction(async (tx) => {
    await lockLineUserInquiryTransaction(tx, 102);
    const state = await assertIdentity(tx, input);
    for (const event of input.events) if (!state.byId.has(event.messageId)) {
      await tx.inquiryMessage.create({ data: { inquiryId: 13, lineUserId: 102, externalMessageId: event.messageId, direction: "INBOUND", messageType: event.type === "image" ? "IMAGE" : "TEXT", body: event.type === "text" ? event.text : null, receivedAt: new Date(event.timestamp), status: "received" } });
    }
    const image = await tx.inquiryMessage.findUnique({ where: { externalMessageId: input.events[0].messageId } });
    if (!image) throw new OguraRecoveryConflictError();
    return { imageId: image.id, inserted: 2 - state.byId.size };
  }, { timeout: 20_000 });
  const after = await assertIdentity(db, input);
  if (after.file?.uploadStatus !== "STORED") {
    try {
      const store = deps.storeImage ?? (await import("./line-inquiry-image")).handleLineInquiryImage;
      await store(db, { inquiryId: 13, inquiryMessageId: outcome.imageId, externalMessageId: input.events[0].messageId, receivedAt: new Date(input.events[0].timestamp) });
    } catch { throw new OguraRecoveryPartialError(); }
  }
  const final = await assertIdentity(db, input);
  if (final.byId.size !== 2 || final.file?.uploadStatus !== "STORED" || final.file.inquiryMessageId !== outcome.imageId) throw new OguraRecoveryPartialError();
  return { status: "complete", insertedMessageCount: outcome.inserted, existingMessageCount: 2 - outcome.inserted, imageStored: true };
}
