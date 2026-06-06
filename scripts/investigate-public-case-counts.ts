import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

type CsvRow = Record<string, string>;

type ZipEntry = {
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
  name: string;
};

const csvPath = "docs/data/fmp/source/fmp-repair-export-original.csv";
const internalXlsxPath =
  "docs/data/fmp/internal-repair/内装修理_部品名ドリルダウンレビュー用_掲載99件反映版.xlsx";
const externalXlsxPath = "docs/data/fmp/external-repair/外装修理_第3次レビュー候補.xlsx";

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

function escapeControlChars(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 ? `\\x${code.toString(16).toUpperCase().padStart(2, "0")}` : char;
    })
    .join("");
}

function normalizeRepairWorkNameForMatch(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\x00-\x1F]+/g, "")
    .trim();
}

function isExternalCandidate(rule: CsvRow | undefined): boolean {
  if (!rule) return false;

  const result = rule["ヨシダ確認結果"] ?? "";
  const displayName = rule["表示名"] ?? "";

  if (result.includes("掲載対象外")) return false;
  if (result.includes("内装修理へ")) return false;
  if (result.includes("巻芯は内装")) return false;

  return result.trim() !== "" && displayName.trim() !== "";
}

function buildRuleMap(rules: CsvRow[], keyColumn: string, normalize: boolean): Map<string, CsvRow> {
  const map = new Map<string, CsvRow>();
  for (const rule of rules) {
    const rawKey = rule[keyColumn] ?? "";
    const key = normalize ? normalizeRepairWorkNameForMatch(rawKey) : rawKey;
    if (key !== "") map.set(key, rule);
  }
  return map;
}

function summarizeCandidates(normalize: boolean) {
  const internalRuleMap = buildRuleMap(candidateRules, "原文", normalize);
  const externalRuleMap = buildRuleMap(externalRules, "原文", normalize);
  const internalCandidateRepairIds = new Set<string>();
  const externalCandidateRepairIds = new Set<string>();
  let internalCandidateDetails = 0;
  let externalCandidateDetails = 0;

  for (const row of csvRows) {
    const repairId = row["修理ID"];

    for (const slot of [1, 2, 3]) {
      const internalValue = row[`内装修理内容${slot}`] ?? "";
      const internalKey = normalize
        ? normalizeRepairWorkNameForMatch(internalValue)
        : internalValue;

      if (internalKey !== "" && internalRuleMap.has(internalKey)) {
        internalCandidateDetails++;
        internalCandidateRepairIds.add(repairId);
      }

      const externalValue = row[`外装修理内容${slot}`] ?? "";
      const externalKey = normalize
        ? normalizeRepairWorkNameForMatch(externalValue)
        : externalValue;
      const externalRule = externalRuleMap.get(externalKey);

      if (externalKey !== "" && isExternalCandidate(externalRule)) {
        externalCandidateDetails++;
        externalCandidateRepairIds.add(repairId);
      }
    }
  }

  const eitherCandidateRepairIds = new Set([
    ...Array.from(internalCandidateRepairIds),
    ...Array.from(externalCandidateRepairIds),
  ]);
  let internalOnlyRepairIds = 0;
  let bothRepairIds = 0;
  let externalOnlyRepairIds = 0;

  for (const repairId of Array.from(internalCandidateRepairIds)) {
    if (externalCandidateRepairIds.has(repairId)) {
      bothRepairIds++;
    } else {
      internalOnlyRepairIds++;
    }
  }

  for (const repairId of Array.from(externalCandidateRepairIds)) {
    if (!internalCandidateRepairIds.has(repairId)) externalOnlyRepairIds++;
  }

  return {
    internalCandidateDetails,
    externalCandidateDetails,
    eitherCandidateRepairIds: eitherCandidateRepairIds.size,
    internalOnlyRepairIds,
    externalOnlyRepairIds,
    bothRepairIds,
  };
}

const csvRows = parseCsv(readFileSync(csvPath, "utf8"), fmpHeaders);
const internalRules = rowsToObjects(readXlsxSheet(internalXlsxPath, "掲載判定_全件")).filter(
  (row) => row["原文"],
);
const candidateRules = internalRules.filter((row) =>
  row["掲載可否"]?.startsWith("掲載候補"),
);
const externalRules = rowsToObjects(readXlsxSheet(externalXlsxPath, "確認済みサマリー")).filter(
  (row) => row["原文"],
);

const csvCounts = new Map<string, number>();
const csvDetails = new Map<string, CsvRow[]>();

for (const row of csvRows) {
  for (const slot of [1, 2, 3]) {
    const value = row[`内装修理内容${slot}`] ?? "";
    if (value.trim() === "") continue;

    csvCounts.set(value, (csvCounts.get(value) ?? 0) + 1);
    const detail = {
      修理ID: row["修理ID"],
      slot: String(slot),
      原文: value,
      ブランド: row["ブランド"],
      モデル名: row["モデル名"],
      REF: row["REF"],
      技術料: row[`内装修理技術料${slot}`] ?? "",
    };
    csvDetails.set(value, [...(csvDetails.get(value) ?? []), detail]);
  }
}

const diffs = candidateRules
  .map((rule) => {
    const source = rule["原文"] ?? "";
    const excelCount = Number(rule["件数"] ?? 0);
    const csvCount = csvCounts.get(source) ?? 0;
    return {
      原文: source,
      正規作業名: rule["正規作業名（確定）"] ?? "",
      掲載可否: rule["掲載可否"] ?? "",
      excelCount,
      csvCount,
      diff: excelCount - csvCount,
    };
  })
  .filter((diff) => diff.diff !== 0);

const excelCandidateCount = candidateRules.reduce(
  (sum, rule) => sum + Number(rule["件数"] ?? 0),
  0,
);
const csvExactCandidateCount = candidateRules.reduce(
  (sum, rule) => sum + (csvCounts.get(rule["原文"] ?? "") ?? 0),
  0,
);
const rawSummary = summarizeCandidates(false);
const normalizedSummary = summarizeCandidates(true);

console.log("Internal public case candidate count diff investigation");
console.log(`Excel candidate detail count: ${excelCandidateCount}`);
console.log(`CSV exact candidate detail count: ${csvExactCandidateCount}`);
console.log(`Diff: ${excelCandidateCount - csvExactCandidateCount}`);
console.log("");
console.log("Rule-level diffs:");
console.table(diffs);

console.log("Detail rows explained by control-character variants:");
for (const diff of diffs) {
  for (const [csvValue, details] of Array.from(csvDetails.entries())) {
    if (csvValue.replace(/[\x00-\x1F]+/g, "") !== diff.原文) continue;
    if (csvValue === diff.原文) continue;
    for (const detail of details) {
      console.log({
        修理ID: detail["修理ID"],
        slot: detail["slot"],
        CSV側の値: escapeControlChars(detail["原文"]),
        Excelルール側の値: diff.原文,
        ブランド: detail["ブランド"],
        モデル名: detail["モデル名"],
        REF: detail["REF"],
        技術料: detail["技術料"],
        差分原因: "CSV側の末尾に制御文字があるため完全一致しない",
      });
    }
  }
}

console.log("");
console.log("Public case candidate recount:");
console.log("Before normalization:");
console.table(rawSummary);
console.log("After normalization:");
console.table(normalizedSummary);
