export type SearchSite = {
    id: string;
    name: string;
    lang: "ja" | "en";
    url: string;
    enabled: boolean;
};

type PartSearchInput = {
    brand?: string;
    watchRef?: string;
    caliber?: string;
    partName?: string;
    partRef?: string;
    partType?: string;
    category?: string;
};

const PART_NAME_EN_ALIASES: Record<string, string[]> = {
    "ゼンマイ": ["mainspring"],
    "リューズ": ["crown"],
    "リュウズ": ["crown"],
    "ガラス": ["crystal"],
    "風防": ["crystal"],
    "パッキン": ["gasket"],
    "裏押さえ": ["case back gasket", "case back ring"],
    "裏押え": ["case back gasket", "case back ring"],
    "文字盤": ["dial"],
    "針": ["hands"],
    "天真": ["balance staff"],
    "バネ棒": ["spring bar"],
};

export const DEFAULT_PART_SEARCH_SITES: SearchSite[] = [
    {
        id: "yahoo-auctions",
        name: "ヤフオク",
        lang: "ja",
        url: "https://auctions.yahoo.co.jp/search/search?p={query}",
        enabled: true,
    },
    {
        id: "mercari",
        name: "メルカリ",
        lang: "ja",
        url: "https://www.mercari.com/jp/search/?keyword={query}",
        enabled: true,
    },
    {
        id: "watch-parts-market",
        name: "Watch Parts Market",
        lang: "ja",
        url: "https://www.watch-parts-market.com/search?keyword={query}",
        enabled: true,
    },
    {
        id: "ebay",
        name: "eBay",
        lang: "en",
        url: "https://www.ebay.com/sch/i.html?_nkw={query}",
        enabled: true,
    },
    {
        id: "aliexpress",
        name: "AliExpress",
        lang: "en",
        url: "https://www.aliexpress.com/wholesale?SearchText={query}",
        enabled: true,
    },
    {
        id: "cousins-uk",
        name: "Cousins UK",
        lang: "en",
        url: "https://www.cousinsuk.com/search/products?q={query}",
        enabled: true,
    },
];

function cleanValue(value?: string | null) {
    return (value ?? "").replace(/\s+/g, " ").trim();
}

function pushUnique(values: string[], next: string) {
    const normalized = cleanValue(next);
    if (!normalized) return values;
    if (!values.some((value) => value.toLowerCase() === normalized.toLowerCase())) {
        values.push(normalized);
    }
    return values;
}

function buildQuery(tokens: Array<string | null | undefined>) {
    const uniqueTokens: string[] = [];
    for (const token of tokens) {
        const normalized = cleanValue(token);
        if (!normalized) continue;
        if (!uniqueTokens.some((value) => value.toLowerCase() === normalized.toLowerCase())) {
            uniqueTokens.push(normalized);
        }
    }
    return uniqueTokens.join(" ");
}

function uniqueQueries(values: string[]) {
    return values.reduce<string[]>((result, value) => {
        const normalized = cleanValue(value);
        if (!normalized) return result;
        if (!result.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) {
            result.push(normalized);
        }
        return result;
    }, []);
}

function isInteriorPart(input: PartSearchInput) {
    return input.partType === "interior"
        || input.category === "internal"
        || input.category === "part_internal";
}

function getBrandVariants(brand?: string) {
    const cleaned = cleanValue(brand);
    if (!cleaned) return [];
    const variants = [cleaned];
    const upper = cleaned.toUpperCase();
    if (upper !== cleaned) variants.push(upper);
    return uniqueQueries(variants);
}

function getJapanesePartTerms(partName?: string) {
    const cleaned = cleanValue(partName);
    if (!cleaned) return [];
    const plain = cleaned.replace(/（.*?）|\(.*?\)/g, "").trim();
    return uniqueQueries([cleaned, plain]);
}

function getEnglishPartTerms(partName?: string) {
    const cleaned = cleanValue(partName);
    if (!cleaned) return [];
    const plain = cleaned.replace(/（.*?）|\(.*?\)/g, "").trim();
    const aliases = Object.entries(PART_NAME_EN_ALIASES).reduce<string[]>((result, [key, values]) => {
        if (plain.includes(key) || cleaned.includes(key)) {
            return result.concat(values);
        }
        return result;
    }, []);
    const asciiName = /[A-Za-z]/.test(plain) ? plain : "";
    return uniqueQueries([asciiName, ...aliases]);
}

export function normalizeCaliber(caliber?: string) {
    const cleaned = cleanValue(caliber);
    if (!cleaned) return "";
    return cleaned
        .replace(/^cal(?:iber)?\.?\s*/i, "")
        .replace(/\s+/g, "")
        .trim();
}

