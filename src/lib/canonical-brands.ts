export type CanonicalBrandKind = "NORMAL" | "TYPE" | "UNKNOWN";

export type CanonicalBrand = {
    name: string;
    nameEn: string;
    nameJp: string;
    brandKind: CanonicalBrandKind;
    isWatchBrand: boolean;
    isMovementMaker: boolean;
    aliases: string[];
};

/** Initial reviewed set. Extend only through reviewed canonical-data changes. */
const CANONICAL_BRAND_DEFINITIONS: Array<Omit<CanonicalBrand, "isWatchBrand" | "isMovementMaker">> = [
    { name: "UNKNOWN", nameEn: "UNKNOWN", nameJp: "不明", brandKind: "UNKNOWN", aliases: ["不明"] },
    { name: "ROLEX", nameEn: "ROLEX", nameJp: "ロレックス", brandKind: "NORMAL", aliases: ["ロレックス"] },
    { name: "OMEGA", nameEn: "OMEGA", nameJp: "オメガ", brandKind: "NORMAL", aliases: ["オメガ"] },
    { name: "SEIKO", nameEn: "SEIKO", nameJp: "セイコー", brandKind: "NORMAL", aliases: ["セイコー"] },
    { name: "BELL & ROSS", nameEn: "BELL & ROSS", nameJp: "ベル＆ロス", brandKind: "NORMAL", aliases: ["BELL＆ROSS", "ベルアンドロス"] },
    { name: "GLASHÜTTE ORIGINAL", nameEn: "GLASHÜTTE ORIGINAL", nameJp: "グラスヒュッテ・オリジナル", brandKind: "NORMAL", aliases: ["GLASHUTTE ORIGINAL", "グラスヒュッテオリジナル"] },
    { name: "CHRISTIAN DIOR", nameEn: "CHRISTIAN DIOR", nameJp: "クリスチャン・ディオール", brandKind: "NORMAL", aliases: ["christian dior", "クリスチャンディオール"] },
    { name: "DIOR", nameEn: "DIOR", nameJp: "ディオール", brandKind: "NORMAL", aliases: ["ディオール"] },
    { name: "GRAND SEIKO", nameEn: "GRAND SEIKO", nameJp: "グランドセイコー", brandKind: "NORMAL", aliases: ["グランドセイコー"] },
    { name: "CREDOR", nameEn: "CREDOR", nameJp: "クレドール", brandKind: "NORMAL", aliases: ["クレドール"] },
    { name: "VACHERON CONSTANTIN", nameEn: "VACHERON CONSTANTIN", nameJp: "ヴァシュロン・コンスタンタン", brandKind: "NORMAL", aliases: ["ヴァシュロンコンスタンタン", "バセロンコンスタンタン", "バシュロンコンスタンタン", "ヴァセロンコンスタンタン"] },
    { name: "AGNÈS B.", nameEn: "AGNÈS B.", nameJp: "アニエスベー", brandKind: "NORMAL", aliases: ["AGNES B", "agnes b", "アニエスb"] },
    { name: "MUJI", nameEn: "MUJI", nameJp: "無印良品", brandKind: "NORMAL", aliases: ["無印", "ムジ"] },
    { name: "ROLEX TYPE", nameEn: "ROLEX TYPE", nameJp: "ロレックスタイプ", brandKind: "TYPE", aliases: ["ROLEX(コピー）", "ROLEX（コピー）"] },
    { name: "CHANEL TYPE", nameEn: "CHANEL TYPE", nameJp: "シャネルタイプ", brandKind: "TYPE", aliases: ["CHANEL(コピー）", "CHANEL（コピー）"] },
    { name: "BREITLING TYPE", nameEn: "BREITLING TYPE", nameJp: "ブライトリングタイプ", brandKind: "TYPE", aliases: ["BREITLING(コピー）", "BREITLING（コピー）"] },
    { name: "HUBLOT TYPE", nameEn: "HUBLOT TYPE", nameJp: "ウブロタイプ", brandKind: "TYPE", aliases: ["HUBLOTタイプ"] },
    { name: "ETA", nameEn: "ETA", nameJp: "ETA", brandKind: "NORMAL", aliases: [] },
];

const MOVEMENT_MAKER_NAMES = new Set(["ROLEX", "SEIKO", "ETA"]);

export const CANONICAL_BRANDS: CanonicalBrand[] = CANONICAL_BRAND_DEFINITIONS.map((brand) => ({
    ...brand,
    isWatchBrand: brand.name !== "ETA",
    isMovementMaker: MOVEMENT_MAKER_NAMES.has(brand.name),
}));
