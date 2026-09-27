import type { PrismaClient } from "@prisma/client";
import { isRepairWorkActionApplicable, isRepairWorkTargetPartApplicable } from "@/lib/repair-work-selection";
import { ACTIVITY_TYPES, SettingsError, type StandardInput, assertSettingsRows } from "@/lib/scheduler-settings-domain";

type Db = PrismaClient;

export async function getSchedulerSettings(db: Db) {
  const [setting, activities, standards, categories, actions, parts] = await Promise.all([
    db.schedulerSetting.findUnique({ where: { id: 1 } }),
    db.schedulerActivitySetting.findMany(),
    db.repairWorkTimeStandard.findMany({ orderBy: [{ repairType: "asc" }, { categoryId: "asc" }, { id: "asc" }] }),
    db.repairWorkCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
      select: { id: true, repairType: true, name: true, displayName: true } }),
    db.repairWorkAction.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
      select: { id: true, name: true, displayName: true } }),
    db.partNameMaster.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { nameJa: "asc" }],
      select: { id: true, key: true, partType: true, nameJa: true, displayJa: true,
        category: { select: { key: true, partType: true, nameJa: true } } } }),
  ]);
  assertSettingsRows(setting, activities);
  return { setting, activities: ACTIVITY_TYPES.map(type => activities.find(row => row.activityType === type)!), standards,
    masters: {
      categories: categories.map(row => ({ id: row.id, repairType: row.repairType, key: row.name, name: row.displayName || row.name })),
      actions: actions.map(row => ({ id: row.id, key: row.name, name: row.displayName || row.name })),
      parts: parts.map(row => ({ id: row.id, key: row.key, partType: row.partType || row.category.partType,
        categoryKey: row.category.key, name: row.displayJa || row.nameJa, categoryName: row.category.nameJa })),
    },
  };
}

export async function validateStandardMasters(db: Db, input: StandardInput) {
  const [category, action, part] = await Promise.all([
    db.repairWorkCategory.findUnique({ where: { id: input.categoryId }, select: { repairType: true, name: true, isActive: true } }),
    input.actionId === null ? null : db.repairWorkAction.findUnique({ where: { id: input.actionId }, select: { name: true, isActive: true } }),
    input.targetPartNameId === null ? null : db.partNameMaster.findUnique({ where: { id: input.targetPartNameId },
      select: { key: true, partType: true, isActive: true, category: { select: { key: true, partType: true } } } }),
  ]);
  if (!category?.isActive || category.repairType !== input.repairType)
    throw new SettingsError("作業カテゴリが存在しないか、内外装区分と一致しません。");
  if (input.actionId !== null && (!action?.isActive || !isRepairWorkActionApplicable(input.repairType, action.name)))
    throw new SettingsError("処置はこの内外装区分で選択できません。");
  if (input.targetPartNameId !== null && (!part?.isActive || !isRepairWorkTargetPartApplicable(input.repairType, category.name,
    { key: part.key, partType: part.partType || part.category.partType, categoryKey: part.category.key })))
    throw new SettingsError("対象部品はこの作業カテゴリで選択できません。");
}

export function standardCondition(input: StandardInput) {
  return { repairType: input.repairType, categoryId: input.categoryId, targetPartNameId: input.targetPartNameId,
    actionId: input.actionId, detailLabel: input.detailLabel, driveType: input.driveType };
}

export async function assertUniqueStandard(db: Db, input: StandardInput, excludingId?: number) {
  const duplicate = await db.repairWorkTimeStandard.findFirst({ where: {
    ...standardCondition(input), ...(excludingId ? { id: { not: excludingId } } : {}),
  }, select: { id: true } });
  if (duplicate) throw new SettingsError("同じ条件の標準作業時間が既に登録されています。", 409);
}

export function settingsResponseError(error: unknown) {
  if (error instanceof SettingsError) return { message: error.message, status: error.status };
  if (error instanceof SyntaxError) return { message: "JSONの入力形式が正しくありません。", status: 400 };
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "P2002") return { message: "同じ条件の標準作業時間が既に登録されています。", status: 409 };
    if (error.code === "P2025") return { message: "対象の設定行がありません。", status: 409 };
    if (error.code === "P2003") return { message: "参照先のマスタが見つかりません。", status: 400 };
  }
  console.error("Scheduler settings failed", error);
  return { message: "設定処理に失敗しました。", status: 500 };
}
