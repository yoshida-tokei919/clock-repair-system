import { findOrCreateBrand, resolveBrand } from "@/lib/master-normalize";

export async function resolveRepairMovementMaker(db: any, rawName: string | null | undefined) {
    const name = rawName?.trim();
    if (!name) return null;

    const existing = await resolveBrand(db, name);
    if (existing?.brandKind === "TYPE") {
        throw new Error("種別ブランドと同名のムーブメントメーカーは登録できません。");
    }
    const maker = await findOrCreateBrand(db, name, { isWatchBrand: false, isMovementMaker: true });
    if (maker.brandKind === "TYPE") {
        throw new Error("種別ブランドと同名のムーブメントメーカーは登録できません。");
    }
    return maker.id as number;
}
