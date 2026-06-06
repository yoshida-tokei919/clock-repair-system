import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

type SourceArea = "internal" | "external" | "outsourced";
type ReviewStatus = "DRAFT" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED";
type PublishStatus = "HIDDEN" | "READY" | "PUBLISHED" | "ARCHIVED";
type WarningSeverity = "CRITICAL" | "REVIEW" | "INFO";

type CandidateWorkItem = {
  workItemKey: string;
  sourceArea: SourceArea;
  sourceSlot: 1 | 2 | 3;
  sourceText: string;
  normalizedSourceText: string;
  isRuleMatched: boolean;
  isPublishable: boolean;
  normalizedWorkName?: string;
  b2bDisplayName?: string;
  b2cDisplayName?: string;
  laborPrice?: number;
  reviewStatus?: "reviewed" | "unreviewed" | "excluded";
  excludeReason?: string;
  displayNameWarnings?: string[];
  placeholderResolved?: boolean;
  placeholderPartName?: string;
  readingKanaRemoved?: boolean;
};

type CandidatePartItem = {
  sourceArea: "internal" | "external";
  sourceSlot: 1 | 2 | 3;
  sourceText: string;
  normalizedSourceText: string;
  displayName?: string;
  price?: number;
  relatedWorkItemKey?: string;
};

type PublicCaseCandidate = {
  sourceType: "FMP";
  sourceRepairId: string;
  receivedDate?: string;
  sourceBrandName?: string;
  brandName?: string;
  brandNameKana?: string | null;
  brandDisplayName?: string;
  modelName?: string;
  ref?: string;
  caliber?: string;
  searchText?: string;
  hasPublishableInternalWork: boolean;
  hasPublishableExternalWork: boolean;
  isPublishCandidate: boolean;
  b2bCandidate: boolean;
  b2cCandidate: boolean;
  totalAmount?: number;
  internalWorkItems: CandidateWorkItem[];
  externalWorkItems: CandidateWorkItem[];
  outsourcedWorkItems: CandidateWorkItem[];
  partItems: CandidatePartItem[];
  warnings: string[];
  excludeReasons: string[];
};

type ImportSummary = {
  mode: "dry-run" | "execute" | "dry-run replace" | "execute replace";
  replace: boolean;
  inputCaseCount: number;
  publishCandidateCaseCount: number;
  publicCasePayloadCount: number;
  workItemPayloadCount: number;
  partItemPayloadCount: number;
  warningPayloadCount: number;
  existingFmpCaseCount: number;
  existingFmpWorkItemCount: number;
  existingFmpPartItemCount: number;
  existingFmpWarningCount: number;
  existingFmpImageCount: number;
  duplicateCaseCount: number;
  plannedDeleteCaseCount: number;
  plannedDeleteWorkItemCount: number;
  plannedDeletePartItemCount: number;
  plannedDeleteWarningCount: number;
  plannedDeleteImageCount: number;
  plannedCreateCaseCount: number;
  plannedCreateWorkItemCount: number;
  plannedCreatePartItemCount: number;
  plannedCreateWarningCount: number;
  plannedCreateImageCount: number;
  expectedFinalCaseCount: number;
  expectedFinalWorkItemCount: number;
  expectedFinalPartItemCount: number;
  expectedFinalWarningCount: number;
  expectedFinalImageCount: number;
  brandNameKanaPresentCount: number;
  brandDisplayNamePresentCount: number;
  searchTextPresentCount: number;
  showPriceB2cTrueCount: number;
  publicCandidateCopyKeywordCount: number;
  createdCaseCount: number;
  createdWorkItemCount: number;
  createdPartItemCount: number;
  createdWarningCount: number;
  createdImageCount: number;
  criticalWarningCount: number;
  reviewWarningCount: number;
  infoWarningCount: number;
  importBlocked: boolean;
  errors: string[];
};

const inputPath = "docs/data/fmp/generated/public-case-candidates.json";
const prisma = new PrismaClient();
const copyKeyword = "\u30b3\u30d4\u30fc";

function parseArgs(): { dryRun: boolean; execute: boolean; replace: boolean } {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
    execute: args.has("--execute"),
    replace: args.has("--replace"),
  };
}

