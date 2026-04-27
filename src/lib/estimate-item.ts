type NullableText = string | null | undefined;

type PartSource = {
    id?: number | null;
    partId?: number | null;
    partsMasterId?: number | null;
    name?: NullableText;
    nameJp?: NullableText;
    itemName?: NullableText;
    retailPrice?: number | null;
    unitPrice?: number | null;
    price?: number | null;
    latestCostYen?: number | null;
    cost?: number | null;
    grade?: NullableText;
    note1?: NullableText;
    notes1?: NullableText;
    note2?: NullableText;
    notes2?: NullableText;
    partRef?: NullableText;
    partRefs?: NullableText;
    cousinsNumber?: NullableText;
    stockQuantity?: number | null;
    supplierName?: NullableText;
    supplier?: { name?: NullableText } | null;
    partType?: NullableText;
};

type EstimateItemCore = {
    partsMasterId: number | null;
    name: string;
    price: number;
    cost?: number;
    grade?: string;
    note1?: string;
    note2?: string;
    partRef?: string;
    cousinsNumber?: string;
    stockQuantity?: number;
    supplierName?: string;
    partType?: string;
};

type EstimateItemOverrides = Partial<EstimateItemCore> & Record<string, unknown>;

const cleanText = (value: NullableText): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const asNumber = (value: unknown): number | undefined => {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

export function createEstimateItemFromPart<T extends EstimateItemOverrides = EstimateItemOverrides>(
    part: PartSource,
    overrides?: T
): EstimateItemCore & T {
    const base: EstimateItemCore = {
        partsMasterId:
            asNumber(part.partsMasterId) ??
            asNumber(part.partId) ??
            asNumber(part.id) ??
            null,
        name:
            cleanText(part.name) ??
            cleanText(part.nameJp) ??
            cleanText(part.itemName) ??
            "",
        price:
            asNumber(part.price) ??
            asNumber(part.retailPrice) ??
            asNumber(part.unitPrice) ??
            0,
        cost:
            asNumber(part.cost) ??
            asNumber(part.latestCostYen),
        grade: cleanText(part.grade),
        note1: cleanText(part.note1) ?? cleanText(part.notes1),
        note2: cleanText(part.note2) ?? cleanText(part.notes2),
        partRef: cleanText(part.partRef) ?? cleanText(part.partRefs),
        cousinsNumber: cleanText(part.cousinsNumber),
        stockQuantity: asNumber(part.stockQuantity),
        supplierName:
            cleanText(part.supplierName) ??
            cleanText(part.supplier?.name),
        partType: cleanText(part.partType),
    };

    return {
        ...base,
        ...(overrides ?? ({} as T)),
    };
}
