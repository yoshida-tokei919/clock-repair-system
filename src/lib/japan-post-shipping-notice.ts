import { Prisma, type PrismaClient } from "@prisma/client";
import { createApprovedLineManagerSendOutbox } from "./line-manager-send-outbox";
import { syncJapanPostTrackingCsv, type JapanPostSyncResult } from "./japan-post-tracking-sync";

export const shipmentShippingNoticeKey = (shipmentId: number) => `shipment-shipping-notice:${shipmentId}`;

export type ShippingNoticeQueueResult = {
  shipmentId: number;
  outcome: "READY" | "SKIPPED" | "ERROR";
  outboxStatus?: string;
  reason?: string;
};

type NoticeDb = Pick<PrismaClient, "$transaction" | "shipment">;
type ApprovedCreator = typeof createApprovedLineManagerSendOutbox;

function message(trackingNumber: string): string {
  return `修理品を発送しました。\n日本郵便の追跡番号：${trackingNumber}\n配送状況は、先にご案内している修理状況ページからもご確認いただけます。`;
}

async function lineSource(tx: Prisma.TransactionClient, shipment: {
  customerId: number;
  repairs: { repair: { repairIntakeInviteId: number | null; inquiryWatchPromotion: { inquiryId: number } | null } }[];
}) {
  const inviteIds = shipment.repairs.map(item => item.repair.repairIntakeInviteId);
  const uniqueInvites = new Set(inviteIds.filter((value): value is number => value !== null));
  if (uniqueInvites.size === 1 && inviteIds.every(value => value !== null)) {
    const inviteId = [...uniqueInvites][0];
    const invite = await tx.repairIntakeInvite.findUnique({
      where: { id: inviteId },
      select: {
        usedAt: true, revokedAt: true, customerId: true, inquiryId: true, lineUserId: true,
        inquiry: { select: { lineUserId: true } },
        lineUser: { select: { linkedCustomerId: true, lineManagerChat: { select: { id: true, verifiedAt: true } } } },
      },
    });
    if (invite?.usedAt && !invite.revokedAt && invite.customerId === shipment.customerId &&
        invite.inquiryId && invite.lineUserId && invite.inquiry?.lineUserId === invite.lineUserId &&
        invite.lineUser?.linkedCustomerId === shipment.customerId && invite.lineUser.lineManagerChat?.verifiedAt) {
      return { inquiryId: invite.inquiryId, lineUserId: invite.lineUserId, lineManagerChatId: invite.lineUser.lineManagerChat.id };
    }
  }

  const inquiryIds = shipment.repairs.map(item => item.repair.inquiryWatchPromotion?.inquiryId ?? null);
  const uniqueInquiries = new Set(inquiryIds.filter((value): value is number => value !== null));
  if (uniqueInquiries.size !== 1 || inquiryIds.some(value => value === null)) return null;
  const inquiryId = [...uniqueInquiries][0];
  const inquiry = await tx.inquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true, lineUserId: true,
      lineUser: { select: { linkedCustomerId: true, lineManagerChat: { select: { id: true, verifiedAt: true } } } },
    },
  });
  if (!inquiry?.lineUserId || inquiry.lineUser?.linkedCustomerId !== shipment.customerId ||
      !inquiry.lineUser.lineManagerChat?.verifiedAt) return null;
  return { inquiryId: inquiry.id, lineUserId: inquiry.lineUserId, lineManagerChatId: inquiry.lineUser.lineManagerChat.id };
}

export async function queueShipmentShippingNotice(
  db: NoticeDb,
  shipmentId: number,
  createApproved: ApprovedCreator = createApprovedLineManagerSendOutbox,
): Promise<ShippingNoticeQueueResult> {
  if (!Number.isSafeInteger(shipmentId) || shipmentId <= 0) {
    return { shipmentId, outcome: "SKIPPED", reason: "invalid_shipment" };
  }
  const initial = await db.shipment.findUnique({ where: { id: shipmentId }, select: { customerId: true } });
  if (!initial) return { shipmentId, outcome: "SKIPPED", reason: "shipment_not_found" };

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const customers = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Customer" WHERE "id" = ${initial.customerId} FOR UPDATE`;
    if (customers.length !== 1) return { shipmentId, outcome: "SKIPPED" as const, reason: "customer_not_found" };
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true, customerId: true, direction: true, carrierCode: true, status: true,
        trackingNumber: true, actualShippedAt: true,
        customer: { select: { type: true } },
        repairs: { select: { repair: { select: {
          customerId: true, repairIntakeInviteId: true,
          inquiryWatchPromotion: { select: { inquiryId: true } },
        } } } },
      },
    });
    if (!shipment || shipment.customerId !== initial.customerId || shipment.direction !== "OUTBOUND" ||
        shipment.carrierCode !== "JAPAN_POST" || !shipment.actualShippedAt ||
        !["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"].includes(shipment.status) ||
        !shipment.trackingNumber || !/^\d{12}$/.test(shipment.trackingNumber) ||
        shipment.customer.type !== "individual" || shipment.repairs.length === 0 ||
        shipment.repairs.some(item => item.repair.customerId !== shipment.customerId)) {
      return { shipmentId, outcome: "SKIPPED" as const, reason: "shipment_not_eligible" };
    }
    const source = await lineSource(tx, shipment);
    if (!source) return { shipmentId, outcome: "SKIPPED" as const, reason: "line_source_unavailable" };
    const users = await tx.$queryRaw<{ linkedCustomerId: number | null }[]>`
      SELECT "linkedCustomerId" FROM "LineUser" WHERE "id" = ${source.lineUserId} FOR UPDATE
    `;
    if (users.length !== 1 || users[0].linkedCustomerId !== shipment.customerId) {
      return { shipmentId, outcome: "SKIPPED" as const, reason: "line_source_changed" };
    }
    const outbox = await createApproved(tx, {
      inquiryId: source.inquiryId,
      lineManagerChatId: source.lineManagerChatId,
      idempotencyKey: shipmentShippingNoticeKey(shipment.id),
      text: message(shipment.trackingNumber),
    });
    if (outbox.status === "CANCELLED") return { shipmentId, outcome: "SKIPPED" as const, reason: "outbox_cancelled" };
    return { shipmentId, outcome: "READY" as const, outboxStatus: outbox.status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function syncJapanPostTrackingCsvWithNotices(
  db: NoticeDb,
  bytes: Buffer,
  queue: typeof queueShipmentShippingNotice = queueShipmentShippingNotice,
  syncTracking: typeof syncJapanPostTrackingCsv = syncJapanPostTrackingCsv,
): Promise<{ tracking: JapanPostSyncResult[]; notices: ShippingNoticeQueueResult[] }> {
  const tracking = await syncTracking(db, bytes);
  const notices: ShippingNoticeQueueResult[] = [];
  const shipmentIds = [...new Set(tracking.filter(item => item.outcome !== "SKIPPED" && item.actualShippedAt && item.shipmentId)
    .map(item => item.shipmentId as number))];
  for (const shipmentId of shipmentIds) {
    try { notices.push(await queue(db, shipmentId)); }
    catch {
      notices.push({ shipmentId, outcome: "ERROR", reason: "notice_queue_failed" });
    }
  }
  return { tracking, notices };
}
