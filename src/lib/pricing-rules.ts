import type { Prisma } from "@prisma/client";
import type { RepairLineItemInput } from "@/lib/repair-line-items";

type DbLike = Prisma.TransactionClient;

type SyncPricingRulesParams = {
    brandId: number | null;
    modelId?: number | null;
    caliberId?: number | null;
    customerType?: string | null;
    items: RepairLineItemInput[];
};

function normalizeNullablePositiveInt(value?: number | null): number | null {
    if (!Number.isFinite(value)) return null;
    const integer = Math.floor(Number(value));
    return integer > 0 ? integer : null;
}

function cleanText(value?: string | null): string | null {
    const normalized = (value ?? "").replace(/\s+/g, " ").trim();
    return normalized || null;
}

function normalizeCustomerType(value?: string | null): "business" | "individual" | null {
    const normalized = cleanText(value)?.toLowerCase();
    if (normalized === "business" || normalized === "b2b") return "business";
    if (normalized === "individual" || normalized === "b2c") return "individual";
    return null;
}

function normalizePrice(value?: number | null): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(Number(value)));
}

function buildPricingRuleIdentity(params: {
    brandId: number;
    modelId: number | null;
    caliberId: number | null;
    customerType: string | null;
    suggestedWorkName: string;
    minPrice: number;
    maxPrice: number;
    repairWorkCategoryId: number | null;
    targetPartNameId: string | null;
    repairWorkActionId: number | null;
    detailLabel: string | null;
}): Prisma.PricingRuleWhereInput {
    return {
        brandId: params.brandId,
        modelId: params.modelId,
        caliberId: params.caliberId,
        customerType: params.customerType,
        repairWorkNameId: null,
        suggestedWorkName: params.suggestedWorkName,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        repairWorkCategoryId: params.repairWorkCategoryId,
        targetPartNameId: params.targetPartNameId,
        repairWorkActionId: params.repairWorkActionId,
        detailLabel: params.detailLabel,
    };
}

function buildLegacyPricingRuleIdentity(params: {
    brandId: number;
    modelId: number | null;
    caliberId: number | null;
    customerType: string | null;
    suggestedWorkName: string;
    minPrice: number;
    maxPrice: number;
}): Prisma.PricingRuleWhereInput {
    return {
        brandId: params.brandId,
        modelId: params.modelId,
        caliberId: params.caliberId,
        customerType: params.customerType,
        repairWorkNameId: null,
        suggestedWorkName: params.suggestedWorkName,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        repairWorkCategoryId: null,
        targetPartNameId: null,
        repairWorkActionId: null,
        detailLabel: null,
    };
}

export async function syncPricingRulesFromRepairLineItems(
    db: DbLike,
    params: SyncPricingRulesParams
) {
    const brandId = normalizeNullablePositiveInt(params.brandId);
    if (!brandId) return { created: 0, updated: 0, skipped: params.items.length };

    const modelId = normalizeNullablePositiveInt(params.modelId);
    const caliberId = normalizeNullablePositiveInt(params.caliberId);
    const customerType = normalizeCustomerType(params.customerType);
    if (!customerType) {
        throw new Error("customerType is required to sync pricing rules.");
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of params.items) {
        if (item.lineType !== "LABOR") {
            skipped += 1;
            continue;
        }

        const suggestedWorkName = cleanText(item.itemNameSnapshot);
        if (!suggestedWorkName) {
            skipped += 1;
            continue;
        }

        const price = normalizePrice(item.unitPrice);
        const repairWorkCategoryId = normalizeNullablePositiveInt(item.repairWorkCategoryId);
        const targetPartNameId = cleanText(item.targetPartNameId);
        const repairWorkActionId = normalizeNullablePositiveInt(item.repairWorkActionId);
        const detailLabel = cleanText(item.detailLabelSnapshot);
        const pricingRuleId = normalizeNullablePositiveInt(item.pricingRuleId);

        const updateData: Prisma.PricingRuleUncheckedUpdateInput = {
            brandId,
            modelId,
            caliberId,
            customerType,
            suggestedWorkName,
            minPrice: price,
            maxPrice: price,
            repairWorkNameId: null,
            repairWorkCategoryId,
            targetPartNameId,
            repairWorkActionId,
            detailLabel,
        };
        const createData: Prisma.PricingRuleUncheckedCreateInput = {
            ...updateData,
            repairWorkNameId: null,
        } as Prisma.PricingRuleUncheckedCreateInput;

        if (pricingRuleId) {
            const existingById = await db.pricingRule.findUnique({
                where: { id: pricingRuleId },
                select: {
                    id: true,
                    customerType: true,
                    minPrice: true,
                    maxPrice: true,
                },
            });

            if (
                existingById
                && normalizeCustomerType(existingById.customerType) === customerType
                && normalizePrice(existingById.minPrice) === price
                && normalizePrice(existingById.maxPrice) === price
            ) {
                await db.pricingRule.update({
                    where: { id: pricingRuleId },
                    data: updateData,
                });
                updated += 1;
                continue;
            }
        }

        const exactRule = await db.pricingRule.findFirst({
            where: buildPricingRuleIdentity({
                brandId,
                modelId,
                caliberId,
                customerType,
                suggestedWorkName,
                minPrice: price,
                maxPrice: price,
                repairWorkCategoryId,
                targetPartNameId,
                repairWorkActionId,
                detailLabel,
            }),
            select: { id: true },
            orderBy: { id: "asc" },
        });

        if (exactRule) {
            await db.pricingRule.update({
                where: { id: exactRule.id },
                data: {
                    minPrice: price,
                    maxPrice: price,
                },
            });
            updated += 1;
            continue;
        }

        const legacyRule = await db.pricingRule.findFirst({
            where: buildLegacyPricingRuleIdentity({
                brandId,
                modelId,
                caliberId,
                customerType,
                suggestedWorkName,
                minPrice: price,
                maxPrice: price,
            }),
            select: { id: true },
            orderBy: { id: "asc" },
        });

        if (legacyRule) {
                await db.pricingRule.update({
                where: { id: legacyRule.id },
                data: updateData,
            });
            updated += 1;
            continue;
        }

        await db.pricingRule.create({ data: createData });
        created += 1;
    }

    return { created, updated, skipped };
}
