import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";

type RoutingDb = Pick<PrismaClient, "inquiryMessage">;
const ROUTING_PAGE_SIZE = 200;

// Only associated messages contribute. A new unassociated message is tracked
// separately by the Repair customer-message watermark.
export async function getCustomerRoutingRevision(db: RoutingDb, customerId: number) {
  const hash = createHash("sha256");
  let afterId = 0;
  while (true) {
    const rows = await db.inquiryMessage.findMany({
      where: {
        id: { gt: afterId },
        lineUser: { linkedCustomerId: customerId },
        inquiry: { lineUser: { linkedCustomerId: customerId } },
        OR: [
          { classification: { isNot: null } },
          { postIntakeRouting: { isNot: null } },
        ],
      },
      orderBy: { id: "asc" },
      take: ROUTING_PAGE_SIZE,
      select: {
        id: true,
        classification: { select: {
          scope: true, source: true, confidence: true, confirmedAt: true,
          watchLinks: { select: { inquiryWatchId: true } },
          repairLinks: { where: { repair: { customerId } }, select: { repairId: true } },
        } },
        postIntakeRouting: { select: {
          customerId: true, source: true, confidence: true,
          hasGeneralContent: true, hasUnassignedContent: true, confirmedAt: true,
          repairLinks: { where: { customerId, repair: { customerId } }, select: { repairId: true } },
        } },
      },
    });
    for (const row of rows) {
      const classification = row.classification;
      const routing = row.postIntakeRouting?.customerId === customerId ? row.postIntakeRouting : null;
      if (!classification && !routing) continue;
      hash.update(JSON.stringify({
        id: row.id,
        classification: classification ? {
          scope: classification.scope, source: classification.source,
          confidence: classification.confidence, confirmedAt: classification.confirmedAt,
          watchIds: classification.watchLinks.map((link) => link.inquiryWatchId).sort((a, b) => a - b),
          repairIds: classification.repairLinks.map((link) => link.repairId).sort((a, b) => a - b),
        } : null,
        postIntakeRouting: routing ? {
          source: routing.source, confidence: routing.confidence,
          hasGeneralContent: routing.hasGeneralContent,
          hasUnassignedContent: routing.hasUnassignedContent,
          confirmedAt: routing.confirmedAt,
          repairIds: routing.repairLinks.map((link) => link.repairId).sort((a, b) => a - b),
        } : null,
      }));
      hash.update("\n");
    }
    if (rows.length < ROUTING_PAGE_SIZE) break;
    afterId = rows[rows.length - 1].id;
  }
  return hash.digest("hex");
}