function assertLocalDatabaseUrl(): void {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!/(localhost|127\.0\.0\.1|host\.docker\.internal)/.test(databaseUrl)) {
    throw new Error(
      "Refusing to import: DATABASE_URL does not look like a local database.",
    );
  }
}

function parseReceivedDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function mapReviewStatus(status: CandidateWorkItem["reviewStatus"]): ReviewStatus {
  if (status === "reviewed") return "APPROVED";
  if (status === "unreviewed") return "NEEDS_REVIEW";
  if (status === "excluded") return "REJECTED";
  return "DRAFT";
}

function sumPrices(items: Array<{ price?: number }>): number | undefined {
  const values = items
    .map((item) => item.price)
    .filter((price): price is number => typeof price === "number");
  if (values.length === 0) return undefined;
  return values.reduce((sum, price) => sum + price, 0);
}

function sumLabor(items: CandidateWorkItem[]): number | undefined {
  const values = items
    .map((item) => item.laborPrice)
    .filter((price): price is number => typeof price === "number");
  if (values.length === 0) return undefined;
  return values.reduce((sum, price) => sum + price, 0);
}

function allWorkItems(candidate: PublicCaseCandidate): CandidateWorkItem[] {
  return [
    ...(candidate.internalWorkItems ?? []),
    ...(candidate.externalWorkItems ?? []),
    ...(candidate.outsourcedWorkItems ?? []),
  ];
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(String(value ?? "").trim());
}

function containsCopyKeyword(candidate: PublicCaseCandidate): boolean {
  const publicValues = [
    candidate.sourceBrandName,
    candidate.brandName,
    candidate.brandNameKana ?? undefined,
    candidate.brandDisplayName,
    candidate.modelName,
    candidate.ref,
    candidate.caliber,
    candidate.searchText,
    ...allWorkItems(candidate).flatMap((item) => [
      item.sourceText,
      item.normalizedSourceText,
      item.normalizedWorkName,
      item.b2bDisplayName,
      item.b2cDisplayName,
    ]),
    ...(candidate.partItems ?? []).flatMap((item) => [
      item.sourceText,
      item.normalizedSourceText,
      item.displayName,
    ]),
  ];
  return publicValues.some((value) => String(value ?? "").includes(copyKeyword));
}

function findDuplicateSourceRepairIds(candidates: PublicCaseCandidate[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const candidate of candidates) {
    const sourceRepairId = String(candidate.sourceRepairId ?? "").trim();
    if (!sourceRepairId) continue;
    if (seen.has(sourceRepairId)) {
      duplicated.add(sourceRepairId);
    }
    seen.add(sourceRepairId);
  }
  return Array.from(duplicated).sort();
}

function isSafeB2bWorkItem(item: CandidateWorkItem): boolean {
  return (
    item.isPublishable &&
    item.reviewStatus === "reviewed" &&
    typeof item.laborPrice === "number" &&
    item.laborPrice > 0 &&
    !item.excludeReason
  );
}

function parseWarning(rawWarning: string): {
  code: string;
  target?: string;
  severity: WarningSeverity;
  message: string;
} {
  const colonIndex = rawWarning.indexOf(":");
  const code = colonIndex >= 0 ? rawWarning.slice(0, colonIndex) : rawWarning;
  const target = colonIndex >= 0 ? rawWarning.slice(colonIndex + 1) : undefined;

  if (
    code === "source_text_normalized" ||
    code === "reading_kana_removed" ||
    code === "placeholder_resolved_with_part"
  ) {
    return { code, target, severity: "INFO", message: code };
  }

  if (
    code === "part_without_publishable_work" ||
    code === "placeholder_removed_without_part" ||
    code === "b2c_display_name_missing" ||
    code === "katakana_suffix_review"
  ) {
    return { code, target, severity: "REVIEW", message: code };
  }

  if (code.toLowerCase().includes("critical")) {
    return { code, target, severity: "CRITICAL", message: code };
  }

  return { code, target, severity: "REVIEW", message: code };
}

