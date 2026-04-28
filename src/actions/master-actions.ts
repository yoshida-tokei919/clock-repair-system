"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { findOrCreateBrand, findOrCreateCaliber } from "@/lib/master-normalize";

// --- Brand ---
export async function getBrands() {
    return await prisma.brand.findMany({
        orderBy: { nameJp: 'asc' }
    });
}

export async function upsertBrand(name: string) {
    return await findOrCreateBrand(prisma, name);
}

// --- Model ---
export async function getModels(brandId?: number) {
    return await prisma.model.findMany({
        where: brandId ? { brandId } : {},
        orderBy: { nameJp: 'asc' },
        include: { brand: true }
    });
}

export async function upsertModel(brandName: string, modelName: string) {
    const brand = await upsertBrand(brandName);
    const model = await prisma.model.findFirst({
        where: {
            brandId: brand.id,
            OR: [
                { name: modelName },
                { nameEn: modelName },
                { nameJp: modelName },
                { name: { contains: modelName } }
            ]
        }
    });

    if (model) return model;

    return await prisma.model.create({
        data: {
            name: modelName,
            nameJp: modelName,
            brandId: brand.id
        }
    });
}

// --- WatchReference (Ref No) ---
export async function getRefsByModel(modelId: number) {
    return await prisma.watchReference.findMany({
        where: { modelId: modelId },
        orderBy: { name: 'asc' },
        include: { caliber: true }
    });
}

export async function upsertRef(modelName: string, brandName: string, refName: string, caliberName?: string) {
    const model = await upsertModel(brandName, modelName);

    let caliberId = null;
    if (caliberName) {
        const caliber = await upsertCaliber(caliberName, model.brandId);
        caliberId = caliber.id;
    }

    const existing = await prisma.watchReference.findFirst({
        where: { name: refName, modelId: model.id }
    });

    if (existing) {
        if (caliberId && existing.caliberId !== caliberId) {
            return await prisma.watchReference.update({
                where: { id: existing.id },
                data: { caliberId }
            });
        }
        return existing;
    }

    return await prisma.watchReference.create({
        data: {
            name: refName,
            modelId: model.id,
            caliberId: caliberId
        }
    });
}

// --- Caliber ---
export async function getCalibers(brandId?: number) {
    return await prisma.caliber.findMany({
        where: brandId ? { brandId } : {},
        orderBy: { name: 'asc' }
    });
}

export async function upsertCaliber(name: string, brandId?: number) {
    return await findOrCreateCaliber(prisma, name, brandId);
}

/**
 * Fetches calibers associated with a specific Brand and Model based on existing records.
 */
export async function getCalibersForModel(brandId: number, modelId?: number) {
    if (!modelId) return await getCalibers(brandId);

    // Look into WatchReference, PartsMaster and PricingRule for associations
    const [refCalibers, partsCalibers, pricingCalibers] = await Promise.all([
        prisma.watchReference.findMany({
            where: { modelId, caliberId: { not: null } },
            select: { caliberId: true },
            distinct: ['caliberId']
        }),
        prisma.partsMaster.findMany({
            where: { brandId, modelId, caliberId: { not: null } },
            select: { caliberId: true },
            distinct: ['caliberId']
        }),
        prisma.pricingRule.findMany({
            where: { brandId, modelId, caliberId: { not: null } },
            select: { caliberId: true },
            distinct: ['caliberId']
        })
    ]);

    const caliberIds = Array.from(new Set([
        ...refCalibers.map(r => r.caliberId as number),
        ...partsCalibers.map(p => p.caliberId as number),
        ...pricingCalibers.map(p => p.caliberId as number)
    ]));

    if (caliberIds.length > 0) {
        return await prisma.caliber.findMany({
            where: { id: { in: caliberIds } },
            orderBy: { name: 'asc' }
        });
    }

    // Fallback to all calibers for the brand
    return await getCalibers(brandId);
}

/**
 * Get calibers Narrowed by Ref
 */
export async function getCalibersForRef(refId: number) {
    const ref = await prisma.watchReference.findUnique({
        where: { id: refId },
        include: { caliber: true }
    });

    if (ref && ref.caliber) {
        return [ref.caliber];
    }

    return [];
}