export function expandPartRefVariants(partRef?: string) {
    const cleaned = cleanValue(partRef);
    if (!cleaned) return [];

    const compact = cleaned.replace(/[\s\-./]+/g, "");
    const spaced = cleaned.replace(/[\-./]+/g, " ").replace(/\s+/g, " ").trim();
    const hyphenated = cleaned.replace(/[\s./]+/g, "-").replace(/\-+/g, "-").trim();

    return uniqueQueries([cleaned, compact, spaced, hyphenated]);
}

export function buildJapanesePartQueries(input: PartSearchInput) {
    const brandVariants = getBrandVariants(input.brand);
    const normalizedCaliber = normalizeCaliber(input.caliber);
    const partRefVariants = expandPartRefVariants(input.partRef);
    const watchRefVariants = expandPartRefVariants(input.watchRef);
    const partTerms = getJapanesePartTerms(input.partName);
    const queries: string[] = [];

    for (const brand of brandVariants) {
        if (isInteriorPart(input)) {
            for (const partRef of partRefVariants) {
                pushUnique(queries, buildQuery([brand, normalizedCaliber, partRef]));
                for (const partTerm of partTerms) {
                    pushUnique(queries, buildQuery([brand, normalizedCaliber, partRef, partTerm]));
                }
            }
            for (const partTerm of partTerms) {
                pushUnique(queries, buildQuery([brand, normalizedCaliber, partTerm]));
                pushUnique(queries, buildQuery([brand, partTerm]));
            }
        } else {
            for (const watchRef of watchRefVariants) {
                for (const partTerm of partTerms) {
                    pushUnique(queries, buildQuery([brand, watchRef, partTerm]));
                }
            }
            for (const partRef of partRefVariants) {
                for (const partTerm of partTerms) {
                    pushUnique(queries, buildQuery([brand, partRef, partTerm]));
                }
            }
            for (const partTerm of partTerms) {
                pushUnique(queries, buildQuery([brand, partTerm]));
            }
        }
    }

    return uniqueQueries(queries);
}

export function buildEnglishPartQueries(input: PartSearchInput) {
    const brandVariants = getBrandVariants(input.brand);
    const normalizedCaliber = normalizeCaliber(input.caliber);
    const partRefVariants = expandPartRefVariants(input.partRef);
    const watchRefVariants = expandPartRefVariants(input.watchRef);
    const partTerms = getEnglishPartTerms(input.partName);
    const queries: string[] = [];

    for (const brand of brandVariants) {
        if (isInteriorPart(input)) {
            pushUnique(queries, buildQuery([brand, normalizedCaliber]));
            for (const partRef of partRefVariants) {
                pushUnique(queries, buildQuery([brand, normalizedCaliber, partRef]));
                for (const partTerm of partTerms) {
                    pushUnique(queries, buildQuery([brand, normalizedCaliber, partTerm]));
                    pushUnique(queries, buildQuery([brand, normalizedCaliber, partRef, partTerm]));
                }
            }
            for (const partTerm of partTerms) {
                pushUnique(queries, buildQuery([brand, normalizedCaliber, partTerm]));
                pushUnique(queries, buildQuery([brand, partTerm]));
            }
        } else {
            for (const watchRef of watchRefVariants) {
                pushUnique(queries, buildQuery([brand, watchRef]));
                for (const partTerm of partTerms) {
                    pushUnique(queries, buildQuery([brand, watchRef, partTerm]));
                }
            }
            for (const partRef of partRefVariants) {
                pushUnique(queries, buildQuery([brand, partRef]));
                for (const partTerm of partTerms) {
                    pushUnique(queries, buildQuery([brand, partRef, partTerm]));
                }
            }
            for (const partTerm of partTerms) {
                pushUnique(queries, buildQuery([brand, partTerm]));
            }
            pushUnique(queries, buildQuery([brand]));
        }
    }

    return uniqueQueries(queries);
}

export function buildSearchUrls(args: {
    sites: SearchSite[];
    japaneseQueries: string[];
    englishQueries: string[];
}) {
    const { sites, japaneseQueries, englishQueries } = args;

    return sites.reduce<Array<{ site: SearchSite; query: string; url: string }>>((result, site) => {
        const query = site.lang === "ja" ? japaneseQueries[0] : englishQueries[0];
        if (!query) return result;
        result.push({
            site,
            query,
            url: site.url.replace("{query}", encodeURIComponent(query)),
        });
        return result;
    }, []);
}
