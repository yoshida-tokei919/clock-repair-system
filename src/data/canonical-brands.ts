import fmpBrandInventory from "../../docs/data/fmp/generated/brand-kana-approved.json";

export type CanonicalBrandSeed = {
  name: string;
  nameEn: string;
  nameJp: string;
  brandKind: "NORMAL" | "TYPE" | "UNKNOWN";
  aliases: string[];
};

type FmpBrandInventoryRow = {
  sourceBrandName: string;
  approvedBrandName: string;
  approvedBrandNameKana: string;
};

// These FMP values are not brands and must never be promoted to masters or aliases.
const EXCLUDED_FMP_NAMES = new Set([
  "ALAX", "Bando", "KCB", "MTY NETWORKS", "ROYAL NATURE", "バンド",
  "懐中時計", "掛時計", "ドイツ掛時計", "YALE CLUB 懐中時計", "ハンドメイド時計",
  "agnis b 懐中時計", "CITIZEN 置時計", "SEIKO 懐中時計", "SEIKO 掛時計",
]);

const OVERRIDES: Record<string, Omit<CanonicalBrandSeed, "aliases"> & { aliases?: string[] }> = {
  ALETTE: { name: "ALETTE BLANC", nameEn: "ALETTE BLANC", nameJp: "アレットブラン", brandKind: "NORMAL", aliases: ["ALETTE"] },
  "agnis b": { name: "AGNÈS B.", nameEn: "AGNÈS B.", nameJp: "アニエスベー", brandKind: "NORMAL", aliases: ["AGNIS B", "AGNES B", "アニエスb"] },
  "CHRISTIAN DIOR": { name: "CHRISTIAN DIOR", nameEn: "CHRISTIAN DIOR", nameJp: "クリスチャン・ディオール", brandKind: "NORMAL", aliases: ["クリスチャンディオール"] },
  "BELL＆ROSS": { name: "BELL & ROSS", nameEn: "BELL & ROSS", nameJp: "ベル＆ロス", brandKind: "NORMAL", aliases: ["BELL＆ROSS", "ベル&ロス"] },
  "BREITLING(コピー）": { name: "BREITLING TYPE", nameEn: "BREITLING TYPE", nameJp: "ブライトリングタイプ", brandKind: "TYPE", aliases: ["BREITLING(コピー）"] },
  "CHANEL(コピー）": { name: "CHANEL TYPE", nameEn: "CHANEL TYPE", nameJp: "シャネルタイプ", brandKind: "TYPE", aliases: ["CHANEL(コピー）"] },
  CK: { name: "CALVIN KLEIN", nameEn: "CALVIN KLEIN", nameJp: "カルバンクライン", brandKind: "NORMAL", aliases: ["CK"] },
  Dior: { name: "DIOR", nameEn: "DIOR", nameJp: "ディオール", brandKind: "NORMAL", aliases: ["ディオール"] },
  GLASHUTTE: { name: "GLASHÜTTE ORIGINAL", nameEn: "GLASHÜTTE ORIGINAL", nameJp: "グラスヒュッテ・オリジナル", brandKind: "NORMAL", aliases: ["GLASHUTTE ORIGINAL", "グラスヒュッテオリジナル"] },
  "GーSHOCK": { name: "G-SHOCK", nameEn: "G-SHOCK", nameJp: "ジーショック", brandKind: "NORMAL", aliases: ["GーSHOCK"] },
  "H&CO": { name: "H&Co", nameEn: "H&Co", nameJp: "H&Co", brandKind: "NORMAL", aliases: ["H&CO"] },
  "H&Co": { name: "H&Co", nameEn: "H&Co", nameJp: "H&Co", brandKind: "NORMAL", aliases: ["H&Co"] },
  "HUBLOTタイプ": { name: "HUBLOT TYPE", nameEn: "HUBLOT TYPE", nameJp: "ウブロタイプ", brandKind: "TYPE", aliases: ["HUBLOTタイプ"] },
  "LOUIS VUITON": { name: "LOUIS VUITON", nameEn: "LOUIS VUITON", nameJp: "ルイ・ヴィトン", brandKind: "NORMAL", aliases: ["LOUIS VUITTON"] },
  LOOGER: { name: "SEIKO", nameEn: "SEIKO", nameJp: "セイコー", brandKind: "NORMAL", aliases: ["LOOGER"] },
  Nibada: { name: "Nivada", nameEn: "Nivada", nameJp: "ニバダ", brandKind: "NORMAL", aliases: ["Nibada"] },
  Nivada: { name: "Nivada", nameEn: "Nivada", nameJp: "ニバダ", brandKind: "NORMAL" },
  PF: { name: "PARMIGIANI FLEURIER", nameEn: "PARMIGIANI FLEURIER", nameJp: "パルミジャーニ・フルリエ", brandKind: "NORMAL", aliases: ["PF"] },
  "PHILIPPE SHARIOL": { name: "CHARRIOL", nameEn: "CHARRIOL", nameJp: "シャリオール", brandKind: "NORMAL", aliases: ["PHILIPPE SHARIOL"] },
  "ROLEX(コピー）": { name: "ROLEX TYPE", nameEn: "ROLEX TYPE", nameJp: "ロレックスタイプ", brandKind: "TYPE", aliases: ["ROLEX(コピー）"] },
  SHINNNYO: { name: "Shinnyo", nameEn: "Shinnyo", nameJp: "真如苑", brandKind: "NORMAL", aliases: ["SHINNNYO"] },
  Shinnyo: { name: "Shinnyo", nameEn: "Shinnyo", nameJp: "真如苑", brandKind: "NORMAL", aliases: ["進之苑", "シンニョエン"] },
  "Baume&Mercier": { name: "BAUME & MERCIER", nameEn: "BAUME & MERCIER", nameJp: "ボーム＆メルシエ", brandKind: "NORMAL", aliases: ["Baume&Mercier", "BAUME&MERCIER"] },
  DW: { name: "DANIEL WELLINGTON", nameEn: "DANIEL WELLINGTON", nameJp: "ダニエル・ウェリントン", brandKind: "NORMAL", aliases: ["DW"] },
  GC: { name: "Gc", nameEn: "Gc", nameJp: "ジーシー", brandKind: "NORMAL", aliases: ["GC"] },
  "JACOB ＆ CO": { name: "JACOB & CO.", nameEn: "JACOB & CO.", nameJp: "ジェイコブ＆コー", brandKind: "NORMAL", aliases: ["JACOB ＆ CO", "JACOB & CO"] },
  TIFFANY: { name: "TIFFANY & CO.", nameEn: "TIFFANY & CO.", nameJp: "ティファニー", brandKind: "NORMAL", aliases: ["TIFFANY", "TIFFANY&CO", "TIFFANY & CO"] },
  "TIFFANY&CO": { name: "TIFFANY & CO.", nameEn: "TIFFANY & CO.", nameJp: "ティファニー", brandKind: "NORMAL", aliases: ["TIFFANY", "TIFFANY&CO", "TIFFANY & CO"] },
  "VAN CLEEF＆ARPELS": { name: "VAN CLEEF & ARPELS", nameEn: "VAN CLEEF & ARPELS", nameJp: "ヴァン クリーフ＆アーペル", brandKind: "NORMAL", aliases: ["VAN CLEEF＆ARPELS"] },
  "無印": { name: "MUJI", nameEn: "MUJI", nameJp: "無印良品", brandKind: "NORMAL", aliases: ["無印", "無印良品", "ムジ"] },
};

