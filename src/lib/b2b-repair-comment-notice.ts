import { randomBytes } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { buildCustomerShareUrl } from "./customer-share-url";
import { resolveLockedBusinessEstimateDestination } from "./estimate-line-confirmation";
import { resolveLockedLineContact } from "./line-contact";
import { createApprovedLineManagerSendOutbox } from "./line-manager-send-outbox";

export const b2bRepairCommentNoticeKey = (messageId: number) => `b2b-repair-comment-notice:${messageId}`;

export function customerCommentUrl(token: string, messageId: number, requestUrl: string) {
  return buildCustomerShareUrl(`/customer/repairs/${encodeURIComponent(token)}?comment=${messageId}#comment-${messageId}`, requestUrl);
}

export function visibleCustomerCommentTarget(
  rawId: string | string[] | undefined,
  repairs: { id: number; customerMessages: { id: number }[] }[],
) {
  if (typeof rawId !== "string" || !/^[1-9]\d*$/.test(rawId)) return null;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) return null;
  const index = repairs.findIndex(repair => repair.customerMessages.some(message => message.id === id));
  return index < 0 ? null : { id, index };
}

export async function saveRepairComment(
  db: PrismaClient, repairId: number, body: string, requestUrl: string,
  createApproved = createApprovedLineManagerSendOutbox,
) {
  return db.$transaction(async (tx) => {
    const initial = await tx.repair.findUnique({ where: { id: repairId }, select: { customerId: true } });
    if (!initial) throw new Error("修理案件が見つかりません。");
    const observedCustomer = await tx.customer.findUnique({ where: { id: initial.customerId }, select: { type: true } });
    const contact = observedCustomer?.type === "business" ? await resolveLockedLineContact(tx, initial.customerId) : null;
    const customers = contact ? [contact.source] : await tx.$queryRaw<{ id: number; type: string }[]>`
      SELECT "id", "type" FROM "Customer" WHERE "id" = ${initial.customerId} FOR UPDATE`;
    if (customers.length !== 1 || customers[0].type !== observedCustomer?.type) throw new Error("顧客を確認できません。");
    const repairs = await tx.$queryRaw<{ id: number; customerId: number; publicToken: string | null; inquiryNumber: string }[]>`
      SELECT "id", "customerId", "publicToken", "inquiryNumber" FROM "Repair" WHERE "id" = ${repairId} FOR UPDATE`;
    const repair = repairs[0];
    if (repairs.length !== 1 || repair.customerId !== initial.customerId) throw new Error("修理案件の顧客が変更されました。");

    const business = customers[0].type === "business";
    const destination = business ? await resolveLockedBusinessEstimateDestination(tx, contact!.contactCustomerId) : null;
    const message = await tx.repairCustomerMessage.create({
      data: { repairId, body, senderType: "shop", readAt: new Date() },
      select: { id: true, body: true, senderType: true, createdAt: true, readAt: true },
    });
    if (!business || !destination) return { message, notification: "unavailable" as const };

    let token = repair.publicToken;
    if (!token) {
      token = randomBytes(24).toString("base64url");
      const updated = await tx.$executeRaw`
        UPDATE "Repair" SET "publicToken" = ${token}, "publicTokenCreatedAt" = NOW()
        WHERE "id" = ${repairId} AND "publicToken" IS NULL`;
      if (updated !== 1) throw new Error("共有URLを準備できませんでした。");
    }
    const url = customerCommentUrl(token, message.id, requestUrl);
    const outbox = await createApproved(tx, {
      inquiryId: destination.inquiryId,
      lineManagerChatId: destination.lineManagerChatId,
      ...(contact!.contactCustomerId !== repair.customerId ? { sourceRepairId: repairId } : {}),
      text: `修理案件 ${repair.inquiryNumber} にコメントを返信しました。\n以下のページからご確認ください。\n${url}`,
      idempotencyKey: b2bRepairCommentNoticeKey(message.id),
    });
    return { message, notification: outbox.status === "CONFIRMED" ? "sent" as const :
      outbox.status === "CANCELLED" ? "unavailable" as const : "pending" as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
