import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
    findOrCreateBrand,
    findOrCreateCaliber,
    normalizeCaliberName,
    normalizeMasterName,
} from "@/lib/master-normalize";

type DbLike = PrismaClient | Prisma.TransactionClient;

type ResolveMasterRefsInput = {
    brandId?: number | string | null;
    brandName?: string | null;
    modelId?: number | string | null;
    modelName?: string | null;
    caliberId?: number | string | null;
    caliberName?: string | null;
    baseCaliberId?: number | string | null;
    baseCaliberName?: string | null;
    movementMakerId?: number | string | null;
    movementMakerName?: string | null;
    baseMakerId?: number | string | null;
    baseMakerName?: string | null;
};

export type PartsMasterInput = ResolveMasterRefsInput & {
    id?: number | string | null;
    partType?: string | null;
    category?: string | null;
    subcategory?: string | null;
    watchRefs?: string | null;
    name?: string | null;
    nameJp?: string | null;
    nameEn?: string | null;
    partRefs?: string | null;
    cousinsNumber?: string | null;
    grade?: string | null;
    size?: string | null;
    photoKey?: string | null;
    notes1?: string | null;
    notes2?: string | null;
    costCurrency?: string | null;
    costOriginal?: number | string | null;
    latestCostYen?: number | string | null;
    markupRate?: number | string | null;
    retailPrice?: number | string | null;
    stockQuantity?: number | string | null;
    minStockAlert?: number | string | null;
    minStockAlertEnabled?: boolean | null;
    location?: string | null;
    supplierId?: number | string | null;
};

function cleanText(value?: string | null) {
    const normalized = (value ?? "").replace(/\s+/g, " ").trim();
    return normalized || null;
}

function normalizeCategoryValue(value?: string | null) {
    const cleaned = cleanText(value);
    if (!cleaned) return "generic";
    if (cleaned.includes("internal")) return "internal";
    if (cleaned.includes("external")) return "external";
    if (cleaned === "generic") return "generic";
    return cleaned;
}

function inferPartType(partType?: string | null, category?: string | null) {
    const cleanedPartType = cleanText(partType);
    if (cleanedPartType === "interior" || cleanedPartType === "exterior") return cleanedPartType;
    const normalizedCategory = normalizeCategoryValue(category);
    if (normalizedCategory === "internal") return "interior";
    if (normalizedCategory === "external") return "exterior";
    return null;
}

