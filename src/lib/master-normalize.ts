type PrismaLike = {
    brand: {
        findMany: (args?: any) => Promise<any[]>;
        findUnique: (args: any) => Promise<any>;
        create: (args: any) => Promise<any>;
        update: (args: any) => Promise<any>;
    };
    brandAlias: {
        findUnique: (args: any) => Promise<any>;
        create: (args: any) => Promise<any>;
    };
    caliber: {
        findMany: (args?: any) => Promise<any[]>;
        create: (args: any) => Promise<any>;
        update: (args: any) => Promise<any>;
    };
};

const IGNORED_BRAND_PUNCTUATION = /[&＆.・'’‘`´]/g;
const IGNORED_BRAND_HYPHENS = /[-‐‑‒–—―−]/g;
const LATIN_CHARACTER = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

function removeLatinDiacritics(value: string) {
    return Array.from(value).map((character) => {
        if (!LATIN_CHARACTER.test(character)) return character;
        return character.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }).join("");
}

/** Lookup-only key. Japanese long vowels and voiced marks are retained. */
export function normalizeBrandName(value?: string | null) {
    const normalized = (value ?? "").normalize("NFKC").trim();
    return removeLatinDiacritics(normalized)
        .toUpperCase()
        .replace(/[\s\u3000]+/g, "")
        .replace(IGNORED_BRAND_PUNCTUATION, "")
        .replace(IGNORED_BRAND_HYPHENS, "");
}

/** Matches a normalized query against canonical names and explicit aliases. */
export function matchesBrandSearch(query: string, values: Array<string | null | undefined>) {
    const normalizedQuery = normalizeBrandName(query);
    return Boolean(normalizedQuery) && values.some((value) => normalizeBrandName(value).includes(normalizedQuery));
}

export function normalizeMasterName(value?: string | null) {
    return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function normalizeCaliberName(value?: string | null) {
    return normalizeMasterName(value)
        .replace(/^cal(?:iber)?\.?\s*/i, "")
        .replace(/\s+/g, "");
}

function matchesNormalizedCaliber(values: Array<string | null | undefined>, normalized: string) {
    return values.some((value) => normalizeCaliberName(value) === normalized);
}

export async function resolveBrand(db: PrismaLike, rawName: string) {
    const normalized = normalizeBrandName(rawName);
    if (!normalized) return null;

    const alias = await db.brandAlias.findUnique({
        where: { normalizedAlias: normalized },
        include: { brand: true },
    });
    if (alias?.brand) return alias.brand;

    const brands = await db.brand.findMany({
        select: { id: true, name: true, nameEn: true, nameJp: true, kana: true, initialChar: true, brandKind: true },
    });
    return brands.find((brand) =>
        [brand.name, brand.nameEn, brand.nameJp].some((entry) => normalizeBrandName(entry) === normalized)
    ) ?? null;
}

export async function findOrCreateBrand(
    db: PrismaLike,
    rawName: string,
    roles: { isWatchBrand?: boolean; isMovementMaker?: boolean } = {}
) {
    const name = rawName.trim();
    const normalized = normalizeBrandName(name);
    if (!normalized) throw new Error("ブランド名を入力してください。");

    const existing = await resolveBrand(db, name);
    if (existing) {
        const update: Record<string, boolean> = {};
        if (roles.isWatchBrand && !existing.isWatchBrand) update.isWatchBrand = true;
        if (roles.isMovementMaker && !existing.isMovementMaker) update.isMovementMaker = true;
        return Object.keys(update).length > 0
            ? await db.brand.update({ where: { id: existing.id }, data: update })
            : existing;
    }

    return await db.brand.create({
        data: {
            name,
            nameJp: name,
            nameEn: name,
            ...roles,
            aliases: { create: { alias: name, normalizedAlias: normalized } },
        },
    });
}

export async function findOrCreateCaliber(db: PrismaLike, rawName: string, brandId?: number | null) {
    const name = rawName.trim();
    const normalized = normalizeCaliberName(name);
    const scopedBrandId = brandId ?? null;
    const calibers = await db.caliber.findMany({
        where: { brandId: scopedBrandId },
        select: { id: true, brandId: true, name: true, nameEn: true, nameJp: true, movementType: true, standardWorkMinutes: true },
    });
    const existing = calibers.find((caliber) =>
        caliber.brandId === scopedBrandId && matchesNormalizedCaliber([caliber.name, caliber.nameEn, caliber.nameJp], normalized)
    );
    if (existing) return existing;

    return await db.caliber.create({ data: { name: normalized, brandId: scopedBrandId } });
}
