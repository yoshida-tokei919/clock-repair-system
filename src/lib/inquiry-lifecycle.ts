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