function countWarnings(candidates: PublicCaseCandidate[]) {
  const warnings = candidates.flatMap((candidate) => candidate.warnings ?? []);
  const parsed = warnings.map(parseWarning);
  return {
    warningPayloadCount: warnings.length,
    criticalWarningCount: parsed.filter((warning) => warning.severity === "CRITICAL").length,
    reviewWarningCount: parsed.filter((warning) => warning.severity === "REVIEW").length,
    infoWarningCount: parsed.filter((warning) => warning.severity === "INFO").length,
  };
}

async function getExistingFmpSourceRepairIds(): Promise<Set<string>> {
  const existing = await prisma.publicCase.findMany({
    where: { sourceType: "FMP", sourceRepairId: { not: null } },
    select: { sourceRepairId: true },
  });
  return new Set(existing.map((item) => item.sourceRepairId).filter(Boolean) as string[]);
}

async function getExistingFmpCounts() {
  const wherePublicCase = { sourceType: "FMP" as const };
  const whereChild = { publicCase: wherePublicCase };
  const [
    existingFmpCaseCount,
    existingFmpWorkItemCount,
    existingFmpPartItemCount,
    existingFmpWarningCount,
    existingFmpImageCount,
  ] = await Promise.all([
    prisma.publicCase.count({ where: wherePublicCase }),
    prisma.publicCaseWorkItem.count({ where: whereChild }),
    prisma.publicCasePartItem.count({ where: whereChild }),
    prisma.publicCaseWarning.count({ where: whereChild }),
    prisma.publicCaseImage.count({ where: whereChild }),
  ]);

  return {
    existingFmpCaseCount,
    existingFmpWorkItemCount,
    existingFmpPartItemCount,
    existingFmpWarningCount,
    existingFmpImageCount,
  };
}

async function deleteExistingFmpPublicCases() {
  const existing = await prisma.publicCase.findMany({
    where: { sourceType: "FMP" },
    select: { id: true },
  });
  const publicCaseIds = existing.map((item) => item.id);
  if (publicCaseIds.length === 0) {
    return {
      deletedCaseCount: 0,
      deletedWorkItemCount: 0,
      deletedPartItemCount: 0,
      deletedWarningCount: 0,
      deletedImageCount: 0,
    };
  }

  return prisma.$transaction(async (tx) => {
    const deletedWarnings = await tx.publicCaseWarning.deleteMany({
      where: { publicCaseId: { in: publicCaseIds } },
    });
    const deletedImages = await tx.publicCaseImage.deleteMany({
      where: { publicCaseId: { in: publicCaseIds } },
    });
    const deletedParts = await tx.publicCasePartItem.deleteMany({
      where: { publicCaseId: { in: publicCaseIds } },
    });
    const deletedWorks = await tx.publicCaseWorkItem.deleteMany({
      where: { publicCaseId: { in: publicCaseIds } },
    });
    const deletedCases = await tx.publicCase.deleteMany({
      where: { id: { in: publicCaseIds } },
    });

    return {
      deletedCaseCount: deletedCases.count,
      deletedWorkItemCount: deletedWorks.count,
      deletedPartItemCount: deletedParts.count,
      deletedWarningCount: deletedWarnings.count,
      deletedImageCount: deletedImages.count,
    };
  });
}

