import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";

type SummaryDb = Pick<PrismaClient, "inquiry">;
const SUMMARY_PAGE_SIZE = 200;

// Hash all saved legacy summaries without retaining their bodies in the hub.
// ID order stays stable even when a summary's displayed timestamp changes.
export async function getCustomerSummaryHistoryRevision(db: SummaryDb, customerId: number) {
  const hash = createHash("sha256");
  let afterId = 0;
  while (true) {
    const rows = await db.inquiry.findMany({
      where: {
        id: { gt: afterId },
        lineUser: { linkedCustomerId: customerId },
        conversationSummary: { not: null },
      },
      orderBy: { id: "asc" },
      take: SUMMARY_PAGE_SIZE,
      select: {
        id: true, status: true, conversationSummary: true,
        firstReceivedAt: true, lastReceivedAt: true,
        analyses: {
          where: { status: { not: "FAILED" } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { id: true, status: true, conversationSummary: true, completedAt: true, createdAt: true, updatedAt: true },
        },
      },
    });
    for (const row of rows) {
      hash.update(JSON.stringify({
        id: row.id, status: row.status, summary: row.conversationSummary,
        firstReceivedAt: row.firstReceivedAt, lastReceivedAt: row.lastReceivedAt,
        latestAnalysis: row.analyses[0] ?? null,
      }));
      hash.update("\n");
    }
    if (rows.length < SUMMARY_PAGE_SIZE) break;
    afterId = rows[rows.length - 1].id;
  }
  return hash.digest("hex");
}
