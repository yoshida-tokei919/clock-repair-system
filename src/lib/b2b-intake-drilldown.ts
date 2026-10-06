import { normalizeMasterName } from "@/lib/master-normalize";

export type IntakeWatchFields = { brandId: string; model: string; ref: string; caliber: string };
export type ModelChoice = { id: number; name: string; nameJp: string; nameEn: string | null };
export type RefChoice = { name: string; caliber: { name: string } | null };
export type CaliberChoice = { name: string };

export const modelCacheKey = (brandId: number, modelId: number) => `${brandId}:${modelId}`;

export function matchingModel(models: ModelChoice[], name: string) {
  const normalized = normalizeMasterName(name);
  return normalized ? models.find((model) =>
    [model.name, model.nameJp, model.nameEn].some((value) => normalizeMasterName(value) === normalized)
  ) : undefined;
}

export function changeBrand<T extends IntakeWatchFields>(row: T, brandId: string): T {
  return { ...row, brandId, model: "", ref: "", caliber: "" };
}

export function changeModel<T extends IntakeWatchFields>(row: T, model: string): T {
  return { ...row, model, ref: "", caliber: "" };
}

export function changeRef<T extends IntakeWatchFields>(row: T, ref: string, refs: RefChoice[]): T {
  const selected = refs.find((option) => normalizeMasterName(option.name) === normalizeMasterName(ref));
  return { ...row, ref, caliber: selected?.caliber?.name ?? "" };
}

export function optionsForRow(
  row: IntakeWatchFields,
  modelsByBrand: Record<number, ModelChoice[]>,
  refsByModel: Record<string, RefChoice[]>,
  calibersByBrand: Record<number, CaliberChoice[]>,
  calibersByModel: Record<string, CaliberChoice[]>,
) {
  const brandId = Number(row.brandId);
  const models = modelsByBrand[brandId] ?? [];
  const model = matchingModel(models, row.model);
  const key = model ? modelCacheKey(brandId, model.id) : "";
  const refs = refsByModel[key] ?? [];
  const modelCalibers = calibersByModel[key] ?? [];
  const calibers = modelCalibers.length ? modelCalibers : calibersByBrand[brandId] ?? [];
  return { models, model, refs, calibers };
}
