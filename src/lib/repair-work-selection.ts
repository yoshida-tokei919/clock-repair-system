import { getTargetPartKeysForRepairWorkCategory } from "@/lib/repair-work-target-part-filter";

export const INTERNAL_REPAIR_WORK_ACTION_KEYS = new Set([
  "exchange", "repair", "adjust", "correction", "polish", "clean", "oil", "make",
  "install", "remove", "hole_tightening", "staking", "overhaul", "inspection",
]);
export const EXTERNAL_REPAIR_WORK_ACTION_KEYS = new Set([
  "exchange", "install", "repair", "correction", "adjust", "processing", "make",
  "bonding", "polish", "finishing", "light_finishing", "clean", "inspection",
  "painting", "rust_removal", "drying", "remove", "welding", "brazing",
]);

export function isRepairWorkActionApplicable(repairType: "INTERNAL" | "EXTERNAL", key: string) {
  return (repairType === "INTERNAL" ? INTERNAL_REPAIR_WORK_ACTION_KEYS : EXTERNAL_REPAIR_WORK_ACTION_KEYS).has(key);
}

export function isRepairWorkTargetPartApplicable(
  repairType: "INTERNAL" | "EXTERNAL", categoryKey: string,
  part: { key: string; partType: string | null; categoryKey: string | null },
) {
  const allowedPartTypes = repairType === "INTERNAL"
    ? ["part_internal", "internal", "interior"]
    : ["part_external", "external", "exterior"];
  if (part.partType ? !allowedPartTypes.includes(part.partType) : repairType === "EXTERNAL") return false;
  const keys = getTargetPartKeysForRepairWorkCategory(categoryKey);
  if (keys) return keys.includes(part.key);
  return repairType === "EXTERNAL" && part.categoryKey === categoryKey;
}