async function importCandidate(candidate: PublicCaseCandidate) {
  const candidateWorkItems = allWorkItems(candidate);
  const createdWorkItemByKey = new Map<string, number>();

  const publicCase = await prisma.publicCase.create({
    data: {
      sourceType: "FMP",
      sourceRepairId: candidate.sourceRepairId,
      repairId: null,
      receivedDate: parseReceivedDate(candidate.receivedDate),
      brandName: candidate.brandName,
      brandNameKana: candidate.brandNameKana,
      brandDisplayName: candidate.brandDisplayName,
      modelName: candidate.modelName,
      ref: candidate.ref,
      caliber: candidate.caliber,
      searchText: candidate.searchText,
      reviewStatus: "NEEDS_REVIEW",
      b2bPublishStatus: "HIDDEN",
      b2cPublishStatus: "HIDDEN",
      b2bTitle: candidate.brandDisplayName
        ? `${candidate.brandDisplayName} 修理事例`
        : candidate.brandName
          ? `${candidate.brandName} 修理事例`
          : undefined,
      b2cTitle: candidate.brandDisplayName
        ? `${candidate.brandDisplayName} 修理事例`
        : candidate.brandName
          ? `${candidate.brandName} 修理事例`
          : undefined,
      b2bSummary: {
        hasPublishableInternalWork: candidate.hasPublishableInternalWork,
        hasPublishableExternalWork: candidate.hasPublishableExternalWork,
      },
      b2cSummary: {
        hasPublishableInternalWork: candidate.hasPublishableInternalWork,
        hasPublishableExternalWork: candidate.hasPublishableExternalWork,
      },
      publicTags: [
        candidate.sourceBrandName,
        candidate.brandName,
        candidate.brandNameKana ?? undefined,
        candidate.brandDisplayName,
        candidate.modelName,
        candidate.ref,
        candidate.caliber,
      ].filter((value): value is string => Boolean(value)),
      showPriceB2b: true,
      showPriceB2c: false,
      internalLaborTotal: sumLabor(candidate.internalWorkItems ?? []),
      externalLaborTotal: sumLabor(candidate.externalWorkItems ?? []),
      outsourcedTotal: sumLabor(candidate.outsourcedWorkItems ?? []),
      partsTotal: sumPrices(candidate.partItems ?? []),
      totalAmount: candidate.totalAmount,
      warnings: candidate.warnings ?? [],
      excludeReasons: candidate.excludeReasons ?? [],
      sourceSnapshot: {
        sourceRepairId: candidate.sourceRepairId,
        receivedDate: candidate.receivedDate,
        sourceBrandName: candidate.sourceBrandName,
        brandName: candidate.brandName,
        brandNameKana: candidate.brandNameKana ?? null,
        brandDisplayName: candidate.brandDisplayName,
        modelName: candidate.modelName,
        ref: candidate.ref,
        caliber: candidate.caliber,
        searchText: candidate.searchText,
        isPublishCandidate: candidate.isPublishCandidate,
        b2bCandidate: candidate.b2bCandidate,
        b2cCandidate: candidate.b2cCandidate,
      },
    },
  });

  for (let index = 0; index < candidateWorkItems.length; index++) {
    const item = candidateWorkItems[index];
    const workItem = await prisma.publicCaseWorkItem.create({
      data: {
        publicCaseId: publicCase.id,
        sourceArea: item.sourceArea,
        sourceSlot: item.sourceSlot,
        sourceText: item.sourceText,
        normalizedSourceText: item.normalizedSourceText,
        isRuleMatched: item.isRuleMatched,
        isPublishable: item.isPublishable,
        reviewStatus: mapReviewStatus(item.reviewStatus),
        excludeReason: item.excludeReason,
        normalizedWorkName: item.normalizedWorkName,
        b2bDisplayName: item.b2bDisplayName,
        b2cDisplayName: item.b2cDisplayName,
        laborPrice: item.laborPrice,
        showPriceB2b: isSafeB2bWorkItem(item),
        showPriceB2c: false,
        sortOrder: index,
        ruleSnapshot: {
          sourceReviewStatus: item.reviewStatus,
          workItemKey: item.workItemKey,
          displayNameWarnings: item.displayNameWarnings ?? [],
          placeholderResolved: item.placeholderResolved ?? false,
          placeholderPartName: item.placeholderPartName ?? null,
          readingKanaRemoved: item.readingKanaRemoved ?? false,
        },
      },
    });
    createdWorkItemByKey.set(item.workItemKey, workItem.id);
  }

  const partItems = candidate.partItems ?? [];
  for (let index = 0; index < partItems.length; index++) {
    const item = partItems[index];
    const relatedWorkItemId = item.relatedWorkItemKey
      ? createdWorkItemByKey.get(item.relatedWorkItemKey) ?? null
      : null;
    const isLinked = Boolean(relatedWorkItemId);
    const hasPrice = typeof item.price === "number" && item.price > 0;

    await prisma.publicCasePartItem.create({
      data: {
        publicCaseId: publicCase.id,
        relatedWorkItemId,
        sourceArea: item.sourceArea,
        sourceSlot: item.sourceSlot,
        sourceText: item.sourceText,
        normalizedSourceText: item.normalizedSourceText,
        displayName: item.displayName,
        price: item.price,
        showPriceB2b: isLinked && hasPrice,
        showPriceB2c: false,
        relationStatus: isLinked ? "LINKED" : "UNLINKED",
        reviewStatus: isLinked ? "APPROVED" : "NEEDS_REVIEW",
        excludeReason: isLinked ? undefined : "part_without_publishable_work",
        sortOrder: index,
        metadata: { relatedWorkItemKey: item.relatedWorkItemKey ?? null },
      },
    });
  }

  for (const rawWarning of candidate.warnings ?? []) {
    const warning = parseWarning(rawWarning);
    await prisma.publicCaseWarning.create({
      data: {
        publicCaseId: publicCase.id,
        code: warning.code,
        severity: warning.severity,
        message: warning.message,
        target: warning.target,
        metadata: { rawWarning },
      },
    });
  }

  return {
    workItemCount: candidateWorkItems.length,
    partItemCount: candidate.partItems?.length ?? 0,
    warningCount: candidate.warnings?.length ?? 0,
  };
}

