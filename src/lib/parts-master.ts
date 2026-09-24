import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
    findOrCreateBrand,
    findOrCreateCaliber,
    normalizeCaliberName,
    normalizeMasterName,
} from "@/lib/master-normalize";
import { hasCompleteInternalPartContext, hasPartRefOverlap, matchesInternalPartCandidate, matchesStandardPartNameIdentity, mergeWatchRefs, preserveStandardPartNameId, splitWatchRefs, watchRefsAllowIdentity } from "@/lib/parts-master-compatibility";
import { RepairPartValidationError } from "@/lib/repair-part-validation";

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
    gradeId?: string | null;
    grade?: string | null;
};

export type PartsMasterInput = ResolveMasterRefsInput & {
    id?: number | string | null;
    partType?: string | null;
    category?: string | null;
    subcategory?: string | null;
    standardPartNameId?: string | null;
    standardNameCandidates?: Array<string | null>;
    repairLinkedMaster?: boolean;
    gradeId?: string | null;
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
        .split(/[\n,、]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function normalizeRefToken(value?: string | null) {
    return (value ?? "").trim();
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
    const directGradeId = cleanText(input.gradeId);

    const brandName = cleanText(input.brandName);
    const modelName = cleanText(input.modelName);
    const caliberName = cleanText(input.caliberName);
    const baseCaliberName = cleanText(input.baseCaliberName);
    const movementMakerName = cleanText(input.movementMakerName);
    const baseMakerName = cleanText(input.baseMakerName);
    const gradeName = cleanText(input.grade);

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

    const grade = directGradeId
        ? { id: directGradeId }
        : (gradeName
            ? (await db.partGradeMaster.findMany({
                where: { isActive: true },
                select: { id: true, key: true, nameJa: true, nameEn: true },
            })).find((item) =>
                [item.id, item.key, item.nameJa, item.nameEn].some((value) => cleanText(value) === gradeName)
            ) ?? null
            : null);

    return {
        brandId: brand?.id ?? null,
        modelId: model?.id ?? null,
        caliberId: caliber?.id ?? null,
        baseCaliberId: baseCaliber?.id ?? null,
        movementMakerId: movementMaker?.id ?? null,
        baseMakerId: baseMaker?.id ?? null,
        gradeId: grade?.id ?? null,
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
        standardPartNameId: cleanText(input.standardPartNameId),
        gradeId: refs.gradeId,
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

function gradeMatches(
    data: ReturnType<typeof buildNormalizedPartsMasterData>,
    candidate: { gradeId?: string | null; grade?: string | null }
) {
    const dataGradeId = cleanText(data.gradeId);
    const candidateGradeId = cleanText(candidate.gradeId);
    if (dataGradeId && candidateGradeId) return dataGradeId === candidateGradeId;

    const dataGrade = cleanText(data.grade);
    const candidateGrade = cleanText(candidate.grade);
    if (dataGrade || candidateGrade) return dataGrade === candidateGrade;

    return !dataGradeId && !candidateGradeId;
}

async function findExistingPartsMaster(db: DbLike, data: ReturnType<typeof buildNormalizedPartsMasterData>, currentId?: number | null, standardNameCandidates?: Array<string | null>, strictRepairIdentity = false) {
    const baseWhere: any = isInteriorPart(data.partType)
        ? { OR: [{ partType: "interior" }, { category: "internal" }] }
        : { OR: [{ partType: "exterior" }, { category: "external" }] };
    const internalContext = {
        movementMakerId: data.movementMakerId,
        movementCaliberId: data.caliberId,
        baseMovementMakerId: data.baseMakerId,
        baseMovementCaliberId: data.baseCaliberId,
    };
    // Repair entry requires a verified pair; standalone Parts workflows retain
    // their existing nullable Cal/maker candidate matching.
    if (strictRepairIdentity && isInteriorPart(data.partType) && !hasCompleteInternalPartContext(internalContext)) return null;
    if (strictRepairIdentity && isInteriorPart(data.partType)) {
        baseWhere.AND = [{ OR: [
            ...(data.movementMakerId && data.caliberId
                ? [{ movementMakerId: data.movementMakerId, caliberId: data.caliberId }] : []),
            ...(data.baseMakerId && data.baseCaliberId
                ? [{ baseMakerId: data.baseMakerId, baseCaliberId: data.baseCaliberId }] : []),
        ] }];
    } else if (isInteriorPart(data.partType) && data.caliberId !== null) {
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
            movementMakerId: true,
            baseCaliberId: true,
            baseMakerId: true,
            category: true,
            gradeId: true,
            grade: true,
            nameJp: true,
            partRefs: true,
            standardPartNameId: true,
        },
    });

    const others = candidates.filter((candidate) => candidate.id !== currentId);
    const inputPartRefs = splitMultiValue(data.partRefs);
    const inputName = normalizeTextToken(data.nameJp);

    if (isInteriorPart(data.partType)) {
        return others.find((candidate) => {
            if (!matchesStandardPartNameIdentity(candidate, data, standardNameCandidates)) return false;
            if (strictRepairIdentity) {
                if (!matchesInternalPartCandidate(candidate, internalContext)) return false;
            } else {
                if (data.caliberId !== null && candidate.caliberId !== data.caliberId) return false;
                if (data.movementMakerId !== null && candidate.movementMakerId !== data.movementMakerId) return false;
            }
            if (!gradeMatches(data, candidate)) return false;
            if (inputPartRefs.length > 0) {
                return hasTokenOverlap(inputPartRefs, splitMultiValue(candidate.partRefs), normalizeRefToken);
            }
            return normalizeTextToken(candidate.nameJp) === inputName;
        }) ?? null;
    }

    return others.find((candidate) => {
        if (!matchesStandardPartNameIdentity(candidate, data, standardNameCandidates)) return false;
        if (data.brandId !== null && candidate.brandId !== data.brandId) return false;
        if (!gradeMatches(data, candidate)) return false;
        if (!watchRefsAllowIdentity(data.watchRefs, candidate.watchRefs)) return false;
        const incomingHasWatchRef = splitWatchRefs(data.watchRefs).length > 0;
        const candidateHasWatchRef = splitWatchRefs(candidate.watchRefs).length > 0;
        if (incomingHasWatchRef && !candidateHasWatchRef) {
            if (data.modelId === null || candidate.modelId === null || data.modelId !== candidate.modelId) return false;
            return hasPartRefOverlap(data.partRefs, candidate.partRefs);
        }
        if (!incomingHasWatchRef && data.modelId !== null && candidate.modelId !== null
            && data.modelId !== candidate.modelId) return false;
        if (inputPartRefs.length > 0 || splitWatchRefs(candidate.partRefs).length > 0) {
            return hasPartRefOverlap(data.partRefs, candidate.partRefs);
        }
        return normalizeTextToken(candidate.nameJp) === inputName;
    }) ?? null;
}

export async function createOrUpdatePartsMaster(input: PartsMasterInput, db: DbLike = prisma, options: { strictRepairIdentity?: boolean } = {}) {
    const currentId = parseNullableInt(input.id);
    const refs = await resolveMasterRefs(input, db);
    const data = buildNormalizedPartsMasterData(input, refs);

    if (!data.nameJp) {
        throw new Error("nameJp is required");
    }

    const existing = await findExistingPartsMaster(db, data, currentId, input.standardNameCandidates, options.strictRepairIdentity);

    if (existing && !currentId) {
        return await db.partsMaster.update({
            where: { id: existing.id },
            data: {
                ...data,
                standardPartNameId: preserveStandardPartNameId(existing.standardPartNameId, data.standardPartNameId),
                watchRefs: mergeWatchRefs(existing.watchRefs, data.watchRefs),
            },
        });
    }

    if (currentId) {
        if (input.repairLinkedMaster) {
            const current = await db.partsMaster.findUnique({
                where: { id: currentId },
                select: { standardPartNameId: true, watchRefs: true },
            });
            if (!current) throw new RepairPartValidationError("指定された部品が見つかりません。");
            if (current.standardPartNameId && data.standardPartNameId
                && current.standardPartNameId !== data.standardPartNameId) {
                throw new RepairPartValidationError("既存部品の標準部品名と一致しません。");
            }
            data.standardPartNameId = preserveStandardPartNameId(current.standardPartNameId, data.standardPartNameId);
            data.watchRefs = mergeWatchRefs(current.watchRefs, data.watchRefs);
        }
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
    gradeMatches,
    findOrCreateModel,
};
