import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

type CsvRow = Record<string, string>;

type ZipEntry = {
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
  name: string;
};

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
  displayNameWarnings?: string[];
  placeholderResolved?: boolean;
  placeholderPartName?: string;
  readingKanaRemoved?: boolean;
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
  internalWorkItems: WorkItem[];
  externalWorkItems: WorkItem[];
  outsourcedWorkItems: WorkItem[];
  partItems: PartItem[];
  warnings: string[];
  excludeReasons: string[];
};

type BrandKanaApproved = {
  sourceBrandName: string;
  approvedBrandName: string;
  approvedBrandNameKana: string;
  approvedDisplayName: string;
  hasKana: boolean;
  sourceCount: number;
  reviewStatus: string;
  note: string;
};

type ExcludedCopyKeywordCase = {
  sourceRepairId: string;
  matchedFields: Array<{ field: string; value: string }>;
};

const csvPath = "docs/data/fmp/source/fmp-repair-export-original.csv";
const internalXlsxPath =
  "docs/data/fmp/internal-repair/内装修理_部品名ドリルダウンレビュー用_掲載99件反映版.xlsx";
const externalXlsxPath = "docs/data/fmp/external-repair/外装修理_第3次レビュー候補.xlsx";
const outputDir = "docs/data/fmp/generated";
const outputJsonPath = `${outputDir}/public-case-candidates.json`;
const outputSampleJsonPath = `${outputDir}/public-case-candidates.sample.json`;
const outputCsvPath = `${outputDir}/public-case-candidates.csv`;
const outputDisplayNameAuditPath = `${outputDir}/public-case-display-name-cleanup-audit.json`;
const brandKanaApprovedPath = `${outputDir}/brand-kana-approved.json`;
const outputExcludedCopyKeywordPath = `${outputDir}/public-case-excluded-copy-keyword.json`;

const fmpHeaders = [
  "修理ID",
  "受付日",
  "ブランド",
  "モデル名",
  "REF",
  "Cal",
  "内装修理内容1",
  "内装修理技術料1",
  "内装修理内容2",
  "内装修理技術料2",
  "内装修理内容3",
  "内装修理技術料3",
  "外装修理内容1",
  "外装修理技術料1",
  "外装修理内容2",
  "外装修理技術料2",
  "外装修理内容3",
  "外装修理技術料3",
  "外注内容",
  "外注料金",
  "内装部品1",
  "内装部品価格1",
  "内装部品2",
  "内装部品価格2",
  "内装部品3",
  "内装部品価格3",
  "外装部品1",
  "外装部品価格1",
  "外装部品2",
  "外装部品価格2",
  "外装部品3",
  "外装部品価格3",
  "合計金額",
];

function parseCsv(text: string, headers: string[]): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows
    .filter((values) => values.some((value) => value !== ""))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let offset = buffer.length - 22; offset >= 0; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("ZIP end of central directory not found");
}

function getZipEntryMap(buffer: Buffer): Map<string, Buffer> {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];

  let offset = centralDirectoryOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory at ${offset}`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");

    entries.push({ compressionMethod, compressedSize, localHeaderOffset, name });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  const map = new Map<string, Buffer>();
  for (const entry of entries) {
    const localOffset = entry.localHeaderOffset;
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP local header for ${entry.name}`);
    }

    const fileNameLength = buffer.readUInt16LE(localOffset + 26);
    const extraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + fileNameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

    if (entry.compressionMethod === 0) {
      map.set(entry.name, compressed);
    } else if (entry.compressionMethod === 8) {
      map.set(entry.name, inflateRawSync(compressed));
    } else {
      throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod}`);
    }
  }

  return map;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function getAttribute(xmlTag: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}="([^"]*)"`);
  return xmlTag.match(pattern)?.[1];
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const itemRegex = /<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(xml))) {
    const textParts: string[] = [];
    const textRegex = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;
    let textMatch: RegExpExecArray | null;
    const textWithoutPhonetics = itemMatch[1].replace(
      /<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g,
      "",
    );
    while ((textMatch = textRegex.exec(textWithoutPhonetics))) {
      textParts.push(decodeXml(textMatch[1]));
    }
    strings.push(textParts.join(""));
  }

  return strings;
}

function columnIndex(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/)?.[0];
  if (!letters) return -1;

  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - "A".charCodeAt(0) + 1;
  }
  return index - 1;
}