const REQUIRED_BRANDS: CanonicalBrandSeed[] = [
  { name: "UNKNOWN", nameEn: "UNKNOWN", nameJp: "不明", brandKind: "UNKNOWN", aliases: ["不明"] },
  { name: "ETA", nameEn: "ETA", nameJp: "ETA", brandKind: "NORMAL", aliases: [] },
  { name: "BELL & ROSS", nameEn: "BELL & ROSS", nameJp: "ベル＆ロス", brandKind: "NORMAL", aliases: ["BELL＆ROSS", "ベルアンドロス"] },
  { name: "VACHERON CONSTANTIN", nameEn: "VACHERON CONSTANTIN", nameJp: "ヴァシュロン・コンスタンタン", brandKind: "NORMAL", aliases: ["ヴァシュロンコンスタンタン", "バセロンコンスタンタン", "バシュロンコンスタンタン", "ヴァセロンコンスタンタン"] },
  { name: "ROLEX TYPE", nameEn: "ROLEX TYPE", nameJp: "ロレックスタイプ", brandKind: "TYPE", aliases: ["ROLEX(コピー）", "ROLEX（コピー）"] },
  { name: "CHANEL TYPE", nameEn: "CHANEL TYPE", nameJp: "シャネルタイプ", brandKind: "TYPE", aliases: ["CHANEL(コピー）", "CHANEL（コピー）"] },
  { name: "BREITLING TYPE", nameEn: "BREITLING TYPE", nameJp: "ブライトリングタイプ", brandKind: "TYPE", aliases: ["BREITLING(コピー）", "BREITLING（コピー）"] },
  { name: "HUBLOT TYPE", nameEn: "HUBLOT TYPE", nameJp: "ウブロタイプ", brandKind: "TYPE", aliases: ["HUBLOTタイプ"] },
  { name: "RICHARD MILLE", nameEn: "RICHARD MILLE", nameJp: "リシャール・ミル", brandKind: "NORMAL", aliases: [] },
  { name: "ROGER DUBUIS", nameEn: "ROGER DUBUIS", nameJp: "ロジェ・デュブイ", brandKind: "NORMAL", aliases: [] },
  { name: "A. LANGE & SÖHNE", nameEn: "A. LANGE & SÖHNE", nameJp: "A.ランゲ＆ゾーネ", brandKind: "NORMAL", aliases: ["A. LANGE & SOHNE"] },
  { name: "GRAND SEIKO", nameEn: "GRAND SEIKO", nameJp: "グランドセイコー", brandKind: "NORMAL", aliases: [] },
  { name: "CREDOR", nameEn: "CREDOR", nameJp: "クレドール", brandKind: "NORMAL", aliases: [] },
  { name: "BLANCPAIN", nameEn: "BLANCPAIN", nameJp: "ブランパン", brandKind: "NORMAL", aliases: [] },
  { name: "HARRY WINSTON", nameEn: "HARRY WINSTON", nameJp: "ハリー・ウィンストン", brandKind: "NORMAL", aliases: [] },
  { name: "F.P.JOURNE", nameEn: "F.P.JOURNE", nameJp: "F.P.ジュルヌ", brandKind: "NORMAL", aliases: [] },
  { name: "PARMIGIANI FLEURIER", nameEn: "PARMIGIANI FLEURIER", nameJp: "パルミジャーニ・フルリエ", brandKind: "NORMAL", aliases: ["PF"] },
  { name: "H. MOSER & CIE.", nameEn: "H. MOSER & CIE.", nameJp: "H.モーザー", brandKind: "NORMAL", aliases: [] },
  { name: "JAQUET DROZ", nameEn: "JAQUET DROZ", nameJp: "ジャケ・ドロー", brandKind: "NORMAL", aliases: [] },
  { name: "LAURENT FERRIER", nameEn: "LAURENT FERRIER", nameJp: "ローラン・フェリエ", brandKind: "NORMAL", aliases: [] },
  { name: "NOMOS GLASHÜTTE", nameEn: "NOMOS GLASHÜTTE", nameJp: "ノモス・グラスヒュッテ", brandKind: "NORMAL", aliases: [] },
  { name: "NORQAIN", nameEn: "NORQAIN", nameJp: "ノルケイン", brandKind: "NORMAL", aliases: [] },
  { name: "MINASE", nameEn: "MINASE", nameJp: "ミナセ", brandKind: "NORMAL", aliases: [] },
  { name: "PEQUIGNET", nameEn: "PEQUIGNET", nameJp: "ペキネ", brandKind: "NORMAL", aliases: ["ペキニエ", "ペキネ"] },
  { name: "H&Co", nameEn: "H&Co", nameJp: "平和堂", brandKind: "NORMAL", aliases: ["女神時計", "ヘイウッド"] },
  { name: "フランク三浦", nameEn: "フランク三浦", nameJp: "フランク三浦", brandKind: "NORMAL", aliases: ["フランクミウラ"] },
];

