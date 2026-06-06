import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

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
  displayNameWarnings?: string[];
  placeholderResolved?: boolean;
  placeholderPartName?: string;
  readingKanaRemoved?: boolean;
  laborPrice?: number;
  reviewStatus?: "reviewed" | "unreviewed" | "excluded";
  excludeReason?: string;
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

type PublicCasePayload = {
  tempPublicCaseKey: string;
  sourceType: "FMP";
  sourceRepairId: string;
  repairId: null;
  receivedDate?: string;
  brandName?: string;
  brandNameKana?: string | null;
  brandDisplayName?: string;
  modelName?: string;
  ref?: string;
  caliber?: string;
  searchText?: string;
  reviewStatus: ReviewStatus;
  b2bPublishStatus: PublishStatus;
  b2cPublishStatus: PublishStatus;
  b2bTitle?: string;
  b2cTitle?: string;
  b2bSummary?: Record<string, unknown>;
  b2cSummary?: Record<string, unknown>;
  publicTags?: string[];
  showPriceB2b: boolean;
  showPriceB2c: boolean;
  internalLaborTotal?: number;
  externalLaborTotal?: number;
  outsourcedTotal?: number;
  partsTotal?: number;
  totalAmount?: number;
  warnings: string[];
  excludeReasons: string[];
  sourceSnapshot: Record<string, unknown>;
};

type WorkItemPayload = {
  tempPublicCaseKey: string;
  tempWorkItemKey: string;
  sourceArea: SourceArea;
  sourceSlot: number;
  sourceText: string;
  normalizedSourceText: string;
  isRuleMatched: boolean;
  isPublishable: boolean;
  reviewStatus: ReviewStatus;
  excludeReason?: string;
  normalizedWorkName?: string;
  b2bDisplayName?: string;
  b2cDisplayName?: string;
  laborPrice?: number;
  showPriceB2b: boolean;
  showPriceB2c: boolean;
  sortOrder: number;
  ruleSnapshot: Record<string, unknown>;
};

type PartItemPayload = {
  tempPublicCaseKey: string;
  relatedWorkItemTempKey: string | null;
  sourceArea: "internal" | "external";
  sourceSlot: number;
  sourceText: string;
  normalizedSourceText: string;
  displayName?: string;
  price?: number;
  showPriceB2b: boolean;
  showPriceB2c: boolean;
  relationStatus: "LINKED" | "UNLINKED" | "NEEDS_REVIEW";
  reviewStatus: ReviewStatus;
  excludeReason?: string;
  sortOrder: number;
  metadata: Record<string, unknown>;
};

type WarningPayload = {
  tempPublicCaseKey: string;
  code: string;
  severity: WarningSeverity;
  message: string;
  target?: string;
  metadata: Record<string, unknown>;
};

type ImportSummary = {
  generatedAt: string;
  inputPath: string;
  inputCaseCount: number;
  publishCandidateCaseCount: number;
  publicCasePayloadCount: number;
  workItemPayloadCount: number;
  partItemPayloadCount: number;
  warningPayloadCount: number;
  criticalWarningCount: number;
  reviewWarningCount: number;
  infoWarningCount: number;
  unlinkedPartItemCount: number;
  showPriceB2bTrueCount: number;
  showPriceB2bFalseCount: number;
  showPriceB2cTrueCount: number;
  showPriceB2cFalseCount: number;
  importBlocked: boolean;
  errors: string[];
  expectedCounts: Record<string, number>;
  actualChecks: Record<string, number | boolean>;
  priceFlagBreakdown: Record<string, Record<string, number>>;
  outputFiles: string[];
};

const inputPath = "docs/data/fmp/generated/public-case-candidates.json";
const outputDir = "docs/data/fmp/generated/import-dry-run";
const summaryPath = `${outputDir}/import-summary.json`;
const publicCaseSamplePath = `${outputDir}/public-case-payload.sample.json`;
const workItemSamplePath = `${outputDir}/work-item-payload.sample.json`;
const partItemSamplePath = `${outputDir}/part-item-payload.sample.json`;
const warningSamplePath = `${outputDir}/warning-payload.sample.json`;
const sampleSize = 20;

const expectedCounts = {
  publicCasePayloadCount: 2924,
  publishCandidateCaseCount: 2924,
  internalPublishableWorkItemCount: 2624,
  externalPublishableWorkItemCount: 711,
  warningPayloadCount: 472,
  partWithoutPublishableWorkWarningCount: 466,
  sourceTextNormalizedWarningCount: 6,
  criticalWarningCount: 0,
  showPriceB2cTrueCount: 0,
};

function parseReceivedDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
}