// --- Work Content (Using PricingRule as the closest model) ---
export async function getWorkMasters() {
    // Currently mapping PricingRule to a simpler "WorkMaster" structure
    const rules = await prisma.pricingRule.findMany();
    return rules.map(r => ({
        id: r.id,
        name: r.suggestedWorkName,
        price: r.minPrice,
        brandId: r.brandId,
        modelId: r.modelId,
        caliberId: r.caliberId
    }));
}

export async function upsertWorkMaster(data: {
    name: string;
    price: number;
    brandName?: string;
    modelName?: string;
    caliberName?: string;
    category: 'internal' | 'external';
    notes?: string;
}) {
    let bId = null;
    let mId = null;
    let cId = null;

    if (data.brandName) {
        const b = await upsertBrand(data.brandName);
        bId = b.id;
    }
    if (data.brandName && data.modelName) {
        const m = await upsertModel(data.brandName, data.modelName);
        mId = m.id;
    }
    if (data.caliberName) {
        const c = await upsertCaliber(data.caliberName, bId || undefined);
        cId = c.id;
    }

    // Upsert into PricingRule
    // Note: If 'notes' is different, we want a NEW record.
    const existing = await prisma.pricingRule.findFirst({
        where: {
            suggestedWorkName: data.name,
            brandId: bId,
            modelId: mId,
            caliberId: cId,
            notes: data.notes || ""
        }
    });

    if (existing) {
        return await prisma.pricingRule.update({
            where: { id: existing.id },
            data: {
                minPrice: data.price,
                maxPrice: data.price,
                notes: data.notes || ""
            }
        });
    }

    return await prisma.pricingRule.create({
        data: {
            suggestedWorkName: data.name,
            minPrice: data.price,
            maxPrice: data.price,
            brandId: bId,
            modelId: mId,
            caliberId: cId,
            notes: data.notes || ""
        }
    });
}

export async function getPricingRules(brandId?: number, modelId?: number, caliberId?: number) {
    try {
        if (!brandId) return [];

        const where: any = { brandId: brandId };

        if (modelId) {
            where.OR = [{ modelId: modelId }, { modelId: null }];
        }
        if (caliberId) {
            // If we already have OR from modelId, we need to handle nested OR or separate AND
            // Simplified: let's just use AND with multiple ORs if possible, or build a clean object
            if (!where.AND) where.AND = [];
            where.AND.push({ OR: [{ caliberId: caliberId }, { caliberId: null }] });
        }

        const rules = await prisma.pricingRule.findMany({ where });

        return rules.sort((a, b) => {
            const scoreA = (a.caliberId === caliberId && caliberId ? 100 : (a.caliberId ? -1 : 0)) +
                (a.modelId === modelId && modelId ? 50 : (a.modelId ? -1 : 0));
            const scoreB = (b.caliberId === caliberId && caliberId ? 100 : (b.caliberId ? -1 : 0)) +
                (b.modelId === modelId && modelId ? 50 : (b.modelId ? -1 : 0));
            return scoreB - scoreA;
        });
    } catch (error) {
        console.error("Failed to fetch pricing rules:", error);
        return [];
    }
}

