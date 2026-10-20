import { Prisma } from "@prisma/client";
import { buildCustomerShareUrl } from "./customer-share-url";
import { createApprovedLineManagerSendOutbox } from "./line-manager-send-outbox";

export const intakeSharedPageNoticeKey = (inviteId: number) => `intake-shared-page-notice:${inviteId}`;

/** Called under the originating LineUser transaction lock. Ineligible historical groups are skipped. */
export async function queueIntakeSharedPageNotice(
  tx: Prisma.TransactionClient,
  inviteId: number,
  appUrl = process.env.NEXT_PUBLIC_APP_URL,
) {
  const invite = await tx.repairIntakeInvite.findUnique({
    where: { id: inviteId },
    select: {
      id: true, usedAt: true, revokedAt: true, customerId: true, lineUserId: true, inquiryId: true,
      inquiry: { select: { lineUserId: true } },
      lineUser: { select: { linkedCustomerId: true, lineManagerChat: { select: { id: true, verifiedAt: true } } } },
      inquiryWatches: { select: { inquiryWatch: { select: { inquiryId: true, promotedRepairId: true } } } },
      repairs: { orderBy: { id: "asc" }, select: { id: true, customerId: true, publicToken: true, publicTokenCreatedAt: true, customer: { select: { type: true } } } },
    },
  });
  if (!invite?.usedAt || invite.revokedAt || !invite.inquiryId || !invite.lineUserId ||
      invite.inquiry?.lineUserId !== invite.lineUserId || !invite.lineUser?.lineManagerChat?.verifiedAt ||
      !invite.lineUser.linkedCustomerId || !invite.repairs.length ||
      invite.inquiryWatches.length !== invite.repairs.length) return null;

  const customerId = invite.lineUser.linkedCustomerId;
  const repairIds = new Set(invite.repairs.map((repair) => repair.id));
  if ((invite.customerId !== null && invite.customerId !== customerId) ||
      invite.repairs.some((repair) => repair.customerId !== customerId || repair.customer.type !== "individual" || !repair.publicToken ||
        !repair.publicTokenCreatedAt || repair.publicTokenCreatedAt.getTime() !== invite.usedAt!.getTime()) ||
      invite.inquiryWatches.some(({ inquiryWatch }) => inquiryWatch.inquiryId !== invite.inquiryId || !inquiryWatch.promotedRepairId || !repairIds.has(inquiryWatch.promotedRepairId)) ||
      new Set(invite.inquiryWatches.map(({ inquiryWatch }) => inquiryWatch.promotedRepairId)).size !== repairIds.size) return null;

  // The mapping worker has an internal origin, so never use request.url as its fallback.
  try {
    if (!appUrl) throw new Error("Public application URL is unavailable for intake notice");
    const url = buildCustomerShareUrl(`/customer/repairs/${invite.repairs[0].publicToken}`, appUrl, appUrl);
    return await createApprovedLineManagerSendOutbox(tx, {
      inquiryId: invite.inquiryId,
      lineManagerChatId: invite.lineUser.lineManagerChat.id,
      idempotencyKey: intakeSharedPageNoticeKey(invite.id),
      text: `受付が完了しました。\n今後の修理状況やお見積りの確認はこちらのページからご覧いただけます。\n${url}`,
    });
  } catch (error) {
    // Log only the error class and Prisma code; messages can contain the URL/token or customer data.
    const errorClass = error instanceof Error && /^[A-Za-z][A-Za-z0-9_]*$/.test(error.constructor.name)
      ? error.constructor.name : "Unknown";
    const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError && /^P\d{4}$/.test(error.code)
      ? error.code : null;
    console.error("Intake shared-page notice queue failed", { errorClass, prismaCode });
    throw new Error("Intake shared-page notice could not be queued");
  }
}
