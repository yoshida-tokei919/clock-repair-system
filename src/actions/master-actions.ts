"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// --- Brand ---
export async function getBrands() {
    return await prisma.brand.findMany({
        orderBy: { nameJp: 'asc' }
    });
}

export async function upsertBrand(name: string) {
    const brand = await prisma.brand.upsert({
        where: { name: name },
        create: { name: name, nameJp: name },
        update: {}
    });
    return brand;
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
    const existing = await prisma.caliber.findFirst({
        where: { name }
    });
    if (existing) return existing;

    return await prisma.caliber.create({
        data: { name, brandId }
    });
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

export async function getPartsMatched(brandId?: number, modelId?: number, caliberId?: number, category?: string) {
    try {
        if (!brandId) return [];

        const where: any = { brandId: brandId };
        if (category) where.category = category;

        const conditions: any[] = [];
        if (modelId) conditions.push({ OR: [{ modelId: modelId }, { modelId: null }] });
        if (caliberId) conditions.push({ OR: [{ caliberId: caliberId }, { caliberId: null }] });

        if (conditions.length > 0) {
            where.AND = conditions;
        }

        const parts = await prisma.partsMaster.findMany({
            where,
            include: { brand: true, model: true, caliber: true }
        });

        return parts.sort((a, b) => {
            const scoreA = (a.caliberId ? 10 : 0) + (a.modelId ? 5 : 0);
            const scoreB = (b.caliberId ? 10 : 0) + (b.modelId ? 5 : 0);
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