function readXlsxSheet(path: string, sheetName: string): string[][] {
  const entries = getZipEntryMap(readFileSync(path));
  const workbookXml = entries.get("xl/workbook.xml")?.toString("utf8");
  const relsXml = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  const sharedXml = entries.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";

  if (!workbookXml || !relsXml) throw new Error("Invalid XLSX workbook");

  const sharedStrings = parseSharedStrings(sharedXml);
  const relMap = new Map<string, string>();
  const relRegex = /<Relationship\b([^>]*)\/>/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relRegex.exec(relsXml))) {
    const id = getAttribute(relMatch[1], "Id");
    const target = getAttribute(relMatch[1], "Target");
    if (id && target) relMap.set(id, target);
  }

  const sheetRegex = /<(?:\w+:)?sheet\b([^>]*)\/>/g;
  let sheetTarget: string | undefined;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetRegex.exec(workbookXml))) {
    if (decodeXml(getAttribute(sheetMatch[1], "name") ?? "") !== sheetName) continue;
    const relId = getAttribute(sheetMatch[1], "r:id");
    if (relId) sheetTarget = relMap.get(relId);
  }

  if (!sheetTarget) throw new Error(`Sheet not found: ${sheetName}`);

  const sheetPath = `xl/${sheetTarget.replace(/^\/?xl\//, "")}`;
  const sheetXml = entries.get(sheetPath)?.toString("utf8");
  if (!sheetXml) throw new Error(`Sheet XML not found: ${sheetPath}`);

  const rows: string[][] = [];
  const rowRegex = /<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetXml))) {
    const row: string[] = [];
    const cellRegex = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const attributes = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const ref = getAttribute(attributes, "r") ?? "";
      const type = getAttribute(attributes, "t");
      const index = columnIndex(ref);
      const rawValue = body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? "";
      const bodyWithoutPhonetics = body.replace(
        /<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g,
        "",
      );
      const inlineValue = Array.from(
        bodyWithoutPhonetics.matchAll(
          /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g,
        ),
      )
        .map((match) => decodeXml(match[1]))
        .join("");

      let value = rawValue;
      if (type === "s" && rawValue !== "") value = sharedStrings[Number(rawValue)] ?? "";
      if (
        type === "str" &&
        rawValue !== "" &&
        !Number.isNaN(Number(rawValue)) &&
        sharedStrings[Number(rawValue)]
      ) {
        value = sharedStrings[Number(rawValue)];
      }
      if (type === "inlineStr") value = inlineValue;
      if (index >= 0) row[index] = decodeXml(value);
    }
    rows.push(row.map((value) => value ?? ""));
  }

  return rows;
}

function rowsToObjects(rows: string[][]): CsvRow[] {
  const headers = rows[0] ?? [];
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
}

function normalizeRepairWorkNameForMatch(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\x00-\x1F]+/g, "")
    .trim();
}

function parseAmount(value: string | null | undefined): number | undefined {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  if (normalized === "") return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === "") continue;
    result[key] = entry;
  }
  return result as T;
}

function buildRuleMap(rules: CsvRow[]): Map<string, CsvRow> {
  const map = new Map<string, CsvRow>();
  for (const rule of rules) {
    const key = normalizeRepairWorkNameForMatch(rule["原文"]);
    if (key !== "") map.set(key, rule);
  }
  return map;
}

function isInternalPublishable(rule: CsvRow | undefined): boolean {
  return Boolean(rule?.["掲載可否"]?.startsWith("掲載候補"));
}

function isExternalPublishable(rule: CsvRow | undefined): boolean {
  if (!rule) return false;

  const result = rule["ヨシダ確認結果"] ?? "";
  const displayName = rule["表示名"] ?? "";

  if (result.includes("掲載対象外")) return false;
  if (result.includes("内装修理へ")) return false;
  if (result.includes("巻芯は内装")) return false;

  return result.trim() !== "" && displayName.trim() !== "";
}

function buildInternalExcludeReason(rule: CsvRow | undefined): string | undefined {
  if (!rule) return "internal_rule_unmatched";
  if (isInternalPublishable(rule)) return undefined;
  if (rule["ユーザーレビュー範囲"]?.includes("未レビュー")) return "internal_work_unreviewed";
  return "internal_work_excluded";
}

function buildExternalExcludeReason(rule: CsvRow | undefined): string | undefined {
  if (!rule) return "external_rule_unmatched_or_unreviewed";
  if (isExternalPublishable(rule)) return undefined;
  const result = rule["ヨシダ確認結果"] ?? "";
  if (result.includes("掲載対象外")) return "external_work_not_public";
  if (result.includes("内装修理へ") || result.includes("巻芯は内装")) {
    return "external_work_moved_to_internal";
  }
  if ((rule["表示名"] ?? "").trim() === "") return "external_display_name_missing";
  return "external_work_needs_review";
}

function stripLaborSuffix(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/技術料.*$/, "").trim() || value;
}

const readingKanaTerms = [
  "ハリトリツケ",
  "コウカンギジュツリョウ",
  "シュウリ",
  "チョウセイ",
  "トリツケ",
  "ハリチッコウトソウ",
  "ボウスイケンサ",
  "レイトツ",
  "オコマキシンジョキョ",
  "モジバンセッチャク",
  "ベルトゼンスウ",
  "シュウセイ",
  "フウボウケンマ",
  "セイサク",
  "カシメ",
  "ケンマ",
  "メッキ",
  "イチバン",
];

const protectedKatakanaWords = [
  "ガラス",
  "リューズ",
  "パッキン",
  "ブレス",
  "ケース",
  "ベゼル",
  "インデックス",
  "コイル",
  "ローター",
  "クロノグラフ",
  "カレンダー",
  "ムーブメント",
  "オーバーホール",
];

