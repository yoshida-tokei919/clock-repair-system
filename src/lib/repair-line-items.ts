import type { Prisma, PrismaClient, RepairLineItemType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbLike = PrismaClient | Prisma.TransactionClient;

export type RepairLineItemInput = {
    lineType: "LABOR" | "PART";
    sourceCategory?: string | null;
    partsMasterId?: number | null;
    pricingRuleId?: number | null;
    repairWorkCategoryId?: number | null;
    repairWorkActionId?: number | null;
    targetPartNameId?: string | null;
    relatedWorkLineItemId?: number | null;
    itemNameSnapshot: string;
    estimateDisplayNameSnapshot?: string | null;
    b2bDisplayNameSnapshot?: string | null;
    b2cDisplayNameSnapshot?: string | null;
    gradeNameSnapshot?: string | null;
    notesForCustomerSnapshot?: string | null;
    detailLabelSnapshot?: string | null;
    categoryNameSnapshot?: string | null;
    targetPartNameSnapshot?: string | null;
    actionNameSnapshot?: string | null;
    quantity?: number | null;
    unitPrice?: number | null;
    showPriceB2b?: boolean;
    showPriceB2c?: boolean;
    sortOrder?: number | null;
    internalMemo?: string | null;
    customerMemo?: string | null;
    publicMemo?: string | null;
};

export type EstimateItemLikeInput = {
    type?: string | null;
    category?: string | null;
    itemName?: string | null;
    name?: string | null;
    unitPrice?: number | string | null;
    price?: number | string | null;
    quantity?: number | string | null;
    partsMasterId?: number | string | null;
    pricingRuleId?: number | string | null;
    repairWorkCategoryId?: number | string | null;
    repairWorkActionId?: number | string | null;
    targetPartNameId?: string | null;
    relatedWorkLineItemId?: number | string | null;
    sortOrder?: number | string | null;
    estimateDisplayNameSnapshot?: string | null;
    b2bDisplayNameSnapshot?: string | null;
    b2cDisplayNameSnapshot?: string | null;
    gradeNameSnapshot?: string | null;
    grade?: string | null;
    notesForCustomerSnapshot?: string | null;
    note2?: string | null;
    notes2?: string | null;
    detailLabelSnapshot?: string | null;
    categoryNameSnapshot?: string | null;
    targetPartNameSnapshot?: string | null;
    actionNameSnapshot?: string | null;
    showPriceB2b?: boolean | null;
    showPriceB2c?: boolean | null;
    internalMemo?: string | null;
    customerMemo?: string | null;
    publicMemo?: string | null;
};

export type NormalizedRepairLineItemInput = {
    lineType: RepairLineItemType;
    sourceCategory?: string | null;
    partsMasterId: number | null;
    pricingRuleId: number | null;
    repairWorkCategoryId: number | null;
    repairWorkActionId: number | null;
    targetPartNameId: string | null;
    relatedWorkLineItemId: number | null;
    itemNameSnapshot: string;
    estimateDisplayNameSnapshot: string;
    b2bDisplayNameSnapshot: string;
    b2cDisplayNameSnapshot: string;
    gradeNameSnapshot: string | null;
    notesForCustomerSnapshot: string | null;
    detailLabelSnapshot: string | null;
    categoryNameSnapshot: string | null;
    targetPartNameSnapshot: string | null;
    actionNameSnapshot: string | null;
    quantity: number;
    unitPrice: number;
    amount: number;
    showPriceB2b: boolean;
    showPriceB2c: boolean;
    sortOrder: number;
    internalMemo: string | null;
    customerMemo: string | null;
    publicMemo: string | null;
};

const allowedLineTypes = new Set<RepairLineItemType>(["LABOR", "PART"]);

function cleanText(value?: string | null): string | null {
    const normalized = (value ?? "").replace(/\s+/g, " ").trim();
    return normalized || null;
}

function normalizePositiveInt(value: number | null | undefined, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    const integer = Math.floor(Number(value));
    return integer > 0 ? integer : fallback;
}

function normalizeNonNegativeInt(value: number | null | undefined): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(Number(value)));
}

function normalizeNullablePositiveInt(value: number | null | undefined): number | null {
    if (!Number.isFinite(value)) return null;
    const integer = Math.floor(Number(value));
    return integer > 0 ? integer : null;
}

function parseNullableNumber(value?: number | string | null): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
}

function toRepairLineItemType(value?: string | null): RepairLineItemType {
    const normalized = cleanText(value)?.toLowerCase();
    if (normalized === "labor") return "LABOR";
    if (normalized === "part") return "PART";
    throw new Error("type must be labor or part.");
}

function assertRepairId(repairId: number): void {
    if (!Number.isInteger(repairId) || repairId <= 0) {
        throw new Error("repairId must be a positive integer.");
    }
}

