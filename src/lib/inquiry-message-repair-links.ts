import type { Prisma } from "@prisma/client";

const CLASSIFICATION_BATCH_SIZE = 100;

/** Rebuild one derived association from saved classification and promotion markers. */
export async function reconcileInquiryMessageRepairLinks(
  tx: Prisma.TransactionClient,
  classificationId: number,
) {
  const classification = await tx.inquiryMessageClassification.findUnique({
    where: { id: classificationId },
    select: {
      inquiryId: true,
      scope: true,
      watchLinks: { select: { inquiryWatch: { select: { promotedRepairId: true } } } },
      repairLinks: { select: { repairId: true } },
    },
  });
  if (!classification) throw new Error(`Inquiry message classification ${classificationId} not found`);

  let promotedRepairIds: Array<number | null> = [];
  if (classification.scope === "WATCHES") {
    promotedRepairIds = classification.watchLinks.map((link) => link.inquiryWatch.promotedRepairId);
  } else if (classification.scope === "COMMON") {
    const watches = await tx.inquiryWatch.findMany({
      where: { inquiryId: classification.inquiryId, promotedRepairId: { not: null } },
      select: { promotedRepairId: true },
    });
    promotedRepairIds = watches.map((watch) => watch.promotedRepairId);
  }

  const desired = new Set(promotedRepairIds.filter((id): id is number => id !== null));
  const current = new Set(classification.repairLinks.map((link) => link.repairId));
  const stale = Array.from(current).filter((id) => !desired.has(id));
  const missing = Array.from(desired).filter((id) => !current.has(id));

  if (stale.length) {
    await tx.inquiryMessageRepairLink.deleteMany({
      where: { classificationId, repairId: { in: stale } },
    });
  }
  if (missing.length) {
    await tx.inquiryMessageRepairLink.createMany({
      data: missing.map((repairId) => ({ classificationId, repairId })),
    });
  }
}

/** Page by classification ID so each scan stays bounded to one Inquiry. */
export async function reconcileInquiryRepairMessageLinks(
  tx: Prisma.TransactionClient,
  inquiryId: number,
) {
  let afterId = 0;
  while (true) {
    const classifications = await tx.inquiryMessageClassification.findMany({
      where: { inquiryId, id: { gt: afterId } },
      orderBy: { id: "asc" },
      take: CLASSIFICATION_BATCH_SIZE,
      select: { id: true },
    });
    if (classifications.length === 0) return;
    for (const classification of classifications) {
      await reconcileInquiryMessageRepairLinks(tx, classification.id);
    }
    afterId = classifications[classifications.length - 1].id;
  }
}
