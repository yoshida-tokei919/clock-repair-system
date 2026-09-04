export type SearchLanguage = "ja" | "en" | (string & {});

export type SearchPartDomain = "internal" | "exterior";

export type PartIdentifierMode = "partName" | "partRef" | "partNameAndRef";

export type SearchProfileToken =
    | "watchBrand"
    | "watchRef"
    | "model"
    | "movementMaker"
    | "movementCaliber"
    | "baseMovementMaker"
    | "baseMovementCaliber";

export type SearchSiteProfile = {
    lang?: SearchLanguage;
    tokens: SearchProfileToken[];
    partIdentifierMode: PartIdentifierMode;
};

export type SearchSiteProfiles = {
    internal: SearchSiteProfile;
    exterior: SearchSiteProfile;
};

export type SearchSite = {
    id: string;
    name: string;
    lang: "ja" | "en";
    url: string;
    enabled: boolean;
    profiles?: SearchSiteProfiles;
};

export type PartSearchContext = {
    partType?: SearchPartDomain | "interior" | "external" | "part_internal" | "part_external" | string | null;
    partRef?: string | null;
    partName?: string | null;
    partNameEn?: string | null;
    brand?: string | null;
    watchBrand?: string | null;
    watchRef?: string | null;
    model?: string | null;
    caliber?: string | null;
    movementMaker?: string | null;
    movementCaliber?: string | null;
    baseMovementMaker?: string | null;
    baseMovementCaliber?: string | null;
    category?: string | null;
};

type LegacyPartSearchInput = {
    brand?: string;
    watchRef?: string;
    caliber?: string;
    partName?: string;
    partNameEn?: string;
    partRef?: string;
    partType?: string;
    category?: string;
};

const PART_NAME_EN_ALIASES: Record<string, string[]> = {
    "ゼンマイ": ["mainspring"],
    "香箱真": ["barrel arbor"],
    "リューズ": ["crown"],
    "竜頭": ["crown"],
    "チューブ": ["crown tube"],
    "ガラス": ["crystal"],
    "風防": ["crystal"],
    "パッキン": ["gasket"],
    "裏蓋": ["case back"],
    "裏蓋パッキン": ["case back gasket", "case back ring"],
    "文字盤": ["dial"],
    "針": ["hands"],
    "天真": ["balance staff"],
    "バネ棒": ["spring bar"],
    "巻真": ["stem"],
    "ローター": ["rotor"],
    "切替車": ["reversing wheel"],
};

function defaultProfilesForSite(site: Pick<SearchSite, "id" | "lang">): SearchSiteProfiles {
    const internalLang = site.lang;
    const exteriorLang = site.lang;

    if (site.id === "cousins-uk") {
        return {
            internal: { lang: internalLang, tokens: [], partIdentifierMode: "partRef" },
            exterior: { lang: exteriorLang, tokens: ["watchBrand", "watchRef"], partIdentifierMode: "partNameAndRef" },
        };
    }

    return {
        internal: {
            lang: internalLang,
            tokens: ["movementMaker", "movementCaliber"],
            partIdentifierMode: "partNameAndRef",
        },
        exterior: {
            lang: exteriorLang,
            tokens: ["watchBrand", "watchRef"],
            partIdentifierMode: "partNameAndRef",
        },
    };
}

const DEFAULT_PART_SEARCH_SITE_DEFINITIONS: Array<Omit<SearchSite, "profiles">> = [
    {
        id: "yahoo-auctions",
        name: "Yahooオークション",
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
        url: "https://www.cousinsuk.com/search?SearchTerm={query}",
        enabled: true,
    },
];

const COUSINS_UK_OLD_DEFAULT_URL = "https://www.cousinsuk.com/search/products?q={query}";
const COUSINS_UK_DEFAULT_URL = "https://www.cousinsuk.com/search?SearchTerm={query}";

export const DEFAULT_PART_SEARCH_SITES: SearchSite[] = DEFAULT_PART_SEARCH_SITE_DEFINITIONS.map((site) => ({
    ...site,
    profiles: defaultProfilesForSite(site),
}));

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSupportedSiteLang(value: unknown): value is "ja" | "en" {
    return value === "ja" || value === "en";
}

function isSupportedProfileLang(value: unknown): value is SearchLanguage {
    return typeof value === "string" && value.trim().length > 0;
}

function isProfileToken(value: unknown): value is SearchProfileToken {
    return value === "watchBrand"
        || value === "watchRef"
        || value === "model"
        || value === "movementMaker"
        || value === "movementCaliber"
        || value === "baseMovementMaker"
        || value === "baseMovementCaliber";
}