export function calculateLineAmount(quantity: number, unitPrice: number): number {
    const normalizedQuantity = normalizePositiveInt(quantity, 1);
    const normalizedUnitPrice = normalizeNonNegativeInt(unitPrice);
    return normalizedQuantity * normalizedUnitPrice;
}

export function normalizeRepairLineItemInput(
    input: RepairLineItemInput,
    fallbackSortOrder = 0
): NormalizedRepairLineItemInput {
    if (!allowedLineTypes.has(input.lineType)) {
        throw new Error("lineType must be LABOR or PART.");
    }

    const itemNameSnapshot = cleanText(input.itemNameSnapshot);
    if (!itemNameSnapshot) {
        throw new Error("itemNameSnapshot is required.");
    }

    const estimateDisplayNameSnapshot =
        cleanText(input.estimateDisplayNameSnapshot) ?? itemNameSnapshot;
    const b2bDisplayNameSnapshot =
        cleanText(input.b2bDisplayNameSnapshot) ?? estimateDisplayNameSnapshot;
    const b2cDisplayNameSnapshot =
        cleanText(input.b2cDisplayNameSnapshot) ?? estimateDisplayNameSnapshot;

    const quantity = normalizePositiveInt(input.quantity, 1);
    const unitPrice = normalizeNonNegativeInt(input.unitPrice);

    return {
        lineType: input.lineType,
        sourceCategory: cleanText(input.sourceCategory),
        partsMasterId: normalizeNullablePositiveInt(input.partsMasterId),
        pricingRuleId: normalizeNullablePositiveInt(input.pricingRuleId),
        repairWorkCategoryId: normalizeNullablePositiveInt(input.repairWorkCategoryId),
        repairWorkActionId: normalizeNullablePositiveInt(input.repairWorkActionId),
        targetPartNameId: cleanText(input.targetPartNameId),
        relatedWorkLineItemId: normalizeNullablePositiveInt(input.relatedWorkLineItemId),
        itemNameSnapshot,
        estimateDisplayNameSnapshot,
        b2bDisplayNameSnapshot,
        b2cDisplayNameSnapshot,
        gradeNameSnapshot: cleanText(input.gradeNameSnapshot),
        notesForCustomerSnapshot: cleanText(input.notesForCustomerSnapshot),
        detailLabelSnapshot: cleanText(input.detailLabelSnapshot),
        categoryNameSnapshot: cleanText(input.categoryNameSnapshot),
        targetPartNameSnapshot: cleanText(input.targetPartNameSnapshot),
        actionNameSnapshot: cleanText(input.actionNameSnapshot),
        quantity,
        unitPrice,
        amount: calculateLineAmount(quantity, unitPrice),
        showPriceB2b: input.showPriceB2b ?? false,
        showPriceB2c: input.showPriceB2c ?? false,
        sortOrder: normalizeNonNegativeInt(input.sortOrder ?? fallbackSortOrder),
        internalMemo: cleanText(input.internalMemo),
        customerMemo: cleanText(input.customerMemo),
        publicMemo: cleanText(input.publicMemo),
    };
}

export function estimateItemLikeToRepairLineItemInput(
    item: EstimateItemLikeInput,
    fallbackSortOrder = 0
): RepairLineItemInput {
    const itemNameSnapshot = cleanText(item.itemName) ?? cleanText(item.name);
    if (!itemNameSnapshot) {
        throw new Error("itemName or name is required.");
    }

    const unitPrice = parseNullableNumber(item.unitPrice) ?? parseNullableNumber(item.price);

    const input: RepairLineItemInput = {
        lineType: toRepairLineItemType(item.type),
        sourceCategory: cleanText(item.category),
        partsMasterId: parseNullableNumber(item.partsMasterId),
        pricingRuleId: parseNullableNumber(item.pricingRuleId),
        repairWorkCategoryId: parseNullableNumber(item.repairWorkCategoryId),
        repairWorkActionId: parseNullableNumber(item.repairWorkActionId),
        targetPartNameId: cleanText(item.targetPartNameId),
        relatedWorkLineItemId: parseNullableNumber(item.relatedWorkLineItemId),
        itemNameSnapshot,
        estimateDisplayNameSnapshot:
            cleanText(item.estimateDisplayNameSnapshot) ?? itemNameSnapshot,
        b2bDisplayNameSnapshot:
            cleanText(item.b2bDisplayNameSnapshot) ?? itemNameSnapshot,
        b2cDisplayNameSnapshot:
            cleanText(item.b2cDisplayNameSnapshot) ?? itemNameSnapshot,
        gradeNameSnapshot: cleanText(item.gradeNameSnapshot) ?? cleanText(item.grade),
        notesForCustomerSnapshot:
            cleanText(item.notesForCustomerSnapshot) ??
            cleanText(item.note2) ??
            cleanText(item.notes2),
        detailLabelSnapshot: cleanText(item.detailLabelSnapshot),
        categoryNameSnapshot: cleanText(item.categoryNameSnapshot),
        targetPartNameSnapshot: cleanText(item.targetPartNameSnapshot),
        actionNameSnapshot: cleanText(item.actionNameSnapshot),
        quantity: parseNullableNumber(item.quantity),
        unitPrice,
        showPriceB2b: item.showPriceB2b ?? false,
        showPriceB2c: item.showPriceB2c ?? false,
        sortOrder: parseNullableNumber(item.sortOrder) ?? fallbackSortOrder,
        internalMemo: cleanText(item.internalMemo),
        customerMemo: cleanText(item.customerMemo),
        publicMemo: cleanText(item.publicMemo),
    };

    return normalizeRepairLineItemInput(input, fallbackSortOrder);
}

