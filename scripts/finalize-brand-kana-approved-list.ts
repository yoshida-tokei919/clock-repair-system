import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ReviewRow = Record<string, string>;

type ApprovedRow = {
  sourceBrandName: string;
  approvedBrandName: string;
  approvedBrandNameKana: string;
  approvedDisplayName: string;
  hasKana: boolean;
  sourceCount: number;
  reviewStatus: string;
  note: string;
};

const GENERATED_DIR = path.join("docs", "data", "fmp", "generated");
const REVIEW_XLSX_PATH = path.join(GENERATED_DIR, "brand-kana-review.xlsx");
const REVIEW_CSV_PATH = path.join(GENERATED_DIR, "brand-kana-review.csv");
const APPROVED_CSV_PATH = path.join(GENERATED_DIR, "brand-kana-approved.csv");
const APPROVED_JSON_PATH = path.join(GENERATED_DIR, "brand-kana-approved.json");

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, ""));
}

function columnIndexFromRef(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let result = 0;
  for (const char of letters) {
    result = result * 26 + (char.charCodeAt(0) - "A".charCodeAt(0) + 1);
  }
  return result - 1;
}

function readSharedStrings(root: string): string[] {
  const sharedStringsPath = path.join(root, "xl", "sharedStrings.xml");
  if (!fs.existsSync(sharedStringsPath)) {
    return [];
  }

  const xml = fs.readFileSync(sharedStringsPath, "utf8");
  const values: string[] = [];
  const siMatches = Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g));

  for (const match of siMatches) {
    const si = match[1];
    const textParts = Array.from(si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map(
      (part: RegExpMatchArray) => decodeXml(part[1]),
    );
    values.push(textParts.length > 0 ? textParts.join("") : stripTags(si));
  }

  return values;
}

function readSheetRowsFromXlsx(filePath: string): ReviewRow[] {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-kana-review-"));

  try {
    execFileSync("tar", ["-xf", path.resolve(filePath), "-C", tempDir], { stdio: "ignore" });
    const sharedStrings = readSharedStrings(tempDir);
    const sheetPath = path.join(tempDir, "xl", "worksheets", "sheet1.xml");
    const sheetXml = fs.readFileSync(sheetPath, "utf8");
    const parsedRows: string[][] = [];

    for (const rowMatch of Array.from(sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g))) {
      const rowXml = rowMatch[1];
      const cells: string[] = [];

      for (const cellMatch of Array.from(rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g))) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const ref = attrs.match(/\br="([^"]+)"/)?.[1] ?? "";
        const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
        const columnIndex = ref ? columnIndexFromRef(ref) : cells.length;
        let value = "";

        if (type === "s") {
          const indexText = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
          value = sharedStrings[Number(indexText)] ?? "";
        } else if (type === "inlineStr") {
          value = stripTags(body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1] ?? "");
        } else {
          value = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
        }

        cells[columnIndex] = value.trim();
      }

      parsedRows.push(cells);
    }

    const headers = parsedRows[0] ?? [];
    return parsedRows
      .slice(1)
      .map((cells) =>
        headers.reduce<ReviewRow>((acc, header, index) => {
          if (header) {
            acc[header] = cells[index] ?? "";
          }
          return acc;
        }, {}),
      )
      .filter((row) => Object.values(row).some((value) => value.trim() !== ""));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function readRowsFromCsv(filePath: string): ReviewRow[] {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const headers = parseCsvLine(lines[0] ?? "");

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<ReviewRow>((acc, header, index) => {
      acc[header] = values[index]?.trim() ?? "";
      return acc;
    }, {});
  });
}

function readReviewRows(): { inputPath: string; rows: ReviewRow[] } {
  if (fs.existsSync(REVIEW_XLSX_PATH)) {
    return { inputPath: REVIEW_XLSX_PATH, rows: readSheetRowsFromXlsx(REVIEW_XLSX_PATH) };
  }
  return { inputPath: REVIEW_CSV_PATH, rows: readRowsFromCsv(REVIEW_CSV_PATH) };
}

function appendNote(note: string, addition: string): string {
  const parts = note
    .split(" / ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.includes(addition)) {
    parts.push(addition);
  }
  return parts.join(" / ");
}

