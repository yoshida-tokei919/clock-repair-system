/**
 * Production FMP importer. This is deliberately separate from the local-only
 * importer: it has no update, delete, replace, or upsert path.
 *
 * Default: dry run. To write, all of these are required:
 *   --execute --production-confirm=FMP_APPEND_ONLY_IMPORT
 *   FMP_PRODUCTION_IMPORT_CONFIRM=FMP_APPEND_ONLY_IMPORT
 */
import { readFileSync } from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";

type CandidateWorkItem = {
  workItemKey: string; sourceArea: string; sourceSlot?: number; sourceText: string;
  normalizedSourceText: string; isRuleMatched: boolean; isPublishable: boolean;
  normalizedWorkName?: string; b2bDisplayName?: string; b2cDisplayName?: string;
  laborPrice?: number; reviewStatus?: "reviewed" | "unreviewed" | "excluded";
  excludeReason?: string; displayNameWarnings?: string[]; placeholderResolved?: boolean;
  placeholderPartName?: string; readingKanaRemoved?: boolean;
};
type CandidatePartItem = {
  sourceArea: string; sourceSlot?: number; sourceText: string; normalizedSourceText: string;
  displayName?: string; price?: number; relatedWorkItemKey?: string;
};
type PublicCaseCandidate = {
  sourceType: "FMP"; sourceRepairId: string; receivedDate?: string; sourceBrandName?: string;
  brandName?: string; brandNameKana?: string | null; brandDisplayName?: string; modelName?: string;
  ref?: string; caliber?: string; searchText?: string; hasPublishableInternalWork: boolean;
  hasPublishableExternalWork: boolean; isPublishCandidate: boolean; b2bCandidate: boolean;
  b2cCandidate: boolean; totalAmount?: number; internalWorkItems?: CandidateWorkItem[];
  externalWorkItems?: CandidateWorkItem[]; outsourcedWorkItems?: CandidateWorkItem[];
  partItems?: CandidatePartItem[]; warnings?: string[]; excludeReasons?: string[];
};

const CONFIRMATION = "FMP_APPEND_ONLY_IMPORT";
const defaultInputPath = "docs/data/fmp/generated/public-case-candidates.json";
const prisma = new PrismaClient();

function option(name: string): string | undefined {
  return process.argv.slice(2).find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const unsupported = Array.from(args).filter((arg) => arg === "--replace" || arg.startsWith("--replace="));
  if (unsupported.length) throw new Error("--replace is not supported by the append-only production importer.");
  return { execute: args.has("--execute"), inputPath: option("--input") ?? defaultInputPath,
    confirmation: option("--production-confirm") };
}

