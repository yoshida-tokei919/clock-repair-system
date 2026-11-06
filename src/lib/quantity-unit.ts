export const QUANTITY_UNITS = ["か所", "本", "個", "式", "回"] as const;

export function normalizeQuantityUnit(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("数量単位が正しくありません。");
  const unit = value.trim();
  if (!unit) return null;
  if (unit.length > 20 || /[\r\n\t]/.test(unit)) throw new Error("数量単位は20文字以内で入力してください。");
  return unit;
}

export function formatQuantity(quantity: number, unit?: string | null): string {
  return `${quantity}${unit ?? ""}`;
}
