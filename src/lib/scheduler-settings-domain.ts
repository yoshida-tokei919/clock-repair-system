import type { RepairWorkType, SchedulerActivitySetting, SchedulerSetting, WatchDriveType, WorkTimeActivityType } from "@prisma/client";

export const ACTIVITY_TYPES = ["ESTIMATE", "INTAKE", "INQUIRY", "CUSTOMER_CONTACT", "PARTS_ORDER", "SHIPPING", "ADMIN", "OTHER"] as const;
export const AUTO_ACTIVITY_TYPES = ["ESTIMATE", "INQUIRY", "PARTS_ORDER"] as const;
export type ActivityType = typeof ACTIVITY_TYPES[number];

export class SettingsError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SettingsError("入力形式が正しくありません。");
  return value as Record<string, unknown>;
}
function integer(value: unknown, field: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    throw new SettingsError(`${field} は ${min}〜${max} の整数で入力してください。`);
  return value;
}
function choice<T extends string>(value: unknown, field: string, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new SettingsError(`${field} が正しくありません。`);
  return value as T;
}
function nullableInteger(value: unknown, field: string, min: number, max = Number.MAX_SAFE_INTEGER): number | null {
  return value === null ? null : integer(value, field, min, max);
}
function nullableId(value: unknown, field: string): number | null {
  return value === null ? null : integer(value, field, 1);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value)))
    throw new SettingsError("入力項目が不足しているか、未対応の項目が含まれています。");
}

export type SchedulerInput = Pick<SchedulerSetting,
  "standardDailyMinutes" | "dailyScheduleReviewMinutes" | "repairLearningMode" |
  "repairLearningMinimumSamples" | "repairFullSampleThreshold" | "repairEarlyAggregationMethod" |
  "defaultAggregationMethod" | "repairLookbackMonths" | "repairOutlierMethod">;
export function parseSchedulerInput(value: unknown): SchedulerInput {
  const v = object(value);
  exactKeys(v, ["standardDailyMinutes", "dailyScheduleReviewMinutes", "repairLearningMode",
    "repairLearningMinimumSamples", "repairFullSampleThreshold", "repairEarlyAggregationMethod",
    "defaultAggregationMethod", "repairLookbackMonths", "repairOutlierMethod"]);
  const standardDailyMinutes = integer(v.standardDailyMinutes, "標準1日作業時間", 1, 1440);
  const dailyScheduleReviewMinutes = integer(v.dailyScheduleReviewMinutes, "予定確認時間", 0, standardDailyMinutes);
  const repairLearningMinimumSamples = integer(v.repairLearningMinimumSamples, "修理の最低サンプル数", 1);
  const repairFullSampleThreshold = integer(v.repairFullSampleThreshold, "修理の十分なサンプル数", repairLearningMinimumSamples);
  return { standardDailyMinutes, dailyScheduleReviewMinutes, repairLearningMinimumSamples, repairFullSampleThreshold,
    repairLearningMode: choice(v.repairLearningMode, "修理の学習モード", ["MANUAL", "AUTO"]),
    repairEarlyAggregationMethod: choice(v.repairEarlyAggregationMethod, "少数実績の集計", ["MEAN", "MEDIAN", "P80"]),
    defaultAggregationMethod: choice(v.defaultAggregationMethod, "十分な実績の集計", ["MEAN", "MEDIAN", "P80"]),
    repairLookbackMonths: integer(v.repairLookbackMonths, "修理の集計期間", 1, 120),
    repairOutlierMethod: choice(v.repairOutlierMethod, "外れ値処理", ["NONE", "IQR"]),
  };
}

export type ActivityInput = Pick<SchedulerActivitySetting,
  "activityType" | "manualStandardMinutes" | "dailyReservedMinutes" | "learningMode" |
  "aggregationMethod" | "lookbackMonths" | "fallbackLookbackMonths" | "minimumSamples">;
export function parseActivityInput(value: unknown): ActivityInput {
  const v = object(value);
  exactKeys(v, ["activityType", "manualStandardMinutes", "dailyReservedMinutes", "learningMode",
    "aggregationMethod", "lookbackMonths", "fallbackLookbackMonths", "minimumSamples"]);
  const activityType = choice(v.activityType, "業務区分", ACTIVITY_TYPES) as WorkTimeActivityType;
  const learningMode = choice(v.learningMode, "学習モード", ["MANUAL", "AUTO"]);
  if (learningMode === "AUTO" && !AUTO_ACTIVITY_TYPES.some(type => type === activityType))
    throw new SettingsError("この業務区分はAUTO学習に対応していません。");
  const lookbackMonths = integer(v.lookbackMonths, "集計期間", 1, 120);
  const fallbackLookbackMonths = nullableInteger(v.fallbackLookbackMonths, "代替集計期間", lookbackMonths, 120);
  return { activityType, learningMode, lookbackMonths, fallbackLookbackMonths,
    manualStandardMinutes: nullableInteger(v.manualStandardMinutes, "手動標準時間", 1),
    dailyReservedMinutes: integer(v.dailyReservedMinutes, "日次予約時間", 0, 1440),
    aggregationMethod: choice(v.aggregationMethod, "集計方法", ["MEAN", "MEDIAN", "P80"]),
    minimumSamples: integer(v.minimumSamples, "最低サンプル数", 1),
  };
}

export type StandardInput = {
  repairType: RepairWorkType; categoryId: number; targetPartNameId: string | null;
  actionId: number | null; detailLabel: string | null; driveType: WatchDriveType | null;
  standardMinutes: number;
};
export function parseStandardInput(value: unknown): StandardInput {
  const v = object(value);
  exactKeys(v, ["repairType", "categoryId", "targetPartNameId", "actionId", "detailLabel", "driveType", "standardMinutes"]);
  const repairType = choice(v.repairType, "内外装", ["INTERNAL", "EXTERNAL"]);
  const targetPartNameId = v.targetPartNameId === null ? null :
    typeof v.targetPartNameId === "string" && v.targetPartNameId.length > 0 ? v.targetPartNameId :
    (() => { throw new SettingsError("対象部品IDが正しくありません。"); })();
  const detailLabel = v.detailLabel === null ? null :
    typeof v.detailLabel === "string" ? v.detailLabel.trim() || null :
    (() => { throw new SettingsError("詳細ラベルが正しくありません。"); })();
  const driveType = v.driveType === null ? null : choice(v.driveType, "駆動方式", ["QUARTZ", "MECHANICAL", "UNKNOWN"]);
  if (repairType === "EXTERNAL" && driveType !== null) throw new SettingsError("外装の駆動方式は指定できません。");
  return { repairType, categoryId: integer(v.categoryId, "作業カテゴリID", 1), targetPartNameId,
    actionId: nullableId(v.actionId, "処置ID"), detailLabel, driveType,
    standardMinutes: integer(v.standardMinutes, "標準作業時間", 1) };
}

export function assertSettingsRows(setting: unknown, activities: readonly { activityType: WorkTimeActivityType }[]) {
  if (!setting) throw new SettingsError("SchedulerSetting(id=1) がありません。管理者によるデータ復旧が必要です。", 409);
  const existing = new Set(activities.map(row => row.activityType));
  const missing = ACTIVITY_TYPES.filter(type => !existing.has(type));
  if (missing.length) throw new SettingsError(`SchedulerActivitySetting の行がありません: ${missing.join(", ")}`, 409);
}
