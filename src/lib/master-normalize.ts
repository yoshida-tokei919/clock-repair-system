type PrismaLike = {
    brand: {
        findMany: (args?: any) => Promise<any[]>;
        create: (args: any) => Promise<any>;
        update: (args: any) => Promise<any>;
    };
    caliber: {
        findMany: (args?: any) => Promise<any[]>;
        create: (args: any) => Promise<any>;
        update: (args: any) => Promise<any>;
    };
};

export function normalizeMasterName(value?: string | null) {
    return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function normalizeCaliberName(value?: string | null) {
    return normalizeMasterName(value)
        .replace(/^cal(?:iber)?\.?\s*/i, "")
        .replace(/\s+/g, "");
}

function matchesNormalized(values: Array<string | null | undefined>, normalized: string) {
    return values.some((value) => normalizeMasterName(value) === normalized);
}

function matchesNormalizedCaliber(values: Array<string | null | undefined>, normalized: string) {
    return values.some((value) => normalizeCaliberName(value) === normalized);
}

export async function findOrCreateBrand(db: PrismaLike, rawName: string) {
    const name = rawName.trim();
    const normalized = normalizeMasterName(name);
    const brands = await db.brand.findMany({
        select: { id: true, name: true, nameEn: true, nameJp: true, kana: true, initialChar: true },
    });
    const existing = brands.find((brand) =>
        matchesNormalized([brand.name, brand.nameEn, brand.nameJp], normalized)
    );
    if (existing) return existing;

    return await db.brand.create({
        data: {
            name,
            nameJp: name,
            nameEn: name,
        },
    });
}

export async function findOrCreateCaliber(db: PrismaLike, rawName: string, brandId?: number | null) {
    const name = rawName.trim();
    const normalized = normalizeCaliberName(name);
    const calibers = await db.caliber.findMany({
        select: {
            id: true,
            brandId: true,
            name: true,
            nameEn: true,
            nameJp: true,
            movementType: true,
            standardWorkMinutes: true,
        },
    });
    const existing = calibers.find((caliber) =>
        matchesNormalizedCaliber([caliber.name, caliber.nameEn, caliber.nameJp], normalized)
    );
    if (existing) {
        if (brandId && !existing.brandId) {
            return await db.caliber.update({
                where: { id: existing.id },
                data: { brandId },
            });
        }
        return existing;
    }

    return await db.caliber.create({
        data: {
            name: normalized,
            brandId: brandId ?? null,
        },
    });
}