function standardName(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function addBrand(target: Map<string, CanonicalBrandSeed>, brand: CanonicalBrandSeed) {
  const current = target.get(brand.name);
  if (!current) {
    target.set(brand.name, { ...brand, aliases: [...brand.aliases] });
    return;
  }
  current.aliases.push(...brand.aliases);
}

const canonicalByName = new Map<string, CanonicalBrandSeed>();
for (const row of fmpBrandInventory as FmpBrandInventoryRow[]) {
  if (EXCLUDED_FMP_NAMES.has(row.sourceBrandName)) continue;
  const override = OVERRIDES[row.sourceBrandName];
  const name = override?.name ?? standardName(row.approvedBrandName);
  addBrand(canonicalByName, {
    name,
    nameEn: override?.nameEn ?? name,
    nameJp: override?.nameJp ?? (row.approvedBrandNameKana.trim() || name),
    brandKind: override?.brandKind ?? "NORMAL",
    aliases: [row.sourceBrandName, row.approvedBrandName, ...(override?.aliases ?? [])],
  });
}
for (const brand of REQUIRED_BRANDS) addBrand(canonicalByName, brand);

export const CANONICAL_BRAND_SEEDS = Array.from(canonicalByName.values())
  .map((brand) => ({
    ...brand,
    aliases: Array.from(new Set(brand.aliases.filter((alias) => alias && !/掛時計|置時計|懐中時計|ドイツ掛時計|ハンドメイド時計|バンド/.test(alias)))),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
