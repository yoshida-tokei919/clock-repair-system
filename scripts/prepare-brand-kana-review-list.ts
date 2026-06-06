import fs from "node:fs";
import path from "node:path";

type Confidence = "high" | "medium" | "low" | "unknown";
type ReviewPriority = "high" | "medium" | "low";

type BrandKanaCandidate = {
  brandName: string;
  brandNameKanaCandidate: string;
  displayNameCandidate: string;
  confidence: Confidence;
  sourceCount: number;
  needsReview: boolean;
  note: string;
};

type BrandKanaReviewRow = {
  brandName: string;
  currentKanaCandidate: string;
  suggestedKana: string;
  confirmedKana: string;
  displayNameCandidate: string;
  sourceCount: number;
  confidence: Confidence;
  needsReview: boolean;
  reviewPriority: ReviewPriority;
  reviewStatus: "pending";
  note: string;
};

const INPUT_PATH = path.join("docs", "data", "fmp", "generated", "brand-kana-candidates.json");
const OUTPUT_DIR = path.join("docs", "data", "fmp", "generated");
const OUTPUT_CSV_PATH = path.join(OUTPUT_DIR, "brand-kana-review.csv");
const OUTPUT_JSON_PATH = path.join(OUTPUT_DIR, "brand-kana-review.json");

