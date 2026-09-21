import type { Prisma } from "@prisma/client";

type InquiryWatchSettlement = {
  decision: "PENDING" | "REQUESTED" | "DECLINED";
  promotedAt: Date | null;
};

export function isInquiryWatchSettled(watch: InquiryWatchSettlement) {
  return watch.decision === "DECLINED" || watch.promotedAt !== null;
}

export function shouldCloseInquiry(watches: InquiryWatchSettlement[]) {
  return watches.length > 0 && watches.every(isInquiryWatchSettled);
}

type InquiryInviteWatchSet = {
  inquiryWatches: Array<{ inquiryWatchId: number }>;
};

/** Whether an immutable invite watch set exactly matches the current eligible set. */
export function hasSameInquiryWatchIdSet(invite: InquiryInviteWatchSet, inquiryWatchIds: number[]) {
  return invite.inquiryWatches.length === inquiryWatchIds.length
    && invite.inquiryWatches.every(({ inquiryWatchId }) => inquiryWatchIds.includes(inquiryWatchId));
}

/** Closes an Inquiry only after every review watch has reached a terminal state. */
export async function reconcileInquiryClosure(tx: Prisma.TransactionClient, inquiryId: number) {
  const watches = await tx.inquiryWatch.findMany({
    where: { inquiryId },
    select: { decision: true, promotedAt: true },
  });

  if (!shouldCloseInquiry(watches)) return false;

  await tx.inquiry.update({ where: { id: inquiryId }, data: { status: "CLOSED" } });
  return true;
}

/**
 * Revokes active Inquiry-bound intake links when their immutable watch set is no
 * longer the current requested, unpromoted set. A closed Inquiry revokes all
 * unexpired active links. This must run inside the transaction that changes Inquiry state.
 */
export async function reconcileInquiryRepairIntakeInvites(
  tx: Prisma.TransactionClient,
  inquiryId: number,
  now = new Date(),
) {
  const inquiry = await tx.inquiry.findUnique({
    where: { id: inquiryId },
    select: { status: true },
  });
  if (!inquiry) return 0;

  const activeInvites = await tx.repairIntakeInvite.findMany({
    where: {
      inquiryId,
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, inquiryWatches: { select: { inquiryWatchId: true } } },
  });
  if (!activeInvites.length) return 0;

  const eligibleWatchIds = inquiry.status === "CLOSED"
    ? []
    : (await tx.inquiryWatch.findMany({
      where: {
        inquiryId,
        decision: "REQUESTED",
        promotedAt: null,
        promotedWatchId: null,
        promotedRepairId: null,
      },
      select: { id: true },
    })).map(({ id }) => id);
  const staleIds = inquiry.status === "CLOSED"
    ? activeInvites.map(({ id }) => id)
    : activeInvites.filter((invite) => !hasSameInquiryWatchIdSet(invite, eligibleWatchIds)).map(({ id }) => id);
  if (!staleIds.length) return 0;

  const result = await tx.repairIntakeInvite.updateMany({
    where: { id: { in: staleIds }, usedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count;
}
