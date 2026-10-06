import { matchesBrandSearch, normalizeMasterName } from "@/lib/master-normalize";

export type IntakeWatchFields = { brandId: string; model: string; ref: string; caliber: string };
export type ModelChoice = { id: number; name: string; nameJp: string; nameEn: string | null };
export type RefChoice = { name: string; caliber: { name: string } | null };
export type CaliberChoice = { name: string };
export type SearchChoice = { value: string; label: string; searchKeys?: Array<string | null | undefined>; id?: number };

export function filterIntakeChoices<T extends SearchChoice>(choices: T[], query: string): T[] {
  if (!query.trim()) return choices;
  return choices.filter((choice) => matchesBrandSearch(query,
    [choice.value, choice.label, ...(choice.searchKeys ?? [])]));
}

export function nextIntakeChoiceIndex(current: number, direction: "ArrowDown" | "ArrowUp", count: number): number {
  if (count === 0) return -1;
  if (direction === "ArrowDown") return current < count - 1 ? current + 1 : 0;
  return current <= 0 ? count - 1 : current - 1;
}

export type IntakeComboboxState = { open: boolean; activeIndex: number };

export function intakeComboboxKeyDecision(state: IntakeComboboxState, key: string, count: number): {
  state: IntakeComboboxState; selectedIndex: number | null;
} {
  if (key === "Escape") return { state: { open: false, activeIndex: -1 }, selectedIndex: null };
  if (key === "ArrowDown" || key === "ArrowUp") return {
    state: { open: true, activeIndex: nextIntakeChoiceIndex(state.activeIndex, key, count) }, selectedIndex: null,
  };
  return { state, selectedIndex: key === "Enter" && state.open && state.activeIndex >= 0 && state.activeIndex < count
    ? state.activeIndex : null };
}

export function shouldPreventB2bBatchEnter(key: string, tagName: string, isComposing: boolean): boolean {
  return key === "Enter" && tagName === "INPUT" && !isComposing;
}

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