const suggestedKanaByKey: Record<string, { kana: string; note?: string }> = {
  AIGNER: { kana: "アイグナー" },
  ALAINSILBERSTEIN: { kana: "アラン・シルベスタイン" },
  BALLWATCH: { kana: "ボールウォッチ" },
  BALLY: { kana: "バリー" },
  BAPEX: { kana: "ベイペックス", note: "読み方確認推奨" },
  BREGUET: { kana: "ブレゲ" },
  BULOVA: { kana: "ブローバ" },
  CALVINKLEIN: { kana: "カルバン・クライン" },
  CARLOFERRARA: { kana: "カルロ・フェラーラ" },
  CHARLESJOURDAN: { kana: "シャルル・ジョルダン" },
  CHRISTIANDIOR: { kana: "クリスチャン・ディオール" },
  COACH: { kana: "コーチ" },
  CORUM: { kana: "コルム" },
  CURTISCO: { kana: "カーティス" },
  CYMA: { kana: "シーマ" },
  DAKS: { kana: "ダックス" },
  DIESEL: { kana: "ディーゼル" },
  DISNEY: { kana: "ディズニー" },
  DUNHILL: { kana: "ダンヒル" },
  DW: { kana: "ダニエル・ウェリントン", note: "略称の可能性。確認推奨" },
  EBEL: { kana: "エベル" },
  ETERNA: { kana: "エテルナ" },
  FOLLIFOLLIE: { kana: "フォリフォリ" },
  FOSSIL: { kana: "フォッシル" },
  FREDERIQUECONSTANT: { kana: "フレデリック・コンスタント" },
  GSHOCK: { kana: "ジーショック" },
  GIANNIVERSACE: { kana: "ジャンニ・ヴェルサーチ" },
  GIRARDPERREGAUX: { kana: "ジラール・ペルゴ" },
  GRAHAM: { kana: "グラハム" },
  GRANDEUR: { kana: "グランドール" },
  GUESS: { kana: "ゲス" },
  HEUER: { kana: "ホイヤー" },
  ICEWATCH: { kana: "アイスウォッチ" },
  JACOBCO: { kana: "ジェイコブ" },
  JUNGHANS: { kana: "ユンハンス" },
  JUVENIA: { kana: "ジュベニア" },
  KENTEX: { kana: "ケンテックス" },
  LOCMAN: { kana: "ロックマン", note: "読み方確認推奨" },
  LUMINOX: { kana: "ルミノックス" },
  MARCJACOBS: { kana: "マーク・ジェイコブス" },
  MARIECLAIRE: { kana: "マリ・クレール" },
  MAURICELACROIX: { kana: "モーリス・ラクロア" },
  MICHELKLEIN: { kana: "ミッシェル・クラン" },
  MILASCHON: { kana: "ミラ・ショーン" },
  MONDAINE: { kana: "モンディーン" },
  MONTBLANC: { kana: "モンブラン" },
  MOVADO: { kana: "モバード" },
  NIKE: { kana: "ナイキ" },
  OBREY: { kana: "オブレイ", note: "読み方確認推奨" },
  ORIENT: { kana: "オリエント" },
  PAULSMITH: { kana: "ポール・スミス" },
  PEQUIGNET: { kana: "ペキニエ" },
  PIAGET: { kana: "ピアジェ" },
  PORSCHEDESIGN: { kana: "ポルシェデザイン" },
  RAYMONDWEIL: { kana: "レイモンド・ウェイル" },
  RICOH: { kana: "リコー" },
  ROSEMONT: { kana: "ロゼモン" },
  SINN: { kana: "ジン" },
  TECHNOS: { kana: "テクノス" },
  TIFFANYCO: { kana: "ティファニー" },
  TIMEX: { kana: "タイメックス" },
  TRUSSARDI: { kana: "トラサルディ" },
  ULYSSENARDIN: { kana: "ユリス・ナルダン" },
  UNIVERSAL: { kana: "ユニバーサル", note: "ブランド特定確認推奨" },
  VANCLEEFARPELS: { kana: "ヴァン クリーフ＆アーペル" },
  VERSACE: { kana: "ヴェルサーチ" },
  WENGER: { kana: "ウェンガー" },
  ZENITH: { kana: "ゼニス" },
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

function getReviewPriority(sourceCount: number, needsReview: boolean): ReviewPriority {
  if (!needsReview) {
    return "low";
  }
  if (sourceCount >= 10) {
    return "high";
  }
  if (sourceCount >= 3) {
    return "medium";
  }
  return "low";
}

function hasVariationSuspicion(note: string): boolean {
  return note.includes("表記ゆれ疑い") || note.includes("スペース違い疑い");
}

function hasNonBrandSuspicion(brandName: string): boolean {
  return /コピー|懐中時計|置時計|掛時計|タイプ/.test(brandName);
}

function buildDisplayName(kana: string, brandName: string): string {
  return kana ? `${kana}（${brandName}）` : `未確認（${brandName}）`;
}

function buildReviewRows(candidates: BrandKanaCandidate[]): BrandKanaReviewRow[] {
  return candidates
    .map((item) => {
      const normalizedKey = normalizeBrandKey(item.brandName);
      const suggestion = suggestedKanaByKey[normalizedKey];
      const suggestedKana = suggestion?.kana ?? "";
      const confirmedKana = suggestedKana || item.brandNameKanaCandidate || "";
      const notes = [item.note];

      if (suggestion?.note) {
        notes.push(suggestion.note);
      }
      if (suggestedKana && !item.brandNameKanaCandidate) {
        notes.push("suggestedKana補完");
      }
      if (hasVariationSuspicion(item.note)) {
        notes.push("表記ゆれ確認");
      }
      if (hasNonBrandSuspicion(item.brandName)) {
        notes.push("ブランド名ではない可能性");
      }

      const needsReview =
        item.needsReview ||
        !confirmedKana ||
        hasVariationSuspicion(item.note) ||
        hasNonBrandSuspicion(item.brandName);
      const reviewPriority = getReviewPriority(item.sourceCount, needsReview);

      return {
        brandName: item.brandName,
        currentKanaCandidate: item.brandNameKanaCandidate,
        suggestedKana,
        confirmedKana,
        displayNameCandidate: buildDisplayName(confirmedKana, item.brandName),
        sourceCount: item.sourceCount,
        confidence: item.confidence,
        needsReview,
        reviewPriority,
        reviewStatus: "pending" as const,
        note: Array.from(new Set(notes.filter(Boolean))).join(" / "),
      };
    })
    .sort((a, b) => {
      if (a.needsReview !== b.needsReview) {
        return a.needsReview ? -1 : 1;
      }
      const priorityOrder: Record<ReviewPriority, number> = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.reviewPriority] - priorityOrder[b.reviewPriority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return b.sourceCount - a.sourceCount || a.brandName.localeCompare(b.brandName);
    });
}

function main() {
  const candidates = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8")) as BrandKanaCandidate[];
  const rows = buildReviewRows(candidates);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const headers: (keyof BrandKanaReviewRow)[] = [
    "brandName",
    "currentKanaCandidate",
    "suggestedKana",
    "confirmedKana",
    "displayNameCandidate",
    "sourceCount",
    "confidence",
    "needsReview",
    "reviewPriority",
    "reviewStatus",
    "note",
  ];

  const csv = [
    headers.join(","),
    ...rows.map((item) => headers.map((key) => escapeCsv(item[key])).join(",")),
  ].join("\n");

  fs.writeFileSync(OUTPUT_CSV_PATH, `\uFEFF${csv}\n`, "utf8");
  fs.writeFileSync(OUTPUT_JSON_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

  const priorityCounts = rows.reduce<Record<ReviewPriority, number>>(
    (acc, item) => {
      acc[item.reviewPriority] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );
  const variationSuspicionCount = rows.filter((item) => hasVariationSuspicion(item.note)).length;

  console.log(
    JSON.stringify(
      {
        inputPath: INPUT_PATH,
        csvPath: OUTPUT_CSV_PATH,
        jsonPath: OUTPUT_JSON_PATH,
        totalBrandCount: rows.length,
        confirmedKanaFilledCount: rows.filter((item) => item.confirmedKana).length,
        confirmedKanaBlankCount: rows.filter((item) => !item.confirmedKana).length,
        needsReviewCount: rows.filter((item) => item.needsReview).length,
        reviewPriorityCounts: priorityCounts,
        variationSuspicionCount,
        topBrands: rows
          .slice()
          .sort((a, b) => b.sourceCount - a.sourceCount || a.brandName.localeCompare(b.brandName))
          .slice(0, 20)
          .map((item) => ({
            brandName: item.brandName,
            sourceCount: item.sourceCount,
            confirmedKana: item.confirmedKana,
            reviewPriority: item.reviewPriority,
            needsReview: item.needsReview,
          })),
      },
      null,
      2,
    ),
  );
}

main();