const autoRemoveKatakanaSuffixPatterns = [
  /シュウリ$/,
  /チョウセイ$/,
  /トリツケ$/,
  /コウカン$/,
  /ギジュツリョウ$/,
  /トソウ$/,
  /セイドチョウセイ$/,
  /チッコウトソウ$/,
];

const displayNameCleanupAudit = {
  autoRemovedReadingKana: new Map<string, number>(),
  unknownKatakanaSuffixCandidates: new Map<string, number>(),
  unknownKatakanaSuffixExamples: new Map<string, string[]>(),
  reviewKatakanaSuffixCount: 0,
  emptyDisplayNameCount: 0,
  suspiciousRemainingTerms: new Map<string, number>(),
  suspiciousRemainingB2bSuffixes: new Map<string, number>(),
  suspiciousRemainingB2cSuffixes: new Map<string, number>(),
};

function normalizeDisplayText(value: string | undefined): string | undefined {
  const normalized = String(value ?? "")
    .replace(/[\x00-\x1F]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || undefined;
}

function incrementMap(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function appendExample(map: Map<string, string[]>, key: string, value: string): void {
  const examples = map.get(key) ?? [];
  if (examples.length < 5 && !examples.includes(value)) {
    examples.push(value);
    map.set(key, examples);
  }
}

function hasProtectedKatakanaSuffix(value: string): boolean {
  return protectedKatakanaWords.some((word) => value.endsWith(word));
}

function isAutoRemoveKatakanaSuffix(suffix: string): boolean {
  if (readingKanaTerms.includes(suffix)) return true;
  if (protectedKatakanaWords.includes(suffix)) return false;
  return autoRemoveKatakanaSuffixPatterns.some((pattern) => pattern.test(suffix));
}

function findKatakanaSuffixCandidate(value: string): { prefix: string; suffix: string } | undefined {
  const match = value.match(/^(.+?)([ァ-ヶー]{3,})$/);
  if (!match) return undefined;

  const [, prefix, suffix] = match;
  if (!/[一-龠々ぁ-んA-Za-z0-9（）()]/.test(prefix)) return undefined;
  if (protectedKatakanaWords.includes(value) || hasProtectedKatakanaSuffix(value)) return undefined;

  return { prefix, suffix };
}

function removeReadingKana(value: string): {
  value: string;
  removed: boolean;
  removedTerms: string[];
  reviewSuffixes: string[];
} {
  let result = value;
  const removedTerms: string[] = [];
  const reviewSuffixes: string[] = [];
  for (const term of readingKanaTerms) {
    if (!result.includes(term)) continue;
    result = result.replaceAll(term, "");
    removedTerms.push(term);
    incrementMap(displayNameCleanupAudit.autoRemovedReadingKana, term);
  }

  const suffixCandidate = findKatakanaSuffixCandidate(result);
  if (suffixCandidate) {
    if (isAutoRemoveKatakanaSuffix(suffixCandidate.suffix)) {
      result = suffixCandidate.prefix;
      removedTerms.push(suffixCandidate.suffix);
      incrementMap(displayNameCleanupAudit.autoRemovedReadingKana, suffixCandidate.suffix);
    } else {
      reviewSuffixes.push(suffixCandidate.suffix);
      incrementMap(displayNameCleanupAudit.unknownKatakanaSuffixCandidates, suffixCandidate.suffix);
      appendExample(displayNameCleanupAudit.unknownKatakanaSuffixExamples, suffixCandidate.suffix, result);
      displayNameCleanupAudit.reviewKatakanaSuffixCount += 1;
    }
  }

  result = result.replace(/\s+/g, " ").trim();
  return {
    value: result,
    removed: result !== value,
    removedTerms: unique(removedTerms),
    reviewSuffixes: unique(reviewSuffixes),
  };
}

function stripB2CLaborText(value: string): string {
  return value
    .replace(/技術料/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findSameSlotPartName(workItem: WorkItem, partItems: PartItem[]): string | undefined {
  if (workItem.sourceArea !== "internal" && workItem.sourceArea !== "external") return undefined;

  const part = partItems.find(
    (item) =>
      item.sourceArea === workItem.sourceArea &&
      item.sourceSlot === workItem.sourceSlot &&
      normalizeDisplayText(item.displayName ?? item.normalizedSourceText),
  );

  return normalizeDisplayText(part?.displayName ?? part?.normalizedSourceText);
}

function buildDisplayNames(
  workItem: WorkItem,
  partItems: PartItem[],
): Pick<
  WorkItem,
  | "normalizedWorkName"
  | "b2bDisplayName"
  | "b2cDisplayName"
  | "displayNameWarnings"
  | "placeholderResolved"
  | "placeholderPartName"
  | "readingKanaRemoved"
> {
  const rawDisplayName =
    normalizeDisplayText(workItem.normalizedWorkName) ??
    normalizeDisplayText(workItem.b2bDisplayName) ??
    normalizeDisplayText(workItem.normalizedSourceText);
  const warnings: string[] = [];
  const readingRemoved = removeReadingKana(rawDisplayName ?? "");
  let b2bDisplayName = readingRemoved.value;
  let placeholderResolved = false;
  let placeholderPartName: string | undefined;

  if (readingRemoved.removed) warnings.push("reading_kana_removed");
  if (readingRemoved.reviewSuffixes.length > 0) warnings.push("katakana_suffix_review");

  if (b2bDisplayName.includes("○○")) {
    placeholderPartName = findSameSlotPartName(workItem, partItems);
    if (placeholderPartName) {
      b2bDisplayName = b2bDisplayName.replaceAll("○○", placeholderPartName);
      placeholderResolved = true;
      warnings.push("placeholder_resolved_with_part");
    } else {
      b2bDisplayName = b2bDisplayName.replaceAll("○○", "").trim();
      warnings.push("placeholder_removed_without_part");
    }
  }

  b2bDisplayName = normalizeDisplayText(b2bDisplayName) ?? "";
  if (b2bDisplayName === "") {
    displayNameCleanupAudit.emptyDisplayNameCount += 1;
  }

  let b2cDisplayName = stripB2CLaborText(b2bDisplayName);
  if (b2cDisplayName === "交換" && placeholderPartName) {
    b2cDisplayName = `${placeholderPartName}交換`;
  }

  const safeB2cDisplayName =
    b2cDisplayName && !b2cDisplayName.includes("○○") && !b2cDisplayName.includes("技術料")
      ? b2cDisplayName
      : undefined;

  if (!safeB2cDisplayName && workItem.isPublishable) {
    warnings.push("b2c_display_name_missing");
  }

  for (const term of ["○○", "ハリトリツケ", "ハリチッコウトソウ", "コウカンギジュツリョウ"]) {
    if (b2bDisplayName.includes(term) || safeB2cDisplayName?.includes(term)) {
      incrementMap(displayNameCleanupAudit.suspiciousRemainingTerms, term);
    }
  }
  if (safeB2cDisplayName?.includes("技術料")) {
    incrementMap(displayNameCleanupAudit.suspiciousRemainingTerms, "b2c:技術料");
  }

  const remainingB2bSuffix = findKatakanaSuffixCandidate(b2bDisplayName);
  if (remainingB2bSuffix && !isAutoRemoveKatakanaSuffix(remainingB2bSuffix.suffix)) {
    incrementMap(displayNameCleanupAudit.suspiciousRemainingB2bSuffixes, remainingB2bSuffix.suffix);
  }

  const remainingB2cSuffix = safeB2cDisplayName
    ? findKatakanaSuffixCandidate(safeB2cDisplayName)
    : undefined;
  if (remainingB2cSuffix && !isAutoRemoveKatakanaSuffix(remainingB2cSuffix.suffix)) {
    incrementMap(displayNameCleanupAudit.suspiciousRemainingB2cSuffixes, remainingB2cSuffix.suffix);
  }

  return compact({
    normalizedWorkName: b2bDisplayName,
    b2bDisplayName,
    b2cDisplayName: safeB2cDisplayName,
    displayNameWarnings: unique(warnings),
    placeholderResolved,
    placeholderPartName,
    readingKanaRemoved: readingRemoved.removed,
  });
}

function applyDisplayNameRules(workItems: WorkItem[], partItems: PartItem[]): WorkItem[] {
  return workItems.map(
    (item) =>
      compact({
        ...item,
        ...buildDisplayNames(item, partItems),
      }) as WorkItem,
  );
}

function buildInternalWorkItem(row: CsvRow, slot: 1 | 2 | 3, ruleMap: Map<string, CsvRow>): WorkItem | undefined {
  const sourceText = row[`内装修理内容${slot}`] ?? "";
  const normalizedSourceText = normalizeRepairWorkNameForMatch(sourceText);
  if (normalizedSourceText === "") return undefined;

  const rule = ruleMap.get(normalizedSourceText);
  const normalizedWorkName = rule?.["正規作業名（確定）"] || rule?.["自動生成案"];
  const isPublishable = isInternalPublishable(rule);
  const excludeReason = buildInternalExcludeReason(rule);

  return compact({
    workItemKey: `internal-${slot}`,
    sourceArea: "internal" as const,
    sourceSlot: slot,
    sourceText,
    normalizedSourceText,
    isRuleMatched: Boolean(rule),
    isPublishable,
    normalizedWorkName,
    b2bDisplayName: normalizedWorkName,
    b2cDisplayName: normalizedWorkName,
    laborPrice: parseAmount(row[`内装修理技術料${slot}`]),
    reviewStatus: isPublishable
      ? "reviewed"
      : rule?.["ユーザーレビュー範囲"]?.includes("未レビュー")
        ? "unreviewed"
        : "excluded",
    excludeReason,
  }) as WorkItem;
}

function buildExternalWorkItem(row: CsvRow, slot: 1 | 2 | 3, ruleMap: Map<string, CsvRow>): WorkItem | undefined {
  const sourceText = row[`外装修理内容${slot}`] ?? "";
  const normalizedSourceText = normalizeRepairWorkNameForMatch(sourceText);
  if (normalizedSourceText === "") return undefined;

  const rule = ruleMap.get(normalizedSourceText);
  const displayName = rule?.["表示名"];
  const isPublishable = isExternalPublishable(rule);
  const excludeReason = buildExternalExcludeReason(rule);

  return compact({
    workItemKey: `external-${slot}`,
    sourceArea: "external" as const,
    sourceSlot: slot,
    sourceText,
    normalizedSourceText,
    isRuleMatched: Boolean(rule),
    isPublishable,
    normalizedWorkName: displayName,
    b2bDisplayName: displayName,
    b2cDisplayName: stripLaborSuffix(displayName),
    laborPrice: parseAmount(row[`外装修理技術料${slot}`]),
    reviewStatus: isPublishable ? "reviewed" : "excluded",
    excludeReason,
  }) as WorkItem;
}

function buildOutsourcedWorkItem(row: CsvRow): WorkItem | undefined {
  const sourceText = row["外注内容"] ?? "";
  const normalizedSourceText = normalizeRepairWorkNameForMatch(sourceText);
  if (normalizedSourceText === "") return undefined;

  return compact({
    workItemKey: "outsourced-1",
    sourceArea: "outsourced" as const,
    sourceSlot: 1 as const,
    sourceText,
    normalizedSourceText,
    isRuleMatched: false,
    isPublishable: false,
    normalizedWorkName: normalizedSourceText,
    b2bDisplayName: normalizedSourceText,
    b2cDisplayName: normalizedSourceText,
    laborPrice: parseAmount(row["外注料金"]),
    reviewStatus: "excluded",
    excludeReason: "outsourced_work_not_public_candidate",
  }) as WorkItem;
}

function buildPartItems(row: CsvRow, workItems: WorkItem[]): PartItem[] {
  const items: PartItem[] = [];
  const publishableKeys = new Set(workItems.filter((item) => item.isPublishable).map((item) => item.workItemKey));

  for (const area of ["internal", "external"] as const) {
    for (const slot of [1, 2, 3] as const) {
      const nameColumn = area === "internal" ? `内装部品${slot}` : `外装部品${slot}`;
      const priceColumn = area === "internal" ? `内装部品価格${slot}` : `外装部品価格${slot}`;
      const sourceText = row[nameColumn] ?? "";
      const normalizedSourceText = normalizeRepairWorkNameForMatch(sourceText);
      if (normalizedSourceText === "") continue;

      const relatedWorkItemKey = publishableKeys.has(`${area}-${slot}`) ? `${area}-${slot}` : undefined;
      items.push(
        compact({
          sourceArea: area,
          sourceSlot: slot,
          sourceText,
          normalizedSourceText,
          displayName: normalizedSourceText,
          price: parseAmount(row[priceColumn]),
          relatedWorkItemKey,
        }),
      );
    }
  }

  return items;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function loadBrandKanaApprovedMap(): Map<string, BrandKanaApproved> {
  const rows = JSON.parse(readFileSync(brandKanaApprovedPath, "utf8")) as BrandKanaApproved[];
  return new Map(rows.map((row) => [row.sourceBrandName, row]));
}

function buildBrandSnapshot(sourceBrandName: string, brandKanaMap: Map<string, BrandKanaApproved>) {
  const approved = brandKanaMap.get(sourceBrandName);
  const brandName = approved?.approvedBrandName || sourceBrandName || undefined;
  const brandNameKana = approved?.approvedBrandNameKana || null;
  const brandDisplayName = approved?.approvedDisplayName || brandName;

  return {
    sourceBrandName: sourceBrandName || undefined,
    brandName,
    brandNameKana,
    brandDisplayName,
  };
}

function addSearchToken(tokens: string[], value: string | number | undefined | null) {
  const text = String(value ?? "").trim();
  if (!text || text.includes("\u30b3\u30d4\u30fc")) return;
  tokens.push(text);
}

function addSearchTokenVariants(tokens: string[], value: string | undefined) {
  const text = String(value ?? "").trim();
  if (!text || text.includes("\u30b3\u30d4\u30fc")) return;
  addSearchToken(tokens, text);
  addSearchToken(tokens, text.toLocaleLowerCase());
  addSearchToken(tokens, text.toLocaleUpperCase());
}

function buildSearchText(candidate: {
  sourceBrandName?: string;
  brandName?: string;
  brandNameKana?: string | null;
  brandDisplayName?: string;
  modelName?: string;
  ref?: string;
  caliber?: string;
  internalWorkItems: WorkItem[];
  externalWorkItems: WorkItem[];
  outsourcedWorkItems: WorkItem[];
  partItems: PartItem[];
}): string | undefined {
  const tokens: string[] = [];

  addSearchTokenVariants(tokens, candidate.sourceBrandName);
  addSearchTokenVariants(tokens, candidate.brandName);
  addSearchToken(tokens, candidate.brandNameKana);
  addSearchToken(tokens, candidate.brandDisplayName);
  addSearchToken(tokens, candidate.modelName);
  addSearchToken(tokens, candidate.ref);
  addSearchToken(tokens, candidate.caliber);

  const workItems = [
    ...candidate.internalWorkItems,
    ...candidate.externalWorkItems,
    ...candidate.outsourcedWorkItems,
  ].filter((item) => item.isPublishable);
  for (const item of workItems) {
    addSearchToken(tokens, item.normalizedWorkName);
    addSearchToken(tokens, item.b2bDisplayName);
    addSearchToken(tokens, item.b2cDisplayName);
  }
  for (const item of candidate.partItems) {
    addSearchToken(tokens, item.displayName);
  }

  return unique(tokens).join(" ") || undefined;
}

function collectCopyKeywordMatches(candidate: {
  sourceBrandName?: string;
  brandName?: string;
  brandNameKana?: string | null;
  brandDisplayName?: string;
  modelName?: string;
  ref?: string;
  caliber?: string;
  internalWorkItems: WorkItem[];
  externalWorkItems: WorkItem[];
  outsourcedWorkItems: WorkItem[];
  partItems: PartItem[];
}): Array<{ field: string; value: string }> {
  const fields: Array<{ field: string; value?: string | null }> = [
    { field: "sourceBrandName", value: candidate.sourceBrandName },
    { field: "brandName", value: candidate.brandName },
    { field: "brandNameKana", value: candidate.brandNameKana },
    { field: "brandDisplayName", value: candidate.brandDisplayName },
    { field: "modelName", value: candidate.modelName },
    { field: "ref", value: candidate.ref },
    { field: "caliber", value: candidate.caliber },
  ];

  for (const item of [...candidate.internalWorkItems, ...candidate.externalWorkItems, ...candidate.outsourcedWorkItems]) {
    fields.push({ field: `${item.workItemKey}.sourceText`, value: item.sourceText });
    fields.push({ field: `${item.workItemKey}.b2bDisplayName`, value: item.b2bDisplayName });
    fields.push({ field: `${item.workItemKey}.b2cDisplayName`, value: item.b2cDisplayName });
  }
  candidate.partItems.forEach((item, index) => {
    fields.push({ field: `partItems[${index}].sourceText`, value: item.sourceText });
    fields.push({ field: `partItems[${index}].displayName`, value: item.displayName });
  });

  return fields
    .filter((field): field is { field: string; value: string } =>
      Boolean(field.value?.includes("\u30b3\u30d4\u30fc")),
    )
    .map((field) => ({ field: field.field, value: field.value }));
}

function buildCandidate(
  row: CsvRow,
  internalRuleMap: Map<string, CsvRow>,
  externalRuleMap: Map<string, CsvRow>,
  brandKanaMap: Map<string, BrandKanaApproved>,
): PublicCaseCandidate {
  const internalWorkItems = [1, 2, 3]
    .map((slot) => buildInternalWorkItem(row, slot as 1 | 2 | 3, internalRuleMap))
    .filter((item): item is WorkItem => Boolean(item));
  const externalWorkItems = [1, 2, 3]
    .map((slot) => buildExternalWorkItem(row, slot as 1 | 2 | 3, externalRuleMap))
    .filter((item): item is WorkItem => Boolean(item));
  const outsourcedWorkItem = buildOutsourcedWorkItem(row);
  const outsourcedWorkItems = outsourcedWorkItem ? [outsourcedWorkItem] : [];
  const partItems = buildPartItems(row, [...internalWorkItems, ...externalWorkItems]);
  const internalWorkItemsWithDisplayNames = applyDisplayNameRules(internalWorkItems, partItems);
  const externalWorkItemsWithDisplayNames = applyDisplayNameRules(externalWorkItems, partItems);
  const outsourcedWorkItemsWithDisplayNames = applyDisplayNameRules(outsourcedWorkItems, partItems);
  const allWorkItems = [
    ...internalWorkItemsWithDisplayNames,
    ...externalWorkItemsWithDisplayNames,
    ...outsourcedWorkItemsWithDisplayNames,
  ];
  const hasPublishableInternalWork = internalWorkItemsWithDisplayNames.some((item) => item.isPublishable);
  const hasPublishableExternalWork = externalWorkItemsWithDisplayNames.some((item) => item.isPublishable);
  const isPublishCandidate = hasPublishableInternalWork || hasPublishableExternalWork;
  const excludeReasons = unique(
    allWorkItems.map((item) => item.excludeReason).filter((reason): reason is string => Boolean(reason)),
  );
  const warnings = unique([
    ...partItems
      .filter((item) => !item.relatedWorkItemKey)
      .map((item) => `part_without_publishable_work:${item.sourceArea}-${item.sourceSlot}`),
    ...allWorkItems
      .filter((item) => item.sourceText !== item.normalizedSourceText)
      .map((item) => `source_text_normalized:${item.workItemKey}`),
    ...allWorkItems.flatMap((item) =>
      (item.displayNameWarnings ?? []).map((warning) => `${warning}:${item.workItemKey}`),
    ),
  ]);
  const brandSnapshot = buildBrandSnapshot(row["ブランド"], brandKanaMap);
  const caseForSearchAndCopyCheck = {
    ...brandSnapshot,
    modelName: row["モデル名"],
    ref: row["REF"],
    caliber: row["Cal"],
    internalWorkItems: internalWorkItemsWithDisplayNames,
    externalWorkItems: externalWorkItemsWithDisplayNames,
    outsourcedWorkItems: outsourcedWorkItemsWithDisplayNames,
    partItems,
  };
  const copyKeywordMatches = collectCopyKeywordMatches(caseForSearchAndCopyCheck);
  const hasCopyKeyword = copyKeywordMatches.length > 0;
  const publishCandidateAfterCopyExclusion = isPublishCandidate && !hasCopyKeyword;

  return compact({
    sourceType: "FMP",
    sourceRepairId: row["修理ID"],
    receivedDate: row["受付日"],
    sourceBrandName: brandSnapshot.sourceBrandName,
    brandName: brandSnapshot.brandName,
    brandNameKana: brandSnapshot.brandNameKana,
    brandDisplayName: brandSnapshot.brandDisplayName,
    modelName: row["モデル名"],
    ref: row["REF"],
    caliber: row["Cal"],
    searchText: hasCopyKeyword ? undefined : buildSearchText(caseForSearchAndCopyCheck),
    hasPublishableInternalWork,
    hasPublishableExternalWork,
    isPublishCandidate: publishCandidateAfterCopyExclusion,
    b2bCandidate: publishCandidateAfterCopyExclusion,
    b2cCandidate: publishCandidateAfterCopyExclusion,
    totalAmount: parseAmount(row["合計金額"]),
    internalWorkItems: internalWorkItemsWithDisplayNames,
    externalWorkItems: externalWorkItemsWithDisplayNames,
    outsourcedWorkItems: outsourcedWorkItemsWithDisplayNames,
    partItems,
    warnings: hasCopyKeyword ? unique([...warnings, "contains_copy_keyword"]) : warnings,
    excludeReasons: hasCopyKeyword ? unique([...excludeReasons, "contains_copy_keyword"]) : excludeReasons,
  });
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildSummaryCsv(candidates: PublicCaseCandidate[]): string {
  const headers = [
    "sourceRepairId",
    "receivedDate",
    "sourceBrandName",
    "brandName",
    "brandNameKana",
    "brandDisplayName",
    "modelName",
    "ref",
    "caliber",
    "hasPublishableInternalWork",
    "hasPublishableExternalWork",
    "internalPublishableWorkCount",
    "externalPublishableWorkCount",
    "partItemCount",
    "warningCount",
    "excludeReasonCount",
    "totalAmount",
  ];
  const lines = [headers.join(",")];

  for (const candidate of candidates) {
    const values = [
      candidate.sourceRepairId,
      candidate.receivedDate,
      candidate.sourceBrandName,
      candidate.brandName,
      candidate.brandNameKana,
      candidate.brandDisplayName,
      candidate.modelName,
      candidate.ref,
      candidate.caliber,
      candidate.hasPublishableInternalWork,
      candidate.hasPublishableExternalWork,
      candidate.internalWorkItems.filter((item) => item.isPublishable).length,
      candidate.externalWorkItems.filter((item) => item.isPublishable).length,
      candidate.partItems.length,
      candidate.warnings.length,
      candidate.excludeReasons.length,
      candidate.totalAmount,
    ];
    lines.push(values.map(csvEscape).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function mapToSortedEntries(map: Map<string, number>): Array<{ value: string; count: number }> {
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ja"));
}

function buildDisplayNameCleanupAudit() {
  return {
    autoRemovedReadingKanaCount: Array.from(displayNameCleanupAudit.autoRemovedReadingKana.values()).reduce(
      (sum, count) => sum + count,
      0,
    ),
    autoRemovedReadingKanaUnique: mapToSortedEntries(displayNameCleanupAudit.autoRemovedReadingKana),
    unknownKatakanaSuffixCandidates: mapToSortedEntries(displayNameCleanupAudit.unknownKatakanaSuffixCandidates).map(
      (entry) => ({
        ...entry,
        examples: displayNameCleanupAudit.unknownKatakanaSuffixExamples.get(entry.value) ?? [],
      }),
    ),
    reviewKatakanaSuffixCount: displayNameCleanupAudit.reviewKatakanaSuffixCount,
    emptyDisplayNameCount: displayNameCleanupAudit.emptyDisplayNameCount,
    suspiciousRemainingTerms: mapToSortedEntries(displayNameCleanupAudit.suspiciousRemainingTerms),
    suspiciousRemainingB2bSuffixes: mapToSortedEntries(displayNameCleanupAudit.suspiciousRemainingB2bSuffixes),
    suspiciousRemainingB2cSuffixes: mapToSortedEntries(displayNameCleanupAudit.suspiciousRemainingB2cSuffixes),
    protectedKatakanaWords,
  };
}

const csvRows = parseCsv(readFileSync(csvPath, "utf8"), fmpHeaders);
const internalRules = rowsToObjects(readXlsxSheet(internalXlsxPath, "掲載判定_全件")).filter(
  (row) => row["原文"],
);
const externalRules = rowsToObjects(readXlsxSheet(externalXlsxPath, "確認済みサマリー")).filter(
  (row) => row["原文"],
);
const internalRuleMap = buildRuleMap(internalRules);
const externalRuleMap = buildRuleMap(externalRules);
const brandKanaMap = loadBrandKanaApprovedMap();
const allCases = csvRows.map((row) => buildCandidate(row, internalRuleMap, externalRuleMap, brandKanaMap));
const publicCandidates = allCases.filter((candidate) => candidate.isPublishCandidate);
const sampleCandidates = publicCandidates.slice(0, 20);
const excludedCopyKeywordCases: ExcludedCopyKeywordCase[] = allCases
  .filter((candidate) => candidate.excludeReasons.includes("contains_copy_keyword"))
  .map((candidate) => ({
    sourceRepairId: candidate.sourceRepairId,
    matchedFields: collectCopyKeywordMatches({
      sourceBrandName: candidate.sourceBrandName,
      brandName: candidate.brandName,
      brandNameKana: candidate.brandNameKana,
      brandDisplayName: candidate.brandDisplayName,
      modelName: candidate.modelName,
      ref: candidate.ref,
      caliber: candidate.caliber,
      internalWorkItems: candidate.internalWorkItems,
      externalWorkItems: candidate.externalWorkItems,
      outsourcedWorkItems: candidate.outsourcedWorkItems,
      partItems: candidate.partItems,
    }),
  }));

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputJsonPath, `${JSON.stringify(publicCandidates, null, 2)}\n`, "utf8");
writeFileSync(outputSampleJsonPath, `${JSON.stringify(sampleCandidates, null, 2)}\n`, "utf8");
writeFileSync(outputCsvPath, buildSummaryCsv(publicCandidates), "utf8");
writeFileSync(outputDisplayNameAuditPath, `${JSON.stringify(buildDisplayNameCleanupAudit(), null, 2)}\n`, "utf8");
writeFileSync(outputExcludedCopyKeywordPath, `${JSON.stringify(excludedCopyKeywordCases, null, 2)}\n`, "utf8");

const internalPublishableWorkCount = publicCandidates.reduce(
  (sum, candidate) => sum + candidate.internalWorkItems.filter((item) => item.isPublishable).length,
  0,
);
const externalPublishableWorkCount = publicCandidates.reduce(
  (sum, candidate) => sum + candidate.externalWorkItems.filter((item) => item.isPublishable).length,
  0,
);
const internalOnlyCount = publicCandidates.filter(
  (candidate) => candidate.hasPublishableInternalWork && !candidate.hasPublishableExternalWork,
).length;
const externalOnlyCount = publicCandidates.filter(
  (candidate) => !candidate.hasPublishableInternalWork && candidate.hasPublishableExternalWork,
).length;
const bothCount = publicCandidates.filter(
  (candidate) => candidate.hasPublishableInternalWork && candidate.hasPublishableExternalWork,
).length;
const warningCount = publicCandidates.reduce((sum, candidate) => sum + candidate.warnings.length, 0);
const excludedWorkItemCount = publicCandidates.reduce(
  (sum, candidate) =>
    sum +
    [...candidate.internalWorkItems, ...candidate.externalWorkItems, ...candidate.outsourcedWorkItems].filter(
      (item) => !item.isPublishable,
    ).length,
  0,
);
const excludeReasonCount = publicCandidates.reduce(
  (sum, candidate) => sum + candidate.excludeReasons.length,
  0,
);

console.log("Generated FMP public case candidate intermediate data");
console.table({
  sourceCaseCount: allCases.length,
  generatedCaseCount: publicCandidates.length,
  publicCandidateCaseCount: publicCandidates.length,
  internalPublishableWorkCount,
  externalPublishableWorkCount,
  internalOnlyCount,
  externalOnlyCount,
  bothCount,
  copyKeywordExcludedCaseCount: excludedCopyKeywordCases.length,
  sampleJsonCount: sampleCandidates.length,
  warningCount,
  excludedWorkItemCount,
  excludeReasonCount,
});
console.table({
  autoRemovedReadingKanaCount: buildDisplayNameCleanupAudit().autoRemovedReadingKanaCount,
  unknownKatakanaSuffixCandidateCount: buildDisplayNameCleanupAudit().unknownKatakanaSuffixCandidates.length,
  reviewKatakanaSuffixCount: buildDisplayNameCleanupAudit().reviewKatakanaSuffixCount,
  emptyDisplayNameCount: buildDisplayNameCleanupAudit().emptyDisplayNameCount,
  suspiciousRemainingTermCount: buildDisplayNameCleanupAudit().suspiciousRemainingTerms.length,
});
console.log(`JSON: ${outputJsonPath}`);
console.log(`Sample JSON: ${outputSampleJsonPath}`);
console.log(`CSV: ${outputCsvPath}`);
console.log(`Display name cleanup audit: ${outputDisplayNameAuditPath}`);
console.log(`Copy keyword exclusion audit: ${outputExcludedCopyKeywordPath}`);
