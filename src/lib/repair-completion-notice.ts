import type { Prisma, PrismaClient } from "@prisma/client";
import {
  createApprovedLineManagerSendOutbox,
  type LineManagerSendOutboxDb,
} from "./line-manager-send-outbox";

export type RepairCompletionNoticeDb = LineManagerSendOutboxDb & Pick<PrismaClient, "lineManagerSendOutbox">;

export class RepairCompletionNoticeInputError extends Error {}
export class RepairCompletionNoticeNotFoundError extends Error {}
export class RepairCompletionNoticeUnavailableError extends Error {}

const MAX_TEXT_LENGTH = 5000;

export function completionNoticeKey(repairId: number) {
  return `repair-completion-notice:${repairId}`;
}

export function parseCompletionNotice(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RepairCompletionNoticeInputError("Invalid completion notice body");
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "confirmed" && key !== "text") ||
      body.confirmed !== true || typeof body.text !== "string" ||
      !body.text.trim() || body.text.length > MAX_TEXT_LENGTH) {
    throw new RepairCompletionNoticeInputError("confirmed: true and nonempty text of at most 5000 characters are required");
  }
  return { text: body.text };
}

async function context(db: Pick<Prisma.TransactionClient, "repair">, repairId: number) {
  if (!Number.isSafeInteger(repairId) || repairId <= 0) {
    throw new RepairCompletionNoticeInputError("Invalid Repair ID");
  }
  const repair = await db.repair.findUnique({
    where: { id: repairId },
    select: {
      id: true, status: true, customer: { select: { type: true } },
      inquiryWatchPromotion: { select: {
        inquiryId: true, promotedRepairId: true,
        inquiry: { select: { lineUser: { select: {
          lineManagerChat: { select: { id: true, verifiedAt: true } },
        } } } },
      } },
    },
  });
  if (!repair) throw new RepairCompletionNoticeNotFoundError("Repair not found");
  const promotion = repair.inquiryWatchPromotion;
  const chat = promotion?.inquiry.lineUser.lineManagerChat;
  const hasOriginatingInquiry = Boolean(promotion && promotion.promotedRepairId === repair.id);
  const hasVerifiedLineDestination = Boolean(hasOriginatingInquiry && chat?.verifiedAt);
  const eligible = repair.customer.type === "individual" && repair.status === "作業完了" &&
    hasOriginatingInquiry && hasVerifiedLineDestination;
  return { repair, promotion, chat, hasOriginatingInquiry, hasVerifiedLineDestination, eligible };
}

export async function getRepairCompletionNotice(db: RepairCompletionNoticeDb, repairId: number) {
  const current = await context(db, repairId);
  const outbox = await db.lineManagerSendOutbox.findUnique({
    where: { idempotencyKey: completionNoticeKey(repairId) },
    select: { id: true, status: true, approvedAt: true, confirmedAt: true },
  });
  return {
    eligible: current.eligible,
    hasVerifiedLineDestination: current.hasVerifiedLineDestination,
    notice: outbox,
  };
}

export async function createRepairCompletionNotice(
  db: RepairCompletionNoticeDb,
  repairId: number,
  rawBody: unknown,
  createApproved = createApprovedLineManagerSendOutbox,
) {
  const input = parseCompletionNotice(rawBody);
  if (!Number.isSafeInteger(repairId) || repairId <= 0) {
    throw new RepairCompletionNoticeInputError("Invalid Repair ID");
  }
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Read linkage without a row lock, then follow the existing Customer -> Repair lock order.
    const initial = await tx.$queryRaw<{ customerId: number }[]>`SELECT "customerId" FROM "Repair" WHERE "id" = ${repairId}`;
    if (!initial.length) throw new RepairCompletionNoticeNotFoundError("Repair not found");
    const customerId = initial[0].customerId;
    const customers = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
    if (!customers.length) throw new RepairCompletionNoticeUnavailableError("Repair customer is no longer available");
    const locked = await tx.$queryRaw<{ customerId: number }[]>`SELECT "customerId" FROM "Repair" WHERE "id" = ${repairId} FOR UPDATE`;
    if (locked.length !== 1 || locked[0].customerId !== customerId) {
      throw new RepairCompletionNoticeUnavailableError("Repair customer changed before the LINE completion notice");
    }
    const current = await context(tx, repairId);
    if (!current.eligible || !current.promotion || !current.chat) {
      throw new RepairCompletionNoticeUnavailableError("Repair is not eligible for a LINE completion notice");
    }
    const outbox = await createApproved(tx, {
      inquiryId: current.promotion.inquiryId,
      lineManagerChatId: current.chat.id,
      sourceRepairId: current.repair.id,
      text: input.text,
      idempotencyKey: completionNoticeKey(repairId),
    });
    return { id: outbox.id, status: outbox.status, approvedAt: outbox.approvedAt, confirmedAt: outbox.confirmedAt };
  });
}