function allWorkItems(candidate: PublicCaseCandidate): CandidateWorkItem[] {
  return [...(candidate.internalWorkItems ?? []), ...(candidate.externalWorkItems ?? []), ...(candidate.outsourcedWorkItems ?? [])];
}
function parseReceivedDate(value?: string): Date | undefined {
  const match = value?.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : undefined;
}
function sum(values: Array<number | undefined>): number | undefined {
  const numbers = values.filter((value): value is number => typeof value === "number");
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) : undefined;
}
function mapReviewStatus(status: CandidateWorkItem["reviewStatus"]) {
  return status === "reviewed" ? "APPROVED" : status === "unreviewed" ? "NEEDS_REVIEW" : status === "excluded" ? "REJECTED" : "DRAFT";
}
function parseWarning(rawWarning: string) {
  const [code, target] = rawWarning.split(":", 2);
  const severity = code.toLowerCase().includes("critical") ? "CRITICAL" :
    ["source_text_normalized", "reading_kana_removed", "placeholder_resolved_with_part"].includes(code) ? "INFO" : "REVIEW";
  return { code, target, severity: severity as "CRITICAL" | "REVIEW" | "INFO", message: code };
}
function inputErrors(candidates: PublicCaseCandidate[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  candidates.forEach((candidate, index) => {
    const sourceRepairId = String(candidate.sourceRepairId ?? "").trim();
    if (candidate.sourceType !== "FMP" || !sourceRepairId) errors.push(`case[${index}] requires sourceType=FMP and sourceRepairId`);
    else if (seen.has(sourceRepairId)) errors.push(`duplicate sourceRepairId in input: ${sourceRepairId}`);
    else seen.add(sourceRepairId);
  });
  return errors;
}
function assertExecuteSafety(confirmation?: string) {
  if (confirmation !== CONFIRMATION || process.env.FMP_PRODUCTION_IMPORT_CONFIRM !== CONFIRMATION) {
    throw new Error("Writing requires both --production-confirm=FMP_APPEND_ONLY_IMPORT and FMP_PRODUCTION_IMPORT_CONFIRM=FMP_APPEND_ONLY_IMPORT.");
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url || /(localhost|127\.0\.0\.1|host\.docker\.internal)/i.test(url)) {
    throw new Error("Writing requires an explicitly configured non-local production DATABASE_URL.");
  }
}

async function createCandidate(candidate: PublicCaseCandidate, db: Prisma.TransactionClient) {
  const workByKey = new Map<string, number>();
  const publicCase = await db.publicCase.create({ data: {
    sourceType: "FMP", sourceRepairId: candidate.sourceRepairId.trim(), repairId: null,
    receivedDate: parseReceivedDate(candidate.receivedDate), brandName: candidate.brandName,
    brandNameKana: candidate.brandNameKana, brandDisplayName: candidate.brandDisplayName,
    modelName: candidate.modelName, ref: candidate.ref, caliber: candidate.caliber, searchText: candidate.searchText,
    reviewStatus: "NEEDS_REVIEW", b2bPublishStatus: "HIDDEN", b2cPublishStatus: "HIDDEN",
    b2bSummary: { hasPublishableInternalWork: candidate.hasPublishableInternalWork, hasPublishableExternalWork: candidate.hasPublishableExternalWork },
    b2cSummary: { hasPublishableInternalWork: candidate.hasPublishableInternalWork, hasPublishableExternalWork: candidate.hasPublishableExternalWork },
    publicTags: [candidate.sourceBrandName, candidate.brandName, candidate.brandNameKana, candidate.brandDisplayName, candidate.modelName, candidate.ref, candidate.caliber].filter((value): value is string => Boolean(value)),
    showPriceB2b: true, showPriceB2c: false,
    internalLaborTotal: sum((candidate.internalWorkItems ?? []).map((item) => item.laborPrice)),
    externalLaborTotal: sum((candidate.externalWorkItems ?? []).map((item) => item.laborPrice)),
    outsourcedTotal: sum((candidate.outsourcedWorkItems ?? []).map((item) => item.laborPrice)),
    partsTotal: sum((candidate.partItems ?? []).map((item) => item.price)), totalAmount: candidate.totalAmount,
    warnings: candidate.warnings ?? [], excludeReasons: candidate.excludeReasons ?? [],
    sourceSnapshot: { sourceRepairId: candidate.sourceRepairId, receivedDate: candidate.receivedDate, sourceBrandName: candidate.sourceBrandName, brandName: candidate.brandName, brandNameKana: candidate.brandNameKana ?? null, brandDisplayName: candidate.brandDisplayName, modelName: candidate.modelName, ref: candidate.ref, caliber: candidate.caliber, searchText: candidate.searchText, isPublishCandidate: candidate.isPublishCandidate, b2bCandidate: candidate.b2bCandidate, b2cCandidate: candidate.b2cCandidate },
  }});
  const workItems = allWorkItems(candidate);
  for (let sortOrder = 0; sortOrder < workItems.length; sortOrder++) {
    const item = workItems[sortOrder];
    const work = await db.publicCaseWorkItem.create({ data: {
      publicCaseId: publicCase.id, sourceArea: item.sourceArea, sourceSlot: item.sourceSlot,
      sourceText: item.sourceText, normalizedSourceText: item.normalizedSourceText,
      isRuleMatched: item.isRuleMatched, isPublishable: item.isPublishable, reviewStatus: mapReviewStatus(item.reviewStatus),
      excludeReason: item.excludeReason, normalizedWorkName: item.normalizedWorkName, b2bDisplayName: item.b2bDisplayName,
      b2cDisplayName: item.b2cDisplayName, laborPrice: item.laborPrice,
      showPriceB2b: item.isPublishable && item.reviewStatus === "reviewed" && typeof item.laborPrice === "number" && item.laborPrice > 0 && !item.excludeReason,
      showPriceB2c: false, sortOrder,
      ruleSnapshot: { sourceReviewStatus: item.reviewStatus, workItemKey: item.workItemKey, displayNameWarnings: item.displayNameWarnings ?? [], placeholderResolved: item.placeholderResolved ?? false, placeholderPartName: item.placeholderPartName ?? null, readingKanaRemoved: item.readingKanaRemoved ?? false },
    }});
    workByKey.set(item.workItemKey, work.id);
  }
  const partItems = candidate.partItems ?? [];
  for (let sortOrder = 0; sortOrder < partItems.length; sortOrder++) {
    const item = partItems[sortOrder];
    const relatedWorkItemId = item.relatedWorkItemKey ? workByKey.get(item.relatedWorkItemKey) ?? null : null;
    const hasPrice = typeof item.price === "number" && item.price > 0;
    await db.publicCasePartItem.create({ data: {
      publicCaseId: publicCase.id, relatedWorkItemId, sourceArea: item.sourceArea, sourceSlot: item.sourceSlot,
      sourceText: item.sourceText, normalizedSourceText: item.normalizedSourceText, displayName: item.displayName, price: item.price,
      showPriceB2b: Boolean(relatedWorkItemId) && hasPrice, showPriceB2c: false,
      relationStatus: relatedWorkItemId ? "LINKED" : "UNLINKED", reviewStatus: relatedWorkItemId ? "APPROVED" : "NEEDS_REVIEW",
      excludeReason: relatedWorkItemId ? undefined : "part_without_publishable_work", sortOrder,
      metadata: { relatedWorkItemKey: item.relatedWorkItemKey ?? null },
    }});
  }
  for (const rawWarning of candidate.warnings ?? []) {
    const warning = parseWarning(rawWarning);
    await db.publicCaseWarning.create({ data: { publicCaseId: publicCase.id, ...warning, metadata: { rawWarning } } });
  }
  return publicCase.id;
}

async function main() {
  const args = parseArgs();
  const candidates = JSON.parse(readFileSync(args.inputPath, "utf8")) as PublicCaseCandidate[];
  const errors = inputErrors(candidates);
  const warningCount = candidates.reduce((total, candidate) => total + (candidate.warnings?.length ?? 0), 0);
  const existing = await prisma.publicCase.findMany({ where: { sourceType: "FMP", sourceRepairId: { not: null } }, select: { sourceRepairId: true } });
  const existingIds = new Set(existing.flatMap((item) => item.sourceRepairId ? [item.sourceRepairId] : []));
  const createCandidates = candidates.filter((candidate) => !existingIds.has(candidate.sourceRepairId.trim()));
  const skipped = candidates.length - createCandidates.length;
  const summary = { mode: args.execute ? "execute" : "dry-run", inputCaseCount: candidates.length,
    plannedCreateCaseCount: createCandidates.length, skippedExistingCaseCount: skipped,
    duplicateInputCount: errors.filter((error) => error.startsWith("duplicate")).length,
    warningCount, errorCount: errors.length, errors, createdCaseCount: 0, createdIds: [] as number[] };
  if (!args.execute || errors.length) { console.log(JSON.stringify(summary, null, 2)); return; }
  assertExecuteSafety(args.confirmation);
  for (const candidate of createCandidates) {
    // The unique key remains the concurrency backstop; any collision aborts without an update/delete fallback.
    summary.createdIds.push(await prisma.$transaction((tx) => createCandidate(candidate, tx)));
    summary.createdCaseCount += 1;
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