function isPartIdentifierMode(value: unknown): value is PartIdentifierMode {
    return value === "partName" || value === "partRef" || value === "partNameAndRef";
}

function normalizeSearchSiteProfile(value: unknown, fallback: SearchSiteProfile): SearchSiteProfile {
    if (!isPlainObject(value)) return fallback;
    const tokens = Array.isArray(value.tokens)
        ? uniqueQueries(value.tokens.filter(isProfileToken)) as SearchProfileToken[]
        : fallback.tokens;

    return {
        lang: isSupportedProfileLang(value.lang) ? value.lang : fallback.lang,
        tokens,
        partIdentifierMode: isPartIdentifierMode(value.partIdentifierMode)
            ? value.partIdentifierMode
            : fallback.partIdentifierMode,
    };
}

export function getDefaultSearchSiteProfiles(site: Pick<SearchSite, "id" | "lang">): SearchSiteProfiles {
    return defaultProfilesForSite(site);
}

function normalizeKnownDefaultSearchSiteUrl(site: Pick<SearchSite, "id" | "url">) {
    if (site.id === "cousins-uk" && site.url.trim() === COUSINS_UK_OLD_DEFAULT_URL) {
        return COUSINS_UK_DEFAULT_URL;
    }
    return site.url;
}

export function normalizeSearchSites(value: unknown, fallbackSites: SearchSite[] = DEFAULT_PART_SEARCH_SITES): SearchSite[] {
    const source = Array.isArray(value) ? value : fallbackSites;

    return source
        .filter((site): site is Record<string, unknown> => isPlainObject(site))
        .filter((site) => (
            typeof site.id === "string"
            && typeof site.name === "string"
            && isSupportedSiteLang(site.lang)
            && typeof site.url === "string"
        ))
        .map((site) => {
            const base: Omit<SearchSite, "profiles"> = {
                id: site.id as string,
                name: site.name as string,
                lang: site.lang as "ja" | "en",
                url: normalizeKnownDefaultSearchSiteUrl({
                    id: site.id as string,
                    url: site.url as string,
                }),
                enabled: site.enabled !== false,
            };
            const defaults = getDefaultSearchSiteProfiles(base);
            const rawProfiles = isPlainObject(site.profiles) ? site.profiles : {};
            return {
                ...base,
                profiles: {
                    internal: normalizeSearchSiteProfile(rawProfiles.internal, defaults.internal),
                    exterior: normalizeSearchSiteProfile(rawProfiles.exterior, defaults.exterior),
                },
            };
        });
}

export function normalizePartSearchDomain(value?: PartSearchContext["partType"], category?: string | null): SearchPartDomain {
    if (value === "internal" || value === "interior" || value === "part_internal") return "internal";
    if (value === "exterior" || value === "external" || value === "part_external") return "exterior";
    if (category === "internal" || category === "part_internal") return "internal";
    if (category === "external" || category === "part_external") return "exterior";
    return "exterior";
}

function isInteriorPart(input: LegacyPartSearchInput) {
    return normalizePartSearchDomain(input.partType, input.category) === "internal";
}

function getBrandVariants(brand?: string | null) {
    const cleaned = cleanValue(brand);
    if (!cleaned) return [];
    const variants = [cleaned];
    const upper = cleaned.toUpperCase();
    if (upper !== cleaned) variants.push(upper);
    return uniqueQueries(variants);
}

function stripParentheticalPartNotes(value: string) {
    return value.replace(/（.*?）/g, "").replace(/\(.*?\)/g, "").trim();
}

function getJapanesePartTerms(partName?: string | null) {
    const cleaned = cleanValue(partName);
    if (!cleaned) return [];
    const plain = stripParentheticalPartNotes(cleaned);
    return uniqueQueries([cleaned, plain]);
}

function getEnglishPartTerms(partName?: string | null, partNameEn?: string | null) {
    const cleaned = cleanValue(partName);
    const englishName = cleanValue(partNameEn);
    const terms: string[] = [];
    if (englishName) terms.push(englishName);
    if (!cleaned) return uniqueQueries(terms);

    const plain = stripParentheticalPartNotes(cleaned);
    const aliases = Object.entries(PART_NAME_EN_ALIASES).reduce<string[]>((result, [key, values]) => {
        if (plain.includes(key) || cleaned.includes(key)) {
            return result.concat(values);
        }
        return result;
    }, []);
    const asciiName = /[A-Za-z]/.test(plain) ? plain : "";
    return uniqueQueries([...terms, asciiName, ...aliases]);
}

export function normalizeCaliber(caliber?: string | null) {
    const cleaned = cleanValue(caliber);
    if (!cleaned) return "";
    return cleaned
        .replace(/^cal(?:iber)?\.?\s*/i, "")
        .replace(/\s+/g, "")
        .trim();
}