async function main() {
  const args = parseArgs();
  if (args.dryRun === args.execute) {
    throw new Error("Specify exactly one option: --dry-run or --execute");
  }

  assertLocalDatabaseUrl();

  const candidates = JSON.parse(readFileSync(inputPath, "utf8")) as PublicCaseCandidate[];
  const publishCandidates = candidates.filter((candidate) => candidate.isPublishCandidate);
  const errors = candidates
    .map((candidate, index) =>
      candidate.sourceType !== "FMP" || !String(candidate.sourceRepairId ?? "").trim()
        ? `case[${index}] invalid FMP sourceRepairId`
        : "",
    )
    .filter(Boolean);
  const duplicateInputSourceRepairIds = findDuplicateSourceRepairIds(publishCandidates);
  if (duplicateInputSourceRepairIds.length > 0) {
    errors.push(
      `duplicate sourceRepairId in input: ${duplicateInputSourceRepairIds.join(", ")}`,
    );
  }
  const warningCounts = countWarnings(publishCandidates);
  const existingSourceRepairIds = await getExistingFmpSourceRepairIds();
  const existingFmpCounts = await getExistingFmpCounts();
  const duplicateCaseCount = publishCandidates.filter((candidate) =>
    existingSourceRepairIds.has(candidate.sourceRepairId),
  ).length;
  const createCandidates = args.replace
    ? publishCandidates
    : publishCandidates.filter((candidate) => !existingSourceRepairIds.has(candidate.sourceRepairId));
  const publicCasePayloadCount = publishCandidates.length;
  const workItemPayloadCount = publishCandidates.reduce(
    (sum, candidate) => sum + allWorkItems(candidate).length,
    0,
  );
  const partItemPayloadCount = publishCandidates.reduce(
    (sum, candidate) => sum + (candidate.partItems?.length ?? 0),
    0,
  );
  const plannedCreateWorkItemCount = createCandidates.reduce(
    (sum, candidate) => sum + allWorkItems(candidate).length,
    0,
  );
  const plannedCreatePartItemCount = createCandidates.reduce(
    (sum, candidate) => sum + (candidate.partItems?.length ?? 0),
    0,
  );
  const plannedCreateWarningCount = createCandidates.reduce(
    (sum, candidate) => sum + (candidate.warnings?.length ?? 0),
    0,
  );
  const plannedDeleteCaseCount = args.replace ? existingFmpCounts.existingFmpCaseCount : 0;
  const plannedDeleteWorkItemCount = args.replace
    ? existingFmpCounts.existingFmpWorkItemCount
    : 0;
  const plannedDeletePartItemCount = args.replace
    ? existingFmpCounts.existingFmpPartItemCount
    : 0;
  const plannedDeleteWarningCount = args.replace
    ? existingFmpCounts.existingFmpWarningCount
    : 0;
  const plannedDeleteImageCount = args.replace ? existingFmpCounts.existingFmpImageCount : 0;
  const expectedFinalCaseCount = args.replace
    ? createCandidates.length
    : existingFmpCounts.existingFmpCaseCount + createCandidates.length;
  const expectedFinalWorkItemCount = args.replace
    ? plannedCreateWorkItemCount
    : existingFmpCounts.existingFmpWorkItemCount + plannedCreateWorkItemCount;
  const expectedFinalPartItemCount = args.replace
    ? plannedCreatePartItemCount
    : existingFmpCounts.existingFmpPartItemCount + plannedCreatePartItemCount;
  const expectedFinalWarningCount = args.replace
    ? plannedCreateWarningCount
    : existingFmpCounts.existingFmpWarningCount + plannedCreateWarningCount;
  const expectedFinalImageCount = args.replace
    ? 0
    : existingFmpCounts.existingFmpImageCount;
  const brandNameKanaPresentCount = publishCandidates.filter((candidate) =>
    hasText(candidate.brandNameKana),
  ).length;
  const brandDisplayNamePresentCount = publishCandidates.filter((candidate) =>
    hasText(candidate.brandDisplayName),
  ).length;
  const searchTextPresentCount = publishCandidates.filter((candidate) =>
    hasText(candidate.searchText),
  ).length;
  const publicCandidateCopyKeywordCount =
    publishCandidates.filter(containsCopyKeyword).length;
  const showPriceB2cTrueCount = 0;
  const importBlocked =
    warningCounts.criticalWarningCount > 0 ||
    errors.length > 0 ||
    publicCandidateCopyKeywordCount > 0;

  const summary: ImportSummary = {
    mode: args.replace
      ? args.execute
        ? "execute replace"
        : "dry-run replace"
      : args.execute
        ? "execute"
        : "dry-run",
    replace: args.replace,
    inputCaseCount: candidates.length,
    publishCandidateCaseCount: publishCandidates.length,
    publicCasePayloadCount,
    workItemPayloadCount,
    partItemPayloadCount,
    warningPayloadCount: warningCounts.warningPayloadCount,
    existingFmpCaseCount: existingFmpCounts.existingFmpCaseCount,
    existingFmpWorkItemCount: existingFmpCounts.existingFmpWorkItemCount,
    existingFmpPartItemCount: existingFmpCounts.existingFmpPartItemCount,
    existingFmpWarningCount: existingFmpCounts.existingFmpWarningCount,
    existingFmpImageCount: existingFmpCounts.existingFmpImageCount,
    duplicateCaseCount,
    plannedDeleteCaseCount,
    plannedDeleteWorkItemCount,
    plannedDeletePartItemCount,
    plannedDeleteWarningCount,
    plannedDeleteImageCount,
    plannedCreateCaseCount: createCandidates.length,
    plannedCreateWorkItemCount,
    plannedCreatePartItemCount,
    plannedCreateWarningCount,
    plannedCreateImageCount: 0,
    expectedFinalCaseCount,
    expectedFinalWorkItemCount,
    expectedFinalPartItemCount,
    expectedFinalWarningCount,
    expectedFinalImageCount,
    brandNameKanaPresentCount,
    brandDisplayNamePresentCount,
    searchTextPresentCount,
    showPriceB2cTrueCount,
    publicCandidateCopyKeywordCount,
    createdCaseCount: 0,
    createdWorkItemCount: 0,
    createdPartItemCount: 0,
    createdWarningCount: 0,
    createdImageCount: 0,
    criticalWarningCount: warningCounts.criticalWarningCount,
    reviewWarningCount: warningCounts.reviewWarningCount,
    infoWarningCount: warningCounts.infoWarningCount,
    importBlocked,
    errors,
  };

  if (args.dryRun || importBlocked) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (args.replace) {
    await deleteExistingFmpPublicCases();
  }

  for (const candidate of createCandidates) {
    const result = await importCandidate(candidate);
    summary.createdCaseCount += 1;
    summary.createdWorkItemCount += result.workItemCount;
    summary.createdPartItemCount += result.partItemCount;
    summary.createdWarningCount += result.warningCount;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
