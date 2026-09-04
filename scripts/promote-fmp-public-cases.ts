/**
 * Explicit FMP B2C promotion. It never selects WEB_APP records and never has a
 * bulk/all-records mode. Default execution is a dry run.
 *
 * Write requirements:
 *   --execute --production-confirm=FMP_PUBLIC_CASE_PROMOTION
 *   FMP_PUBLIC_CASE_PROMOTION_CONFIRM=FMP_PUBLIC_CASE_PROMOTION
 */
import { PrismaClient } from "@prisma/client";

const CONFIRMATION = "FMP_PUBLIC_CASE_PROMOTION";
const prisma = new PrismaClient();

function option(name: string): string | undefined {
  return process.argv.slice(2).find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}
function splitAllowList(value: string | undefined): string[] {
  return Array.from(new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean)));
}
function assertExecuteSafety(confirmation?: string) {
  if (confirmation !== CONFIRMATION || process.env.FMP_PUBLIC_CASE_PROMOTION_CONFIRM !== CONFIRMATION) {
    throw new Error("Writing requires both --production-confirm=FMP_PUBLIC_CASE_PROMOTION and FMP_PUBLIC_CASE_PROMOTION_CONFIRM=FMP_PUBLIC_CASE_PROMOTION.");
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url || /(localhost|127\.0\.0\.1|host\.docker\.internal)/i.test(url)) {
    throw new Error("Writing requires an explicitly configured non-local production DATABASE_URL.");
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const ids = splitAllowList(option("--ids")).map((id) => Number(id));
  const sourceRepairIds = splitAllowList(option("--source-repair-ids"));
  if (args.has("--all") || args.has("--replace")) throw new Error("Bulk and replace options are not supported.");
  if ((!ids.length && !sourceRepairIds.length) || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("Provide a non-empty explicit allow-list via --ids=1,2 and/or --source-repair-ids=a,b.");
  }
  const execute = args.has("--execute");
  const where = { sourceType: "FMP" as const, OR: [
    ...(ids.length ? [{ id: { in: ids } }] : []),
    ...(sourceRepairIds.length ? [{ sourceRepairId: { in: sourceRepairIds } }] : []),
  ] };
  const matched = await prisma.publicCase.findMany({ where, select: { id: true, sourceRepairId: true, reviewStatus: true, b2cPublishStatus: true, showPriceB2c: true } });
  const foundIds = new Set(matched.map((item) => item.id));
  const foundSourceRepairIds = new Set(matched.flatMap((item) => item.sourceRepairId ? [item.sourceRepairId] : []));
  const missingIds = ids.filter((id) => !foundIds.has(id));
  const missingSourceRepairIds = sourceRepairIds.filter((id) => !foundSourceRepairIds.has(id));
  const summary = { mode: execute ? "execute" : "dry-run",
    requestedAllowListCount: ids.length + sourceRepairIds.length, matchedFmpCaseCount: matched.length,
    missingIds, missingSourceRepairIds, missingAllowListCount: missingIds.length + missingSourceRepairIds.length,
    alreadyPublishedCount: matched.filter((item) => item.reviewStatus === "APPROVED" && item.b2cPublishStatus === "PUBLISHED").length,
    plannedPromotionCount: matched.filter((item) => item.reviewStatus !== "APPROVED" || item.b2cPublishStatus !== "PUBLISHED").length,
    showPriceB2cTrueCount: matched.filter((item) => item.showPriceB2c).length,
    promotedCaseCount: 0, matched };
  if (!execute) { console.log(JSON.stringify(summary, null, 2)); return; }
  assertExecuteSafety(option("--production-confirm"));
  if (summary.missingAllowListCount > 0 || summary.showPriceB2cTrueCount > 0) {
    throw new Error(`${JSON.stringify(summary)}\nRefusing promotion: every allow-list target must resolve to an FMP case with showPriceB2c=false.`);
  }
  const promotionWhere = { AND: [where, { showPriceB2c: false }, { OR: [
    { reviewStatus: { not: "APPROVED" as const } },
    { b2cPublishStatus: { not: "PUBLISHED" as const } },
  ] }] };
  const result = await prisma.publicCase.updateMany({ where: promotionWhere, data: {
    reviewStatus: "APPROVED", b2cPublishStatus: "PUBLISHED", b2cPublishedAt: new Date(),
  }});
  summary.promotedCaseCount = result.count;
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