export function expandPartRefVariants(partRef?: string | null) {
    const cleaned = cleanValue(partRef);
    if (!cleaned) return [];

    const compact = cleaned.replace(/[\s\-./]+/g, "");
    const spaced = cleaned.replace(/[\-./]+/g, " ").replace(/\s+/g, " ").trim();
    const hyphenated = cleaned.replace(/[\s./]+/g, "-").replace(/\-+/g, "-").trim();

    return uniqueQueries([cleaned, compact, spaced, hyphenated]);
}

function tokenValueForContext(token: SearchProfileToken, context: PartSearchContext) {
    switch (token) {
        case "watchBrand":
            return context.watchBrand ?? context.brand;
        case "watchRef":
            return context.watchRef;
        case "model":
            return context.model;
        case "movementMaker":
            return context.movementMaker;
        case "movementCaliber":
            return normalizeCaliber(context.movementCaliber);
        case "baseMovementMaker":
            return context.baseMovementMaker;
        case "baseMovementCaliber":
            return normalizeCaliber(context.baseMovementCaliber);
        default:
            return undefined;
    }
}

function partIdentifierTerms(mode: PartIdentifierMode, lang: SearchLanguage | undefined, context: PartSearchContext) {
    const refs = expandPartRefVariants(context.partRef);
    const names = lang === "en"
        ? getEnglishPartTerms(context.partName, context.partNameEn)
        : getJapanesePartTerms(context.partName);

    if (mode === "partRef") return refs;
    if (mode === "partName") return names;
    return uniqueQueries([...refs, ...names]);
}

export function buildProfiledPartSearchQuery(args: {
    site?: Pick<SearchSite, "id" | "lang" | "profiles">;
    context: PartSearchContext;
    profile?: SearchSiteProfile;
    lang?: SearchLanguage;
}) {
    const domain = normalizePartSearchDomain(args.context.partType, args.context.category);
    const siteForDefaults = {
        id: args.site?.id ?? "custom",
        lang: isSupportedSiteLang(args.site?.lang) ? args.site.lang : "ja",
    };
    const profile = args.profile
        ?? args.site?.profiles?.[domain]
        ?? getDefaultSearchSiteProfiles(siteForDefaults)[domain];
    const lang = args.lang ?? args.site?.lang ?? profile.lang ?? "ja";

    const baseTokens = profile.tokens.map((token) => tokenValueForContext(token, args.context));
    const identifiers = partIdentifierTerms(profile.partIdentifierMode, lang, args.context);
    const hasPartRef = expandPartRefVariants(args.context.partRef).length > 0;
    const hasPartName = (lang === "en"
        ? getEnglishPartTerms(args.context.partName, args.context.partNameEn)
        : getJapanesePartTerms(args.context.partName)
    ).length > 0;
    const hasRequiredIdentifier = profile.partIdentifierMode === "partRef"
        ? hasPartRef
        : profile.partIdentifierMode === "partName"
            ? hasPartName
            : hasPartRef || hasPartName;
    if (!hasRequiredIdentifier) return "";

    const firstIdentifier = identifiers[0];
    const query = buildQuery([...baseTokens, firstIdentifier]);
    if (query) return query;

    if (domain === "internal") {
        return buildQuery([
            args.context.movementMaker,
            normalizeCaliber(args.context.movementCaliber),
            args.context.partRef,
            lang === "en" ? args.context.partNameEn : args.context.partName,
        ]);
    }

    return buildQuery([
        args.context.watchBrand ?? args.context.brand,
        args.context.watchRef ?? args.context.model,
        args.context.partRef,
        lang === "en" ? args.context.partNameEn : args.context.partName,
    ]);
}

export function buildJapanesePartQueries(input: LegacyPartSearchInput) {
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

export function buildEnglishPartQueries(input: LegacyPartSearchInput) {
    const brandVariants = getBrandVariants(input.brand);
    const normalizedCaliber = normalizeCaliber(input.caliber);
    const partRefVariants = expandPartRefVariants(input.partRef);
    const watchRefVariants = expandPartRefVariants(input.watchRef);
    const partTerms = getEnglishPartTerms(input.partName, input.partNameEn);
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

export function buildProfiledSearchUrls(args: {
    sites: SearchSite[];
    context: PartSearchContext;
}) {
    const { sites, context } = args;

    return sites.reduce<Array<{ site: SearchSite; query: string; url: string }>>((result, site) => {
        const query = buildProfiledPartSearchQuery({ site, context });
        if (!query) return result;
        result.push({
            site,
            query,
            url: site.url.replace("{query}", encodeURIComponent(query)),
        });
        return result;
    }, []);
}
