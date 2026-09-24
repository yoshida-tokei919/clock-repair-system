import type { Prisma, PrismaClient } from "@prisma/client";
import { hasCompleteInternalPartContext, matchesExteriorPartCandidate, matchesInternalPartCandidate, matchesStandardPartName, type InternalPartContext } from "@/lib/parts-master-compatibility";

type DbLike = PrismaClient | Prisma.TransactionClient;
type PartType = "interior" | "exterior";

type StandardName = {
    id: string;
    isActive: boolean;
    partType: string;
    nameJa: string;
    displayJa: string | null;
    category: { partType: string };
};

type LinkedPart = {
    partType: string | null;
    category: string;
    standardPartNameId: string | null;
    nameJp: string;
    brandId: number | null;
    modelId: number | null;
    watchRefs: string | null;
    movementMakerId: number | null;
    caliberId: number | null;
    baseMakerId: number | null;
    baseCaliberId: number | null;
};

export class RepairPartValidationError extends Error {
    readonly status = 400;
}

// The UI's row id is an EstimateItem id. Only this explicit RepairLineItem id
// can authorize preservation of a previously linked part on PATCH.
export function isExistingRepairPartLink(
    incomingLineId: unknown,
    incomingPartsMasterId: unknown,
    existingLinks: ReadonlyMap<number, number | null>
): boolean {
    const lineId = typeof incomingLineId === "number" ? incomingLineId
        : typeof incomingLineId === "string" && /^[1-9]\d*$/.test(incomingLineId) ? Number(incomingLineId) : NaN;
    const partId = typeof incomingPartsMasterId === "number" ? incomingPartsMasterId
        : typeof incomingPartsMasterId === "string" && /^[1-9]\d*$/.test(incomingPartsMasterId) ? Number(incomingPartsMasterId) : NaN;
    return Number.isSafeInteger(lineId) && lineId > 0
        && Number.isSafeInteger(partId) && partId > 0
        && existingLinks.has(lineId) && existingLinks.get(lineId) === partId;
}

export function getRepairPartType(item: { partType?: unknown; category?: unknown }): PartType {
    const interior = item.partType === "interior" || item.category === "internal" || item.category === "part_internal";
    const exterior = item.partType === "exterior" || item.category === "external" || item.category === "part_external";
    if (interior && exterior) throw new RepairPartValidationError("部品の内装・外装区分が矛盾しています。");
    if (!interior && !exterior) throw new RepairPartValidationError("部品の内装・外装区分を指定してください。");
    return interior ? "interior" : "exterior";
}

export function validateRepairPartStandardName(
    partType: PartType,
    incomingId: unknown,
    selectedName: StandardName | null,
    linkedPart: Pick<LinkedPart, "standardPartNameId" | "nameJp"> | null,
    allowLegacyResave = false
): string | null {
    if (incomingId != null && typeof incomingId !== "string") {
        throw new RepairPartValidationError("標準部品名 ID が不正です。");
    }
    const id = typeof incomingId === "string" ? incomingId.trim() : "";
    if (!id) {
        if (!linkedPart || !allowLegacyResave) throw new RepairPartValidationError("標準部品名を選択してください。");
        return linkedPart.standardPartNameId;
    }

    const allowedTypes = partType === "interior"
        ? ["part_internal", "internal", "interior"]
        : ["part_external", "external", "exterior"];
    if (!selectedName || selectedName.id !== id || !selectedName.isActive
        || !allowedTypes.includes(selectedName.partType)
        || !allowedTypes.includes(selectedName.category.partType)) {
        throw new RepairPartValidationError("有効な部品区分の標準部品名を選択してください。");
    }
    if (linkedPart?.standardPartNameId && linkedPart.standardPartNameId !== id) {
        throw new RepairPartValidationError("既存部品の標準部品名と一致しません。");
    }
    if (linkedPart && !linkedPart.standardPartNameId
        && !matchesStandardPartName(linkedPart, id, selectedName.nameJa, selectedName.displayJa)) {
        throw new RepairPartValidationError("既存部品名と標準部品名が一致しません。");
    }
    return id;
}

export async function validateRepairPartItem(
    db: DbLike,
    incomingId: unknown,
    linkedPart: LinkedPart | null,
    context: { partType: PartType; brandId: number | null; modelId: number | null; currentRefs: string | null; allowLegacyResave?: boolean } & InternalPartContext
): Promise<{ id: string | null; nameJa: string | null; displayJa: string | null }> {
    if (incomingId != null && typeof incomingId !== "string") {
        throw new RepairPartValidationError("標準部品名 ID が不正です。");
    }
    const suppliedId = typeof incomingId === "string" ? incomingId.trim() : "";
    const id = suppliedId || (context.allowLegacyResave ? linkedPart?.standardPartNameId ?? "" : "");
    const selectedName = id ? await db.partNameMaster.findUnique({
        where: { id },
        select: {
            id: true, isActive: true, partType: true, nameJa: true, displayJa: true,
            category: { select: { partType: true } },
        },
    }) : null;
    const standardPartNameId = validateRepairPartStandardName(context.partType, id, selectedName, linkedPart, context.allowLegacyResave);

    if (linkedPart) {
        const markedInterior = linkedPart.partType === "interior" || linkedPart.category === "internal";
        const markedExterior = linkedPart.partType === "exterior" || linkedPart.category === "external";
        if ((context.partType === "exterior" && markedInterior)
            || (context.partType === "interior" && markedExterior)) {
            throw new RepairPartValidationError("部品の内装・外装区分が一致しません。");
        }
        if (context.partType === "exterior" && !matchesExteriorPartCandidate(linkedPart, {
            brandId: context.brandId,
            modelId: context.modelId,
            currentRefs: context.currentRefs,
            standardPartNameId,
            standardPartName: selectedName?.nameJa,
            standardDisplayName: selectedName?.displayJa,
        })) {
            throw new RepairPartValidationError("現在のブランド・Ref・標準部品名に適合しない部品です。");
        }
        if (context.partType === "interior" && (!hasCompleteInternalPartContext(context)
            ? !context.allowLegacyResave
            : !matchesInternalPartCandidate(linkedPart, {
                ...context,
                standardPartNameId,
                standardPartName: selectedName?.nameJa,
                standardDisplayName: selectedName?.displayJa,
            }))) {
            throw new RepairPartValidationError("現在のムーブメントメーカー・Cal・標準部品名に適合しない部品です。");
        }
    }
    return { id: standardPartNameId, nameJa: selectedName?.nameJa ?? null, displayJa: selectedName?.displayJa ?? null };
}
