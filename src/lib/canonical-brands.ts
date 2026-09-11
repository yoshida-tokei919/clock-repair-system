import { CANONICAL_BRAND_SEEDS } from "../data/canonical-brands";

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

export function canonicalBrandUpdateData(brand: CanonicalBrand) {
    return {
        nameEn: brand.nameEn,
        nameJp: brand.nameJp,
        brandKind: brand.brandKind,
        isWatchBrand: brand.isWatchBrand,
        // Never overwrite an established movement maker with false. Prisma omits undefined fields.
        isMovementMaker: brand.isMovementMaker ? true : undefined,
    };
}

const MOVEMENT_MAKER_NAMES = new Set(["ROLEX", "SEIKO", "ETA"]);

/** Runtime canonical master derived only from the reviewed FMP inventory and explicit decisions. */
export const CANONICAL_BRANDS: CanonicalBrand[] = CANONICAL_BRAND_SEEDS.map((brand) => ({
    ...brand,
    isWatchBrand: brand.name !== "ETA",
    isMovementMaker: MOVEMENT_MAKER_NAMES.has(brand.name),
}));
