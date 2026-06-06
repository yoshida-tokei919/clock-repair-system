import fs from "node:fs";
import path from "node:path";

type Confidence = "high" | "medium" | "low" | "unknown";

type PublicCaseCandidate = {
  brandName?: string | null;
};

type KanaRule = {
  kana: string;
  confidence: Confidence;
  note: string;
  needsReview?: boolean;
};

type BrandKanaCandidate = {
  brandName: string;
  brandNameKanaCandidate: string;
  displayNameCandidate: string;
  confidence: Confidence;
  sourceCount: number;
  needsReview: boolean;
  note: string;
};

const INPUT_PATH = path.join(
  "docs",
  "data",
  "fmp",
  "generated",
  "public-case-candidates.json",
);
const OUTPUT_DIR = path.join("docs", "data", "fmp", "generated");
const OUTPUT_CSV_PATH = path.join(OUTPUT_DIR, "brand-kana-candidates.csv");
const OUTPUT_JSON_PATH = path.join(OUTPUT_DIR, "brand-kana-candidates.json");

const kanaRules: Record<string, KanaRule> = {
  ALBA: { kana: "アルバ", confidence: "high", note: "一般的な日本語表記" },
  AUDEMARSPIGUET: {
    kana: "オーデマ・ピゲ",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  BAUMEMERCIER: {
    kana: "ボーム＆メルシエ",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  BREITLING: {
    kana: "ブライトリング",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  BURBERRY: { kana: "バーバリー", confidence: "high", note: "一般的な日本語表記" },
  BVLGARI: { kana: "ブルガリ", confidence: "high", note: "一般的な日本語表記" },
  CASIO: { kana: "カシオ", confidence: "high", note: "一般的な日本語表記" },
  CARTIER: { kana: "カルティエ", confidence: "high", note: "一般的な日本語表記" },
  CHANEL: { kana: "シャネル", confidence: "high", note: "一般的な日本語表記" },
  CHARRIOL: {
    kana: "シャリオール",
    confidence: "medium",
    note: "一般的な日本語表記候補。確認推奨",
    needsReview: true,
  },
  CHOPARD: { kana: "ショパール", confidence: "high", note: "一般的な日本語表記" },
  CITIZEN: { kana: "シチズン", confidence: "high", note: "一般的な日本語表記" },
  DIOR: { kana: "ディオール", confidence: "high", note: "一般的な日本語表記" },
  FENDI: { kana: "フェンディ", confidence: "high", note: "一般的な日本語表記" },
  FRANCKMULLER: {
    kana: "フランク・ミュラー",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  GAGAMILANO: {
    kana: "ガガミラノ",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  GUCCI: { kana: "グッチ", confidence: "high", note: "一般的な日本語表記" },
  HAMILTON: { kana: "ハミルトン", confidence: "high", note: "一般的な日本語表記" },
  HERMES: { kana: "エルメス", confidence: "high", note: "一般的な日本語表記" },
  HUBLOT: { kana: "ウブロ", confidence: "high", note: "一般的な日本語表記" },
  IWC: {
    kana: "アイ・ダブリュー・シー",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  JAEGERLECOULTRE: {
    kana: "ジャガー・ルクルト",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  LONGINES: { kana: "ロンジン", confidence: "high", note: "一般的な日本語表記" },
  LOUISVUITTON: {
    kana: "ルイ・ヴィトン",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  LOUISVUITON: {
    kana: "ルイ・ヴィトン",
    confidence: "low",
    note: "スペルミス疑い: LOUIS VUITTON",
    needsReview: true,
  },
  OMEGA: { kana: "オメガ", confidence: "high", note: "一般的な日本語表記" },
  ORIS: { kana: "オリス", confidence: "high", note: "一般的な日本語表記" },
  PANERAI: { kana: "パネライ", confidence: "high", note: "一般的な日本語表記" },
  PATEKPHILIPPE: {
    kana: "パテック・フィリップ",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  RADO: { kana: "ラドー", confidence: "high", note: "一般的な日本語表記" },
  ROLEX: { kana: "ロレックス", confidence: "high", note: "一般的な日本語表記" },
  SEIKO: { kana: "セイコー", confidence: "high", note: "一般的な日本語表記" },
  SKAGEN: { kana: "スカーゲン", confidence: "high", note: "一般的な日本語表記" },
  TAGHEUER: {
    kana: "タグ・ホイヤー",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  TIFFANY: { kana: "ティファニー", confidence: "high", note: "一般的な日本語表記" },
  TISSOT: { kana: "ティソ", confidence: "high", note: "一般的な日本語表記" },
  TUDOR: { kana: "チューダー", confidence: "high", note: "一般的な日本語表記" },
  VACHERONCONSTANTIN: {
    kana: "ヴァシュロン・コンスタンタン",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  WALTHAM: { kana: "ウォルサム", confidence: "high", note: "一般的な日本語表記" },
  YVESSAINTLAURENT: {
    kana: "イヴ・サンローラン",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  AGNESB: {
    kana: "アニエスベー",
    confidence: "high",
    note: "一般的な日本語表記",
  },
  AGNISB: {
    kana: "アニエスベー",
    confidence: "low",
    note: "スペル揺れ/スペルミス疑い: agnes b",
    needsReview: true,
  },
};

function normalizeBrandKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/&/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function escapeCsv(value: string | number | boolean): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function hasSpacingSuspicion(value: string): boolean {
  return /\s{2,}/.test(value) || /^\s|\s$/.test(value);
}

function buildCandidates(): BrandKanaCandidate[] {
  const raw = fs.readFileSync(INPUT_PATH, "utf8");
  const cases = JSON.parse(raw) as PublicCaseCandidate[];
  const counts = new Map<string, number>();

  for (const item of cases) {
    const brandName = (item.brandName ?? "").trim();
    if (!brandName) {
      continue;
    }
    counts.set(brandName, (counts.get(brandName) ?? 0) + 1);
  }

  const normalizedGroups = new Map<string, string[]>();
  for (const brandName of Array.from(counts.keys())) {
    const key = normalizeBrandKey(brandName);
    if (!key) {
      continue;
    }
    normalizedGroups.set(key, [...(normalizedGroups.get(key) ?? []), brandName]);
  }

  return Array.from(counts.entries())
    .map(([brandName, sourceCount]) => {
      const normalizedKey = normalizeBrandKey(brandName);
      const rule = kanaRules[normalizedKey];
      const groupedNames = normalizedKey ? (normalizedGroups.get(normalizedKey) ?? []) : [];
      const duplicateLikeNames = groupedNames.filter((name) => name !== brandName);
      const notes: string[] = [];
      let needsReview = true;
      let confidence: Confidence = "unknown";
      let kana = "";

      if (rule) {
        kana = rule.kana;
        confidence = rule.confidence;
        needsReview = rule.needsReview ?? confidence !== "high";
        notes.push(rule.note);
      } else {
        notes.push("読み方要確認");
      }

      if (duplicateLikeNames.length > 0) {
        needsReview = true;
        notes.push(`表記ゆれ疑い: ${duplicateLikeNames.join(" / ")}`);
      }

      if (hasSpacingSuspicion(brandName)) {
        needsReview = true;
        notes.push("スペース違い疑い");
      }

      const displayNameCandidate = kana
        ? `${kana}（${brandName}）`
        : `未確認（${brandName}）`;

      return {
        brandName,
        brandNameKanaCandidate: kana,
        displayNameCandidate,
        confidence,
        sourceCount,
        needsReview,
        note: Array.from(new Set(notes)).join(" / "),
      };
    })
    .sort((a, b) => b.sourceCount - a.sourceCount || a.brandName.localeCompare(b.brandName));
}

function main() {
  const candidates = buildCandidates();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const headers: (keyof BrandKanaCandidate)[] = [
    "brandName",
    "brandNameKanaCandidate",
    "displayNameCandidate",
    "confidence",
    "sourceCount",
    "needsReview",
    "note",
  ];
  const csv = [
    headers.join(","),
    ...candidates.map((item) => headers.map((key) => escapeCsv(item[key])).join(",")),
  ].join("\n");

  fs.writeFileSync(OUTPUT_CSV_PATH, `\uFEFF${csv}\n`, "utf8");
  fs.writeFileSync(OUTPUT_JSON_PATH, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");

  const confidenceCounts = candidates.reduce<Record<Confidence, number>>(
    (acc, item) => {
      acc[item.confidence] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0, unknown: 0 },
  );
  const needsReviewCount = candidates.filter((item) => item.needsReview).length;
  const variationSuspects = candidates
    .filter((item) => item.note.includes("表記ゆれ疑い") || item.note.includes("スペース違い疑い"))
    .map((item) => item.brandName);

  console.log(
    JSON.stringify(
      {
        inputPath: INPUT_PATH,
        csvPath: OUTPUT_CSV_PATH,
        jsonPath: OUTPUT_JSON_PATH,
        uniqueBrandCount: candidates.length,
        confidenceCounts,
        needsReviewCount,
        topBrands: candidates.slice(0, 10).map((item) => ({
          brandName: item.brandName,
          sourceCount: item.sourceCount,
          kana: item.brandNameKanaCandidate,
          confidence: item.confidence,
          needsReview: item.needsReview,
        })),
        variationSuspects,
      },
      null,
      2,
    ),
  );
}

main();