export function estimateItemsLikeToRepairLineItemInputs(
    items: EstimateItemLikeInput[]
): RepairLineItemInput[] {
    return items.map((item, index) =>
        estimateItemLikeToRepairLineItemInput(item, index)
    );
}

function toCreateInput(
    repairId: number,
    input: NormalizedRepairLineItemInput
): Prisma.RepairLineItemCreateManyInput {
    return {
        repairId,
        lineType: input.lineType,
        partsMasterId: input.partsMasterId,
        pricingRuleId: input.pricingRuleId,
        repairWorkCategoryId: input.repairWorkCategoryId,
        repairWorkActionId: input.repairWorkActionId,
        targetPartNameId: input.targetPartNameId,
        relatedWorkLineItemId: input.relatedWorkLineItemId,
        itemNameSnapshot: input.itemNameSnapshot,
        estimateDisplayNameSnapshot: input.estimateDisplayNameSnapshot,
        b2bDisplayNameSnapshot: input.b2bDisplayNameSnapshot,
        b2cDisplayNameSnapshot: input.b2cDisplayNameSnapshot,
        gradeNameSnapshot: input.gradeNameSnapshot,
        notesForCustomerSnapshot: input.notesForCustomerSnapshot,
        detailLabelSnapshot: input.detailLabelSnapshot,
        categoryNameSnapshot: input.categoryNameSnapshot,
        targetPartNameSnapshot: input.targetPartNameSnapshot,
        actionNameSnapshot: input.actionNameSnapshot,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        amount: input.amount,
        showPriceB2b: input.showPriceB2b,
        showPriceB2c: input.showPriceB2c,
        sortOrder: input.sortOrder,
        internalMemo: input.internalMemo,
        customerMemo: input.customerMemo,
        publicMemo: input.publicMemo,
    };
}

export async function getRepairLineItems(repairId: number, db: DbLike = prisma) {
    assertRepairId(repairId);

    return db.repairLineItem.findMany({
        where: { repairId },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
            partsMaster: {
                select: {
                    id: true,
                    nameJp: true,
                    grade: true,
                    notes2: true,
                },
            },
            pricingRule: {
                select: {
                    id: true,
                    suggestedWorkName: true,
                    minPrice: true,
                    maxPrice: true,
                },
            },
            relatedWorkLineItem: {
                select: {
                    id: true,
                    lineType: true,
                    itemNameSnapshot: true,
                    estimateDisplayNameSnapshot: true,
                },
            },
        },
    });
}

export async function createRepairLineItems(
    repairId: number,
    items: RepairLineItemInput[],
    db?: Prisma.TransactionClient
) {
    assertRepairId(repairId);

    if (db) {
        return createRepairLineItemsWithClient(db, repairId, items);
    }

    return prisma.$transaction((tx) =>
        createRepairLineItemsWithClient(tx, repairId, items)
    );
}

async function createRepairLineItemsWithClient(
    db: DbLike,
    repairId: number,
    items: RepairLineItemInput[]
) {
    if (items.length === 0) return { count: 0 };

    const data = items.map((item, index) =>
        toCreateInput(repairId, normalizeRepairLineItemInput(item, index))
    );

    return db.repairLineItem.createMany({ data });
}

export async function replaceRepairLineItems(
    repairId: number,
    items: RepairLineItemInput[],
    db?: Prisma.TransactionClient
) {
    assertRepairId(repairId);

    if (db) {
        return replaceRepairLineItemsWithClient(db, repairId, items);
    }

    return prisma.$transaction((tx) =>
        replaceRepairLineItemsWithClient(tx, repairId, items)
    );
}

async function replaceRepairLineItemsWithClient(
    db: DbLike,
    repairId: number,
    items: RepairLineItemInput[]
) {
    await db.repairLineItem.deleteMany({ where: { repairId } });

    if (items.length === 0) {
        return { count: 0 };
    }

    const data = items.map((item, index) =>
        toCreateInput(repairId, normalizeRepairLineItemInput(item, index))
    );

    // replace方式ではidが再採番されるため、同一replace内で新規作成される
    // LABOR行へのrelatedWorkLineItemId紐づけはまだ扱わない。
    return db.repairLineItem.createMany({ data });
}
