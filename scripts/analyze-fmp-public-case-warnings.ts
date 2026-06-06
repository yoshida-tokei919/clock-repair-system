import { readFileSync } from "node:fs";

type Severity = "critical" | "review" | "info";

type WorkItem = {
  workItemKey: string;
  sourceArea: "internal" | "external" | "outsourced";
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
};

type PartItem = {
  sourceArea: "internal" | "external";
  sourceSlot: 1 | 2 | 3;
  sourceText: string;
  normalizedSourceText: string;
  displayName?: string;
  price?: number;
  relatedWorkItemKey?: string;
};

type PublicCaseCandidate = {
  sourceRepairId: string;
  brandName?: string;
  modelName?: string;
  ref?: string;
  hasPublishableInternalWork: boolean;
  hasPublishableExternalWork: boolean;
  internalWorkItems: WorkItem[];
  externalWorkItems: WorkItem[];
  outsourcedWorkItems?: WorkItem[];
  partItems: PartItem[];
  warnings: string[];
  excludeReasons: string[];
};

type WarningExample = {
  sourceRepairId: string;
  brandName?: string;
  modelName?: string;
  ref?: string;
  warning: string;
  warningType: string;
  warningTarget?: string;
  sourceText?: string;
  normalizedSourceText?: string;
  partText?: string;
  partPrice?: number;
  workItem?: WorkItem;
};

const inputPath = "docs/data/fmp/generated/public-case-candidates.json";

function classifyWarning(warningType: string): { severity: Severity; reason: string } {
  if (warningType === "part_without_publishable_work") {
    return {
      severity: "review",
      reason: "部品欄はあるが対応する公開候補WorkItemがないため、B2B部品代表示や作業との紐づけを公開前に確認する",
    };
  }

  if (warningType === "source_text_normalized") {
    return {
      severity: "info",
      reason: "制御文字などを突合用キーから除去したログ。元原文は保持されており、正規化後の件数は061と一致済み",
    };
  }

  return {
    severity: "review",
    reason: "未知の警告種別のため確認対象",
  };
}

function warningTypeOf(warning: string): string {
  return warning.split(":")[0] ?? warning;
}

function warningTargetOf(warning: string): string | undefined {
  return warning.includes(":") ? warning.split(":").slice(1).join(":") : undefined;
}

function keyForPart(item: PartItem): string {
  return `${item.sourceArea}-${item.sourceSlot}`;
}

function findWorkItem(candidate: PublicCaseCandidate, key: string | undefined): WorkItem | undefined {
  if (!key) return undefined;
  return [
    ...candidate.internalWorkItems,
    ...candidate.externalWorkItems,
    ...(candidate.outsourcedWorkItems ?? []),
  ].find((item) => item.workItemKey === key);
}

function findPartItems(candidate: PublicCaseCandidate, key: string | undefined): PartItem[] {
  if (!key) return [];
  return candidate.partItems.filter((item) => keyForPart(item) === key);
}

function buildExample(candidate: PublicCaseCandidate, warning: string): WarningExample {
  const warningType = warningTypeOf(warning);
  const warningTarget = warningTargetOf(warning);
  const workItem = findWorkItem(candidate, warningTarget);
  const partItems = findPartItems(candidate, warningTarget);
  const firstPart = partItems[0];

  return {
    sourceRepairId: candidate.sourceRepairId,
    brandName: candidate.brandName,
    modelName: candidate.modelName,
    ref: candidate.ref,
    warning,
    warningType,
    warningTarget,
    sourceText: workItem?.sourceText,
    normalizedSourceText: workItem?.normalizedSourceText,
    partText: firstPart?.sourceText,
    partPrice: firstPart?.price,
    workItem,
  };
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function sortedEntries(map: Map<string, number>): Array<[string, number]> {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const candidates = JSON.parse(readFileSync(inputPath, "utf8")) as PublicCaseCandidate[];
const warningExamples: WarningExample[] = [];

for (const candidate of candidates) {
  for (const warning of candidate.warnings) {
    warningExamples.push(buildExample(candidate, warning));
  }
}

const warningTypeCounts = countBy(warningExamples, (example) => example.warningType);
const severityCounts = new Map<Severity, number>([
  ["critical", 0],
  ["review", 0],
  ["info", 0],
]);

for (const example of warningExamples) {
  const { severity } = classifyWarning(example.warningType);
  severityCounts.set(severity, (severityCounts.get(severity) ?? 0) + 1);
}

const partWarnings = warningExamples.filter(
  (example) => example.warningType === "part_without_publishable_work",
);
const partWarningsByArea = countBy(partWarnings, (example) => example.warningTarget?.split("-")[0] ?? "unknown");
const partWarningsByTarget = countBy(partWarnings, (example) => example.warningTarget ?? "unknown");
const partWarningsByWorkExcludeReason = countBy(
  partWarnings,
  (example) => example.workItem?.excludeReason ?? "no_work_item_same_slot",
);
const normalizedWarnings = warningExamples.filter(
  (example) => example.warningType === "source_text_normalized",
);

function printExamples(title: string, examples: WarningExample[]) {
  console.log(title);
  console.table(
    examples.slice(0, 8).map((example) => ({
      repairId: example.sourceRepairId,
      brand: example.brandName,
      model: example.modelName,
      ref: example.ref,
      warning: example.warning,
      workText: example.sourceText,
      normalized: example.normalizedSourceText,
      partText: example.partText,
      partPrice: example.partPrice,
      workExcludeReason: example.workItem?.excludeReason,
    })),
  );
}

console.log("FMP public case warning analysis");
console.log(`Candidate cases: ${candidates.length}`);
console.log(`Total warnings: ${warningExamples.length}`);
console.log("");
console.log("Warning type counts:");
console.table(Object.fromEntries(sortedEntries(warningTypeCounts)));
console.log("Severity counts:");
console.table(Object.fromEntries(sortedEntries(severityCounts)));
console.log("part_without_publishable_work by area:");
console.table(Object.fromEntries(sortedEntries(partWarningsByArea)));
console.log("part_without_publishable_work by slot:");
console.table(Object.fromEntries(sortedEntries(partWarningsByTarget)));
console.log("part_without_publishable_work by related work exclude reason:");
console.table(Object.fromEntries(sortedEntries(partWarningsByWorkExcludeReason)));
console.log("");
printExamples("Examples: part_without_publishable_work", partWarnings);
printExamples("Examples: source_text_normalized", normalizedWarnings);
