export class ProcurementSettingsError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new ProcurementSettingsError("入力形式が正しくありません。");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key)))
    throw new ProcurementSettingsError("入力項目が不足しているか、未対応の項目が含まれています。");
}

export function parseProcurementId(value: string, label: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new ProcurementSettingsError(`${label}が正しくありません。`);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id > 2147483647) throw new ProcurementSettingsError(`${label}が正しくありません。`);
  return id;
}

function leadDays(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 2147483647)
    throw new ProcurementSettingsError(`${label}は0以上の整数または未設定で入力してください。`);
  return value;
}

function optionalText(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new ProcurementSettingsError(`${label}が正しくありません。`);
  return value.trim() || null;
}

export function parseSupplierLeadTimeInput(value: unknown) {
  const input = record(value);
  exactKeys(input, ["manualProcessingLeadDays"]);
  return { manualProcessingLeadDays: leadDays(input.manualProcessingLeadDays, "仕入先処理日数") };
}

export function parseShippingMethodInput(value: unknown) {
  const input = record(value);
  exactKeys(input, ["name", "carrierName", "manualTransitLeadDays", "isActive", "notes"]);
  if (typeof input.name !== "string" || !input.name.trim())
    throw new ProcurementSettingsError("配送方法名を入力してください。");
  if (typeof input.isActive !== "boolean") throw new ProcurementSettingsError("有効状態が正しくありません。");
  return {
    name: input.name.trim(),
    carrierName: optionalText(input.carrierName, "配送会社名"),
    manualTransitLeadDays: leadDays(input.manualTransitLeadDays, "輸送日数"),
    isActive: input.isActive,
    notes: optionalText(input.notes, "メモ"),
  };
}