function escapeCsv(value: string | number | boolean): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildApprovedRows(reviewRows: ReviewRow[]): ApprovedRow[] {
  return reviewRows.map((row) => {
    const sourceBrandName = (row.brandName ?? "").trim();
    const confirmedBrandName = (row.confirmedBrandName ?? "").trim();
    const approvedBrandName = confirmedBrandName || sourceBrandName;
    const approvedBrandNameKana = (row.confirmedKana ?? "").trim();
    const hasKana = approvedBrandNameKana !== "";
    let note = (row.note ?? "").trim();

    if (confirmedBrandName) {
      note = appendNote(note, "confirmedBrandName使用");
    }
    if (sourceBrandName.includes("コピー")) {
      note = appendNote(note, "掲載対象外: コピー表記");
    }

    return {
      sourceBrandName,
      approvedBrandName,
      approvedBrandNameKana,
      approvedDisplayName: hasKana
        ? `${approvedBrandNameKana}（${approvedBrandName}）`
        : approvedBrandName,
      hasKana,
      sourceCount: Number(row.sourceCount ?? 0),
      reviewStatus: (row.reviewStatus ?? "").trim() || "pending",
      note,
    };
  });
}

function validateRows(inputCount: number, rows: ApprovedRow[]) {
  const errors: string[] = [];

  if (rows.length !== inputCount) {
    errors.push(`row count mismatch: input=${inputCount}, output=${rows.length}`);
  }
  rows.forEach((row, index) => {
    if (!row.sourceBrandName) {
      errors.push(`row ${index + 1}: sourceBrandName is blank`);
    }
    if (!row.approvedBrandName) {
      errors.push(`row ${index + 1}: approvedBrandName is blank`);
    }
    if (row.hasKana && !row.approvedBrandNameKana) {
      errors.push(`row ${index + 1}: hasKana=true but approvedBrandNameKana is blank`);
    }
    if (!row.hasKana && row.approvedDisplayName !== row.approvedBrandName) {
      errors.push(`row ${index + 1}: hasKana=false displayName mismatch`);
    }
    if (
      row.hasKana &&
      row.approvedDisplayName !== `${row.approvedBrandNameKana}（${row.approvedBrandName}）`
    ) {
      errors.push(`row ${index + 1}: hasKana=true displayName mismatch`);
    }
    if (row.approvedDisplayName.includes("未確認（")) {
      errors.push(`row ${index + 1}: displayName contains 未確認`);
    }
  });

  return errors;
}

function main() {
  const { inputPath, rows: reviewRows } = readReviewRows();
  const approvedRows = buildApprovedRows(reviewRows);
  const errors = validateRows(reviewRows.length, approvedRows);

  if (errors.length > 0) {
    throw new Error(`Validation failed:\n${errors.join("\n")}`);
  }

  const headers: (keyof ApprovedRow)[] = [
    "sourceBrandName",
    "approvedBrandName",
    "approvedBrandNameKana",
    "approvedDisplayName",
    "hasKana",
    "sourceCount",
    "reviewStatus",
    "note",
  ];
  const csv = [
    headers.join(","),
    ...approvedRows.map((row) => headers.map((key) => escapeCsv(row[key])).join(",")),
  ].join("\n");

  fs.writeFileSync(APPROVED_CSV_PATH, `\uFEFF${csv}\n`, "utf8");
  fs.writeFileSync(APPROVED_JSON_PATH, `${JSON.stringify(approvedRows, null, 2)}\n`, "utf8");

  const sourceCountSorted = approvedRows
    .slice()
    .sort((a, b) => b.sourceCount - a.sourceCount || a.sourceBrandName.localeCompare(b.sourceBrandName));
  const noKanaSorted = sourceCountSorted.filter((row) => !row.hasKana);

  console.log(
    JSON.stringify(
      {
        inputPath,
        csvPath: APPROVED_CSV_PATH,
        jsonPath: APPROVED_JSON_PATH,
        totalBrandCount: approvedRows.length,
        hasKanaTrueCount: approvedRows.filter((row) => row.hasKana).length,
        hasKanaFalseCount: approvedRows.filter((row) => !row.hasKana).length,
        confirmedBrandNameUsedCount: approvedRows.filter((row) =>
          row.note.includes("confirmedBrandName使用"),
        ).length,
        copyBrandCount: approvedRows.filter((row) => row.sourceBrandName.includes("コピー")).length,
        topBrands: sourceCountSorted.slice(0, 20).map((row) => ({
          sourceBrandName: row.sourceBrandName,
          approvedBrandName: row.approvedBrandName,
          approvedBrandNameKana: row.approvedBrandNameKana,
          approvedDisplayName: row.approvedDisplayName,
          sourceCount: row.sourceCount,
        })),
        topNoKanaBrands: noKanaSorted.slice(0, 20).map((row) => ({
          sourceBrandName: row.sourceBrandName,
          approvedBrandName: row.approvedBrandName,
          sourceCount: row.sourceCount,
        })),
      },
      null,
      2,
    ),
  );
}

main();
