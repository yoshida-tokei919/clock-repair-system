import { Prisma, type PrismaClient } from "@prisma/client";
import { createApprovedLineManagerSendOutbox } from "./line-manager-send-outbox";
import { parseInquiryLineReply, InquiryLineChatInputError } from "./inquiry-line-chat";

export class CustomerLineReplyNotFoundError extends Error {}
export class CustomerLineReplyUnavailableError extends Error {}

export function parseCustomerLineReply(value: unknown) {
  const reply = parseInquiryLineReply(value);
  const lineUserId = (value as { lineUserId?: unknown }).lineUserId;
  if (typeof lineUserId !== "number" || !Number.isSafeInteger(lineUserId) || lineUserId <= 0) {
    throw new InquiryLineChatInputError("Invalid LINE user ID");
  }
  return { ...reply, lineUserId };
}

export async function createCustomerLineReply(
  db: PrismaClient,
  customerId: number,
  rawBody: unknown,
  createApproved = createApprovedLineManagerSendOutbox,
) {
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new InquiryLineChatInputError("Invalid customer ID");
  const input = parseCustomerLineReply(rawBody);
  return db.$transaction(async (tx) => {
    // Link changes update LineUser; hold that row until the outbox is committed.
    // Lock Customer first, matching other LINE send flows.
    const customers = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
    if (customers.length !== 1) throw new CustomerLineReplyNotFoundError();
    const users = await tx.$queryRaw<{ linkedCustomerId: number | null }[]>`
      SELECT "linkedCustomerId" FROM "LineUser" WHERE "id" = ${input.lineUserId} FOR UPDATE
    `;
    if (users.length !== 1 || users[0].linkedCustomerId !== customerId) throw new CustomerLineReplyNotFoundError();

    const chat = await tx.lineManagerChat.findUnique({
      where: { lineUserId: input.lineUserId },
      select: { id: true, lineUserId: true, verifiedAt: true },
    });
    if (!chat || chat.lineUserId !== input.lineUserId || !chat.verifiedAt) throw new CustomerLineReplyUnavailableError();

    const inquiryOrder = [{ lastReceivedAt: "desc" as const }, { id: "desc" as const }];
    const inquiry = await tx.inquiry.findFirst({
      where: { lineUserId: input.lineUserId, status: "OPEN" },
      orderBy: inquiryOrder,
      select: { id: true, lineUserId: true },
    }) ?? await tx.inquiry.findFirst({
      where: { lineUserId: input.lineUserId },
      orderBy: inquiryOrder,
      select: { id: true, lineUserId: true },
    });
    if (!inquiry || inquiry.lineUserId !== input.lineUserId) throw new CustomerLineReplyUnavailableError();

    const outbox = await createApproved(tx, {
      inquiryId: inquiry.id,
      lineManagerChatId: chat.id,
      text: input.text,
      idempotencyKey: `customer-line-reply:${customerId}:${input.lineUserId}:${input.idempotencyKey.toLowerCase()}`,
    });
    if (outbox.status === "CANCELLED") throw new CustomerLineReplyUnavailableError();
    return { status: outbox.status, approvedAt: outbox.approvedAt };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
