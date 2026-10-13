import type { PartInputType } from "@/lib/part-input-options";

export type AddItemCategory = "internal" | "external_labor" | "part_external";

export function getNewItemClassification(category: AddItemCategory, partInputType: PartInputType) {
    if (category !== "part_external") return { category };
    return partInputType === "part_internal"
        ? { category: "part_internal" as const, partType: "interior" as const }
        : { category: "part_external" as const, partType: "exterior" as const };
}