function mapReviewStatus(status: CandidateWorkItem["reviewStatus"]): ReviewStatus {
  if (status === "reviewed") return "APPROVED";
  if (status === "unreviewed") return "NEEDS_REVIEW";
  if (status === "excluded") return "REJECTED";
  return "DRAFT";
}

function sumPrices(items: Array<{ price?: number }>): number | undefined {
  const values = items.map((item) => item.price).filter((price): price is number => typeof price === "number");
  if (values.length === 0) return undefined;
  return values.reduce((sum, price) => sum + price, 0);
}

function sumLabor(items: CandidateWorkItem[]): number | undefined {
  const values = items.map((item) => item.laborPrice).filter((price): price is number => typeof price === "number");
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

function isSafeB2bWorkItem(item: CandidateWorkItem): boolean {
  return item.isPublishable && item.reviewStatus === "reviewed" && typeof item.laborPrice === "number" && !item.excludeReason;
}

function parseWarning(rawWarning: string): { code: string; target?: string; severity: WarningSeverity; message: string } {
  const colonIndex = rawWarning.indexOf(":");
  const code = colonIndex >= 0 ? rawWarning.slice(0, colonIndex) : rawWarning;
  const target = colonIndex >= 0 ? rawWarning.slice(colonIndex + 1) : undefined;

  if (code === "reading_kana_removed") {
    return {
      code,
      target,
      severity: "INFO",
      message: "表示名から読み仮名を除去した",
    };
  }

  if (code === "placeholder_resolved_with_part") {
    return {
      code,
      target,
      severity: "INFO",
      message: "表示名の○○を同slotの部品名で置換した",
    };
  }

  if (code === "placeholder_removed_without_part") {
    return {
      code,
      target,
      severity: "REVIEW",
      message: "表示名の○○を置換できる同slot部品がなく、○○を削除した",
    };
  }

  if (code === "b2c_display_name_missing") {
    return {
      code,
      target,
      severity: "REVIEW",
      message: "B2C向け表示名を安全に生成できなかった",
    };
  }

  if (code === "katakana_suffix_review") {
    return {
      code,
      target,
      severity: "REVIEW",
      message: "読み仮名の可能性がある未知のカタカナsuffixを検出した",
    };
  }

  if (code === "part_without_publishable_work") {
    return {
      code,
      target,
      severity: "REVIEW",
      message: "部品欄はあるが、同slotに公開候補WorkItemがない",
    };
  }

  if (code === "source_text_normalized") {
    return {
      code,
      target,
      severity: "INFO",
      message: "CSV原文に制御文字などがあり、突合用キーで正規化した",
    };
  }

  if (code.toLowerCase().includes("critical")) {
    return {
      code,
      target,
      severity: "CRITICAL",
      message: "未知のcritical warning",
    };
  }

  return {
    code,
    target,
    severity: "REVIEW",
    message: "未知のreview warning",
  };
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

const candidates = JSON.parse(readFileSync(inputPath, "utf8")) as PublicCaseCandidate[];
const errors: string[] = [];
const seenSourceRepairIds = new Set<string>();

const publicCasePayloads: PublicCasePayload[] = [];
const workItemPayloads: WorkItemPayload[] = [];
const partItemPayloads: PartItemPayload[] = [];
const warningPayloads: WarningPayload[] = [];

candidates.forEach((candidate, caseIndex) => {
  if (candidate.sourceType !== "FMP") {
    errors.push(`case[${caseIndex}] sourceType is not FMP: ${String(candidate.sourceType)}`);
  }

  const sourceRepairId = String(candidate.sourceRepairId ?? "").trim();
  if (!sourceRepairId) {
    errors.push(`case[${caseIndex}] sourceRepairId is required for FMP import`);
    return;
  }

  if (seenSourceRepairIds.has(sourceRepairId)) {
    errors.push(`case[${caseIndex}] duplicate sourceRepairId: ${sourceRepairId}`);
  }
  seenSourceRepairIds.add(sourceRepairId);

  const tempPublicCaseKey = `FMP:${sourceRepairId}`;
  const caseWorkItems = allWorkItems(candidate);
  const workItemKeys = new Set(caseWorkItems.map((item) => item.workItemKey));

  publicCasePayloads.push({
    tempPublicCaseKey,
    sourceType: "FMP",
    sourceRepairId,
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
    b2bTitle: candidate.brandDisplayName ? `${candidate.brandDisplayName} 修理事例` : undefined,
    b2cTitle: candidate.brandDisplayName ? `${candidate.brandDisplayName} 修理事例` : undefined,
    b2bSummary: {
      hasPublishableInternalWork: candidate.hasPublishableInternalWork,
      hasPublishableExternalWork: candidate.hasPublishableExternalWork,
    },
    b2cSummary: {
      hasPublishableInternalWork: candidate.hasPublishableInternalWork,
      hasPublishableExternalWork: candidate.hasPublishableExternalWork,
    },
    publicTags: [candidate.brandDisplayName, candidate.brandName, candidate.brandNameKana, candidate.modelName, candidate.ref, candidate.caliber].filter(
      (value): value is string => Boolean(value),
    ),
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
      sourceRepairId,
      sourceBrandName: candidate.sourceBrandName,
      receivedDate: candidate.receivedDate,
      brandName: candidate.brandName,
      brandNameKana: candidate.brandNameKana,
      brandDisplayName: candidate.brandDisplayName,
      modelName: candidate.modelName,
      ref: candidate.ref,
      caliber: candidate.caliber,
      searchText: candidate.searchText,
      isPublishCandidate: candidate.isPublishCandidate,
      b2bCandidate: candidate.b2bCandidate,
      b2cCandidate: candidate.b2cCandidate,
    },
  });

  caseWorkItems.forEach((item, itemIndex) => {
    const tempWorkItemKey = `${tempPublicCaseKey}:${item.workItemKey}`;
    workItemPayloads.push({
      tempPublicCaseKey,
      tempWorkItemKey,
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
      sortOrder: itemIndex,
      ruleSnapshot: {
        sourceReviewStatus: item.reviewStatus,
        workItemKey: item.workItemKey,
        displayNameWarnings: item.displayNameWarnings ?? [],
        placeholderResolved: item.placeholderResolved ?? false,
        placeholderPartName: item.placeholderPartName ?? null,
        readingKanaRemoved: item.readingKanaRemoved ?? false,
      },
    });
  });

  (candidate.partItems ?? []).forEach((item, itemIndex) => {
    const relatedWorkItemTempKey =
      item.relatedWorkItemKey && workItemKeys.has(item.relatedWorkItemKey)
        ? `${tempPublicCaseKey}:${item.relatedWorkItemKey}`
        : null;
    const isLinked = Boolean(relatedWorkItemTempKey);
    const hasPrice = typeof item.price === "number";

    partItemPayloads.push({
      tempPublicCaseKey,
      relatedWorkItemTempKey,
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
      sortOrder: itemIndex,
      metadata: {
        relatedWorkItemKey: item.relatedWorkItemKey ?? null,
      },
    });
  });

  (candidate.warnings ?? []).forEach((warning) => {
    const parsed = parseWarning(warning);
    warningPayloads.push({
      tempPublicCaseKey,
      code: parsed.code,
      severity: parsed.severity,
      message: parsed.message,
      target: parsed.target,
      metadata: {
        rawWarning: warning,
      },
    });
  });
});

const publicCasePriceFlags = publicCasePayloads.map((payload) => ({
  showPriceB2b: payload.showPriceB2b,
  showPriceB2c: payload.showPriceB2c,
}));
const workItemPriceFlags = workItemPayloads.map((payload) => ({
  showPriceB2b: payload.showPriceB2b,
  showPriceB2c: payload.showPriceB2c,
}));
const partItemPriceFlags = partItemPayloads.map((payload) => ({
  showPriceB2b: payload.showPriceB2b,
  showPriceB2c: payload.showPriceB2c,
}));
const allPriceFlags = [...publicCasePriceFlags, ...workItemPriceFlags, ...partItemPriceFlags];

const criticalWarningCount = warningPayloads.filter((warning) => warning.severity === "CRITICAL").length;
const reviewWarningCount = warningPayloads.filter((warning) => warning.severity === "REVIEW").length;
const infoWarningCount = warningPayloads.filter((warning) => warning.severity === "INFO").length;
const unlinkedPartItemCount = partItemPayloads.filter((item) => item.relatedWorkItemTempKey === null).length;
const internalPublishableWorkItemCount = workItemPayloads.filter(
  (item) => item.sourceArea === "internal" && item.isPublishable,
).length;
const externalPublishableWorkItemCount = workItemPayloads.filter(
  (item) => item.sourceArea === "external" && item.isPublishable,
).length;
const partWithoutPublishableWorkWarningCount = warningPayloads.filter(
  (warning) => warning.code === "part_without_publishable_work",
).length;
const sourceTextNormalizedWarningCount = warningPayloads.filter(
  (warning) => warning.code === "source_text_normalized",
).length;

expectedCounts.publicCasePayloadCount = publicCasePayloads.length;
expectedCounts.publishCandidateCaseCount = candidates.filter((candidate) => candidate.isPublishCandidate).length;
expectedCounts.internalPublishableWorkItemCount = internalPublishableWorkItemCount;
expectedCounts.externalPublishableWorkItemCount = externalPublishableWorkItemCount;
expectedCounts.warningPayloadCount = warningPayloads.length;
expectedCounts.partWithoutPublishableWorkWarningCount = partWithoutPublishableWorkWarningCount;
expectedCounts.sourceTextNormalizedWarningCount = sourceTextNormalizedWarningCount;

function countPriceFlags(items: Array<{ showPriceB2b: boolean; showPriceB2c: boolean }>) {
  return {
    showPriceB2bTrueCount: items.filter((item) => item.showPriceB2b).length,
    showPriceB2bFalseCount: items.filter((item) => !item.showPriceB2b).length,
    showPriceB2cTrueCount: items.filter((item) => item.showPriceB2c).length,
    showPriceB2cFalseCount: items.filter((item) => !item.showPriceB2c).length,
  };
}

const actualChecks = {
  publicCasePayloadCountMatches: publicCasePayloads.length === expectedCounts.publicCasePayloadCount,
  publishCandidateCaseCountMatches:
    candidates.filter((candidate) => candidate.isPublishCandidate).length === expectedCounts.publishCandidateCaseCount,
  internalPublishableWorkItemCount,
  internalPublishableWorkItemCountMatches:
    internalPublishableWorkItemCount === expectedCounts.internalPublishableWorkItemCount,
  externalPublishableWorkItemCount,
  externalPublishableWorkItemCountMatches:
    externalPublishableWorkItemCount === expectedCounts.externalPublishableWorkItemCount,
  partWithoutPublishableWorkWarningCount,
  partWithoutPublishableWorkWarningCountMatches:
    partWithoutPublishableWorkWarningCount === expectedCounts.partWithoutPublishableWorkWarningCount,
  sourceTextNormalizedWarningCount,
  sourceTextNormalizedWarningCountMatches:
    sourceTextNormalizedWarningCount === expectedCounts.sourceTextNormalizedWarningCount,
  criticalWarningCountMatches: criticalWarningCount === expectedCounts.criticalWarningCount,
};

for (const [key, value] of Object.entries(actualChecks)) {
  if (key.endsWith("Matches") && value === false) {
    errors.push(`expected count mismatch: ${key}`);
  }
}

const totalPriceFlags = countPriceFlags(allPriceFlags);
if (totalPriceFlags.showPriceB2cTrueCount !== expectedCounts.showPriceB2cTrueCount) {
  errors.push(`B2C showPrice true count must be 0: ${totalPriceFlags.showPriceB2cTrueCount}`);
}

if (partItemPayloads.some((item) => item.relatedWorkItemTempKey === null && item.showPriceB2b)) {
  errors.push("unlinked PartItem must not have showPriceB2b=true");
}

const summary: ImportSummary = {
  generatedAt: new Date().toISOString(),
  inputPath,
  inputCaseCount: candidates.length,
  publishCandidateCaseCount: candidates.filter((candidate) => candidate.isPublishCandidate).length,
  publicCasePayloadCount: publicCasePayloads.length,
  workItemPayloadCount: workItemPayloads.length,
  partItemPayloadCount: partItemPayloads.length,
  warningPayloadCount: warningPayloads.length,
  criticalWarningCount,
  reviewWarningCount,
  infoWarningCount,
  unlinkedPartItemCount,
  showPriceB2bTrueCount: totalPriceFlags.showPriceB2bTrueCount,
  showPriceB2bFalseCount: totalPriceFlags.showPriceB2bFalseCount,
  showPriceB2cTrueCount: totalPriceFlags.showPriceB2cTrueCount,
  showPriceB2cFalseCount: totalPriceFlags.showPriceB2cFalseCount,
  importBlocked: criticalWarningCount > 0 || errors.length > 0,
  errors,
  expectedCounts,
  actualChecks,
  priceFlagBreakdown: {
    publicCase: countPriceFlags(publicCasePriceFlags),
    workItem: countPriceFlags(workItemPriceFlags),
    partItem: countPriceFlags(partItemPriceFlags),
  },
  outputFiles: [summaryPath, publicCaseSamplePath, workItemSamplePath, partItemSamplePath, warningSamplePath],
};

mkdirSync(outputDir, { recursive: true });
writeJson(summaryPath, summary);
writeJson(publicCaseSamplePath, publicCasePayloads.slice(0, sampleSize));
writeJson(workItemSamplePath, workItemPayloads.slice(0, sampleSize));
writeJson(partItemSamplePath, partItemPayloads.slice(0, sampleSize));
writeJson(warningSamplePath, warningPayloads.slice(0, sampleSize));

console.log(JSON.stringify(summary, null, 2));