function parseNullableInt(value?: number | string | null) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableFloat(value?: number | string | null) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function splitMultiValue(value?: string | null) {
    return (value ?? "")
        .split(/[\n,、/]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function normalizeRefToken(value?: string | null) {
    return (value ?? "").replace(/[\s\-./]+/g, "").toLowerCase();
}

function normalizeTextToken(value?: string | null) {
    return normalizeMasterName(value);
}

function hasTokenOverlap(left: string[], right: string[], normalizer: (value?: string | null) => string) {
    const leftSet = new Set(left.map(normalizer).filter(Boolean));
    if (leftSet.size === 0) return false;
    return right.map(normalizer).some((token) => leftSet.has(token));
}

async function findOrCreateModel(db: DbLike, brandId: number, rawName: string) {
    const name = cleanText(rawName);
    if (!name) return null;

    const models = await db.model.findMany({
        where: { brandId },
        select: { id: true, name: true, nameEn: true, nameJp: true, brandId: true },
    });
    const normalized = normalizeMasterName(name);
    const existing = models.find((model) =>
        [model.name, model.nameEn, model.nameJp].some((value) => normalizeMasterName(value) === normalized)
    );
    if (existing) return existing;

    return await db.model.create({
        data: {
            brandId,
            name,
            nameJp: name,
            nameEn: name,
        },
    });
}

export async function resolveMasterRefs(input: ResolveMasterRefsInput, db: DbLike = prisma) {
    const directBrandId = parseNullableInt(input.brandId);
    const directModelId = parseNullableInt(input.modelId);
    const directCaliberId = parseNullableInt(input.caliberId);
    const directBaseCaliberId = parseNullableInt(input.baseCaliberId);
    const directMovementMakerId = parseNullableInt(input.movementMakerId);
    const directBaseMakerId = parseNullableInt(input.baseMakerId);

    const brandName = cleanText(input.brandName);
    const modelName = cleanText(input.modelName);
    const caliberName = cleanText(input.caliberName);
    const baseCaliberName = cleanText(input.baseCaliberName);
    const movementMakerName = cleanText(input.movementMakerName);
    const baseMakerName = cleanText(input.baseMakerName);

    const brand = directBrandId
        ? await db.brand.findUnique({ where: { id: directBrandId }, select: { id: true, name: true, nameEn: true, nameJp: true } })
        : (brandName ? await findOrCreateBrand(db as any, brandName) : null);

    const model = directModelId
        ? await db.model.findUnique({ where: { id: directModelId }, select: { id: true, name: true, nameEn: true, nameJp: true, brandId: true } })
        : (brand?.id && modelName ? await findOrCreateModel(db, brand.id, modelName) : null);

    const caliber = directCaliberId
        ? await db.caliber.findUnique({ where: { id: directCaliberId }, select: { id: true, name: true, nameEn: true, nameJp: true, brandId: true } })
        : (caliberName ? await findOrCreateCaliber(db as any, caliberName, brand?.id ?? null) : null);

    const baseCaliber = directBaseCaliberId
        ? await db.caliber.findUnique({ where: { id: directBaseCaliberId }, select: { id: true, name: true } })
        : (baseCaliberName ? await findOrCreateCaliber(db as any, baseCaliberName, brand?.id ?? null) : null);

    const movementMaker = directMovementMakerId
        ? await db.brand.findUnique({ where: { id: directMovementMakerId }, select: { id: true, name: true } })
        : (movementMakerName ? await findOrCreateBrand(db as any, movementMakerName) : null);

    const baseMaker = directBaseMakerId
        ? await db.brand.findUnique({ where: { id: directBaseMakerId }, select: { id: true, name: true } })
        : (baseMakerName ? await findOrCreateBrand(db as any, baseMakerName) : null);

    return {
        brandId: brand?.id ?? null,
        modelId: model?.id ?? null,
        caliberId: caliber?.id ?? null,
        baseCaliberId: baseCaliber?.id ?? null,
        movementMakerId: movementMaker?.id ?? null,
        baseMakerId: baseMaker?.id ?? null,
    };
}

function buildNormalizedPartsMasterData(input: PartsMasterInput, refs: Awaited<ReturnType<typeof resolveMasterRefs>>) {
    const nameJp = cleanText(input.nameJp) ?? cleanText(input.name) ?? "";
    const nameEn = cleanText(input.nameEn) ?? null;
    const partRefs = cleanText(input.partRefs);
    const watchRefs = cleanText(input.watchRefs);

    return {
        partType: inferPartType(input.partType, input.category),
        category: normalizeCategoryValue(input.category),
        subcategory: cleanText(input.subcategory),
        brandId: refs.brandId,
        modelId: refs.modelId,
        watchRefs,
        caliberId: refs.caliberId,
        baseCaliberId: refs.baseCaliberId,
        movementMakerId: refs.movementMakerId,
        baseMakerId: refs.baseMakerId,
        name: nameJp,
        nameJp,
        nameEn,
        partRefs,
        cousinsNumber: cleanText(input.cousinsNumber),
        grade: cleanText(input.grade),
        size: cleanText(input.size),
        photoKey: cleanText(input.photoKey),
        notes1: cleanText(input.notes1),
        notes2: cleanText(input.notes2),
        costCurrency: cleanText(input.costCurrency) ?? "JPY",
        costOriginal: parseNullableFloat(input.costOriginal) ?? 0,
        latestCostYen: parseNullableInt(input.latestCostYen) ?? 0,
        markupRate: parseNullableFloat(input.markupRate) ?? 1.3,
        retailPrice: parseNullableInt(input.retailPrice) ?? 0,
        stockQuantity: parseNullableInt(input.stockQuantity) ?? 0,
        minStockAlert: parseNullableInt(input.minStockAlert) ?? 0,
        minStockAlertEnabled: input.minStockAlertEnabled === true,
        location: cleanText(input.location),
        supplierId: parseNullableInt(input.supplierId),
    };
}

function isInteriorPart(partType?: string | null) {
    return cleanText(partType) === "interior";
}

async function findExistingPartsMaster(db: DbLike, data: ReturnType<typeof buildNormalizedPartsMasterData>, currentId?: number | null) {
    const baseWhere: any = { partType: data.partType };
    if (data.brandId !== null) baseWhere.brandId = data.brandId;
    if (isInteriorPart(data.partType) && data.caliberId !== null) {
        baseWhere.caliberId = data.caliberId;
    }

    const candidates = await db.partsMaster.findMany({
        where: baseWhere,
        select: {
            id: true,
            partType: true,
            brandId: true,
            modelId: true,
            watchRefs: true,
            caliberId: true,
            nameJp: true,
            partRefs: true,
        },
    });

    const others = candidates.filter((candidate) => candidate.id !== currentId);
    const inputPartRefs = splitMultiValue(data.partRefs);
    const inputWatchRefs = splitMultiValue(data.watchRefs);
    const inputName = normalizeTextToken(data.nameJp);

    if (isInteriorPart(data.partType)) {
        return others.find((candidate) => {
            if (data.brandId !== null && candidate.brandId !== data.brandId) return false;
            if (data.caliberId !== null && candidate.caliberId !== data.caliberId) return false;
            if (inputPartRefs.length > 0) {
                return hasTokenOverlap(inputPartRefs, splitMultiValue(candidate.partRefs), normalizeRefToken);
            }
            return normalizeTextToken(candidate.nameJp) === inputName;
        }) ?? null;
    }

    return others.find((candidate) => {
        if (data.brandId !== null && candidate.brandId !== data.brandId) return false;
        if (inputWatchRefs.length > 0 && !hasTokenOverlap(inputWatchRefs, splitMultiValue(candidate.watchRefs), normalizeRefToken)) {
            return false;
        }
        if (inputPartRefs.length > 0) {
            return hasTokenOverlap(inputPartRefs, splitMultiValue(candidate.partRefs), normalizeRefToken);
        }
        return normalizeTextToken(candidate.nameJp) === inputName;
    }) ?? null;
}

export async function createOrUpdatePartsMaster(input: PartsMasterInput, db: DbLike = prisma) {
    const currentId = parseNullableInt(input.id);
    const refs = await resolveMasterRefs(input, db);
    const data = buildNormalizedPartsMasterData(input, refs);

    if (!data.nameJp) {
        throw new Error("nameJp is required");
    }

    const existing = await findExistingPartsMaster(db, data, currentId);

    if (existing && !currentId) {
        return await db.partsMaster.update({
            where: { id: existing.id },
            data,
        });
    }

    if (currentId) {
        return await db.partsMaster.update({
            where: { id: currentId },
            data,
        });
    }

    return await db.partsMaster.create({ data });
}

export const __partsMasterInternals = {
    cleanText,
    normalizeCategoryValue,
    inferPartType,
    normalizeRefToken,
    splitMultiValue,
    findOrCreateModel,
};