export async function getPartsMatched(
    brandId?: number,
    modelId?: number,
    caliberId?: number,
    category?: string,
    movementMakerId?: number,
    movementCaliberId?: number,
    baseMovementMakerId?: number,
    baseMovementCaliberId?: number,
    searchTerm?: string
) {
    try {
        const isInteriorWhere = { OR: [{ partType: 'interior' }, { category: 'internal' }] };
        const isExteriorWhere = { NOT: isInteriorWhere };

        const whereClauses: any[] = [];

        if (brandId) {
            const exteriorClause: any = {
                brandId,
                ...isExteriorWhere,
            };
            if (category) exteriorClause.category = category;
            whereClauses.push(exteriorClause);
        }

        if (movementMakerId && movementCaliberId) {
            const interiorClause: any = {
                movementMakerId,
                caliberId: movementCaliberId,
                ...isInteriorWhere,
            };
            if (category) interiorClause.category = category;
            whereClauses.push(interiorClause);
        }

        if (baseMovementMakerId && baseMovementCaliberId) {
            const baseInteriorClause: any = {
                baseMakerId: baseMovementMakerId,
                baseCaliberId: baseMovementCaliberId,
                ...isInteriorWhere,
            };
            if (category) baseInteriorClause.category = category;
            whereClauses.push(baseInteriorClause);
        }

        if (whereClauses.length === 0) return [];

        const parts = await prisma.partsMaster.findMany({
            where: { OR: whereClauses },
            include: {
                brand: true,
                model: true,
                caliber: true,
                baseCaliber: true,
                movementMaker: true,
                baseMaker: true,
                supplier: true,
            }
        });

        const filtered = parts.filter((part) => {
            const isInterior = part.partType === 'interior' || part.category === 'internal';
            if (isInterior) {
                const movementMatched = Boolean(
                    movementMakerId
                    && movementCaliberId
                    && part.movementMakerId === movementMakerId
                    && part.caliberId === movementCaliberId
                );
                const baseMovementMatched = Boolean(
                    baseMovementMakerId
                    && baseMovementCaliberId
                    && part.baseMakerId === baseMovementMakerId
                    && part.baseCaliberId === baseMovementCaliberId
                );
                return movementMatched || baseMovementMatched;
            }

            return Boolean(brandId && part.brandId === brandId);
        });

        const normalizedSearchTerm = searchTerm?.trim().toLowerCase() || "";
        const refSearchToken = normalizedSearchTerm.replace(/[\s._-]+/g, "");

        const getInteriorScore = (part: typeof filtered[number]) => {
            const movementMatched = Boolean(
                movementMakerId
                && movementCaliberId
                && part.movementMakerId === movementMakerId
                && part.caliberId === movementCaliberId
            );
            const baseMatched = Boolean(
                baseMovementMakerId
                && baseMovementCaliberId
                && part.baseMakerId === baseMovementMakerId
                && part.baseCaliberId === baseMovementCaliberId
            );
            const hasPartRef = Boolean(part.partRefs);
            const hasPartName = Boolean(part.nameJp || part.name);
            const normalizedPartRefs = (part.partRefs || "").toLowerCase();
            const normalizedPartRefsToken = normalizedPartRefs.replace(/[\s._-]+/g, "");
            const normalizedPartName = `${part.nameJp || ""} ${part.name || ""}`.toLowerCase();
            const refMatched = Boolean(
                normalizedSearchTerm
                && refSearchToken
                && normalizedPartRefsToken.includes(refSearchToken)
            );
            const nameMatched = Boolean(
                normalizedSearchTerm
                && normalizedPartName.includes(normalizedSearchTerm)
            );

            if (movementMatched && refMatched) return 600;
            if (baseMatched && refMatched) return 500;
            if (movementMatched && nameMatched) return 450;
            if (baseMatched && nameMatched) return 350;
            if (movementMatched && hasPartRef) return 400;
            if (baseMatched && hasPartRef) return 300;
            if (movementMatched && hasPartName) return 200;
            if (baseMatched && hasPartName) return 100;
            return 0;
        };

        return filtered.sort((a, b) => {
            const aInterior = a.partType === 'interior' || a.category === 'internal';
            const bInterior = b.partType === 'interior' || b.category === 'internal';
            const scoreA =
                (aInterior ? getInteriorScore(a) : 0) +
                (!aInterior && a.caliberId === caliberId && caliberId ? 20 : 0) +
                (!aInterior && a.brandId === brandId ? 15 : 0) +
                (!aInterior && a.modelId === modelId && modelId ? 5 : (!aInterior && a.modelId ? -1 : 0));
            const scoreB =
                (bInterior ? getInteriorScore(b) : 0) +
                (!bInterior && b.caliberId === caliberId && caliberId ? 20 : 0) +
                (!bInterior && b.brandId === brandId ? 15 : 0) +
                (!bInterior && b.modelId === modelId && modelId ? 5 : (!bInterior && b.modelId ? -1 : 0));
            return scoreB - scoreA;
        });
    } catch (error) {
        console.error("Failed to fetch parts:", error);
        return [];
    }
}

// --- Master Data Sync ---
// This is used to re-render pages if needed
export async function revalidateMasterData() {
    revalidatePath("/parts");
    revalidatePath("/repairs/new");
}
