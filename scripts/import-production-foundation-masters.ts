/**
 * Task142 production foundation-master importer.
 *
 * Default mode is read-only.  A production write requires both an explicit
 * command-line confirmation and a matching environment confirmation.  IDs are
 * deliberately never read from the source database or supplied to Prisma.
 */
import { PrismaClient, RepairWorkType } from "@prisma/client";
import { PART_CATEGORIES, PART_NAME_OPTIONS } from "../src/lib/part-input-options";

const PRODUCTION_CONFIRMATION = "TASK142_FOUNDATION_MASTER_IMPORT";
const CLONE_CONFIRMATION = "TASK142_CLONE_IMPORT";

const repairWorkActions = [
  ["exchange", "交換", 10], ["repair", "修理", 20], ["adjust", "調整", 30], ["correction", "修正", 40],
  ["polish", "研磨", 50], ["clean", "洗浄", 60], ["oil", "注油", 70], ["make", "製作", 80],
  ["install", "取付", 90], ["remove", "除去", 100], ["hole_tightening", "穴締め", 110], ["staking", "かしめ", 120],
  ["overhaul", "オーバーホール", 130], ["inspection", "検査", 140], ["other", "その他", 150], ["processing", "加工", 160],
  ["bonding", "接着", 170], ["finishing", "仕上げ", 180], ["light_finishing", "簡易仕上げ", 190], ["painting", "塗装", 200],
  ["rust_removal", "サビ取り", 210], ["drying", "乾燥", 220], ["welding", "溶接", 230], ["brazing", "ロウ付け", 240],
] as const;

const repairWorkCategories = [
  [RepairWorkType.INTERNAL, "movement", "ムーブメント", 10], [RepairWorkType.INTERNAL, "quartz", "クォーツ", 20],
  [RepairWorkType.INTERNAL, "power_winding", "動力・巻上", 30], [RepairWorkType.INTERNAL, "train_wheel", "輪列", 40],
  [RepairWorkType.INTERNAL, "escapement", "脱進機", 50], [RepairWorkType.INTERNAL, "regulator", "調速機", 60],
  [RepairWorkType.INTERNAL, "hand_setting", "針回し", 70], [RepairWorkType.INTERNAL, "calendar", "カレンダー", 80],
  [RepairWorkType.INTERNAL, "automatic_winding", "自動巻", 90], [RepairWorkType.INTERNAL, "chronograph", "クロノグラフ", 100],
  [RepairWorkType.INTERNAL, "main_plate", "地板", 110], [RepairWorkType.EXTERNAL, "case_glass", "ケース・風防", 10],
  [RepairWorkType.EXTERNAL, "crown_tube", "リューズ・チューブ", 20], [RepairWorkType.EXTERNAL, "pushers", "プッシャー", 30],
  [RepairWorkType.EXTERNAL, "bezel", "ベゼル", 40], [RepairWorkType.EXTERNAL, "dial_hands", "文字盤・針", 50],
  [RepairWorkType.EXTERNAL, "bracelet_band", "ブレス・バンド", 60],
] as const;

// `used` exists in the current generic seed but is intentionally excluded:
// Task142 promotes the three grades actually present in clock_repair_local.
const partGrades = [
  ["genuine", "純正", "genuine", 10], ["fit", "FIT", "fit / aftermarket", 20], ["custom_fit", "合わせ", "custom fit", 30],
] as const;

const suppliers = [
  ["Cousins UK", "https://www.cousinsuk.com", true], ["eBay", "https://www.ebay.com", true],
  ["AliExpress", "https://www.aliexpress.com", true], ["ヤフオク", "https://auctions.yahoo.co.jp", true],
  ["メルカリ", "https://www.mercari.com", true], ["Yショッピング", "https://shopping.yahoo.co.jp", true],
  ["楽天", "https://www.rakuten.co.jp", true], ["激安卸問屋", null, true], ["中村時計材料店", null, false], ["その他", null, false],
] as const;

type Counts = Record<"repairWorkCategories" | "repairWorkActions" | "partCategories" | "partNames" | "partGrades" | "suppliers", number>;
const zeroCounts = (): Counts => ({ repairWorkCategories: 0, repairWorkActions: 0, partCategories: 0, partNames: 0, partGrades: 0, suppliers: 0 });

function isLocalUrl(url: string) {
  try { return ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname); } catch { return true; }
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const confirmation = process.argv.find((arg) => arg.startsWith("--production-confirm="))?.split("=", 2)[1];
  if (Array.from(args).some((arg) => arg === "--seed" || arg === "--migrate" || arg === "--db-push")) throw new Error("Unsupported operation.");
  return { execute: args.has("--execute"), clone: args.has("--clone"), confirmation };
}

async function plannedChanges(prisma: PrismaClient) {
  const [categories, actions, partCategories, partNames, grades, existingSuppliers] = await Promise.all([
    prisma.repairWorkCategory.findMany({ where: { parentId: null }, select: { repairType: true, name: true } }),
    prisma.repairWorkAction.findMany({ select: { name: true } }), prisma.partCategoryMaster.findMany({ select: { key: true } }),
    prisma.partNameMaster.findMany({ select: { key: true } }), prisma.partGradeMaster.findMany({ select: { key: true } }),
    prisma.supplier.findMany({ select: { name: true } }),
  ]);
  const count = (target: string[], existing: string[]) => target.filter((key) => !existing.includes(key)).length;
  const categoryKeys = categories.map((row) => `${row.repairType}:${row.name}`);
  const sourceCategories = repairWorkCategories.map(([type, name]) => `${type}:${name}`);
  const create = zeroCounts();
  create.repairWorkCategories = count(sourceCategories, categoryKeys);
  create.repairWorkActions = count(repairWorkActions.map(([name]) => name), actions.map((row) => row.name));
  create.partCategories = count(PART_CATEGORIES.map((row) => row.key), partCategories.map((row) => row.key));
  create.partNames = count(PART_NAME_OPTIONS.map((row) => row.key), partNames.map((row) => row.key));
  create.partGrades = count(partGrades.map(([key]) => key), grades.map((row) => row.key));
  create.suppliers = count(suppliers.map(([name]) => name), existingSuppliers.map((row) => row.name));
  const update = Object.fromEntries(Object.entries(create).map(([key, created]) => [key, (expectedCounts()[key as keyof Counts] - created)])) as Counts;
  return { create, update };
}

function expectedCounts(): Counts {
  return { repairWorkCategories: repairWorkCategories.length, repairWorkActions: repairWorkActions.length, partCategories: PART_CATEGORIES.length, partNames: PART_NAME_OPTIONS.length, partGrades: partGrades.length, suppliers: suppliers.length };
}

async function upsertAll(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    for (const [repairType, name, displayName, sortOrder] of repairWorkCategories) {
      const existing = await tx.repairWorkCategory.findFirst({ where: { repairType, parentId: null, name }, select: { id: true } });
      const data = { displayName, sortOrder, isActive: true };
      if (existing) await tx.repairWorkCategory.update({ where: { id: existing.id }, data });
      else await tx.repairWorkCategory.create({ data: { repairType, parentId: null, name, ...data } });
    }
    for (const [name, displayName, sortOrder] of repairWorkActions) await tx.repairWorkAction.upsert({ where: { name }, update: { displayName, sortOrder, isActive: true }, create: { name, displayName, sortOrder, isActive: true } });
    const categoryIds = new Map<string, string>();
    for (let index = 0; index < PART_CATEGORIES.length; index += 1) {
      const item = PART_CATEGORIES[index];
      const saved = await tx.partCategoryMaster.upsert({ where: { key: item.key }, update: { partType: item.partType, nameJa: item.labelJa, nameEn: null, sortOrder: (index + 1) * 10, isActive: true }, create: { key: item.key, partType: item.partType, nameJa: item.labelJa, nameEn: null, sortOrder: (index + 1) * 10, isActive: true }, select: { id: true } });
      categoryIds.set(item.key, saved.id);
    }
    for (let index = 0; index < PART_NAME_OPTIONS.length; index += 1) {
      const item = PART_NAME_OPTIONS[index]; const categoryId = categoryIds.get(item.categoryKey);
      if (!categoryId) throw new Error(`Missing source category for ${item.key}`);
      await tx.partNameMaster.upsert({ where: { key: item.key }, update: { categoryId, partType: item.partType, nameJa: item.nameJa, nameEn: item.nameEn, displayJa: item.displayJa ?? null, displayEn: item.displayEn ?? null, sortOrder: (index + 1) * 10, isActive: true }, create: { key: item.key, categoryId, partType: item.partType, nameJa: item.nameJa, nameEn: item.nameEn, displayJa: item.displayJa ?? null, displayEn: item.displayEn ?? null, sortOrder: (index + 1) * 10, isActive: true } });
    }
    for (const [key, nameJa, nameEn, sortOrder] of partGrades) await tx.partGradeMaster.upsert({ where: { key }, update: { nameJa, nameEn, sortOrder, isActive: true }, create: { key, nameJa, nameEn, sortOrder, isActive: true } });
    for (const [name, url, isOnline] of suppliers) await tx.supplier.upsert({ where: { name }, update: { url, isOnline }, create: { name, url, isOnline } });
  }, { timeout: 60_000 });
}

async function verification(prisma: PrismaClient) {
  const [repairWorkCategories, repairWorkActions, partCategories, partNames, partGrades, suppliers,
    categoryDuplicates, actionDuplicates, partCategoryDuplicates, partNameDuplicates, gradeDuplicates, supplierDuplicates] = await Promise.all([
    prisma.repairWorkCategory.count({ where: { parentId: null } }), prisma.repairWorkAction.count(), prisma.partCategoryMaster.count(),
    prisma.partNameMaster.count(), prisma.partGradeMaster.count(), prisma.supplier.count(),
    prisma.repairWorkCategory.groupBy({ by: ["repairType", "parentId", "name"], _count: { _all: true }, having: { name: { _count: { gt: 1 } } } }),
    prisma.repairWorkAction.groupBy({ by: ["name"], _count: { _all: true }, having: { name: { _count: { gt: 1 } } } }),
    prisma.partCategoryMaster.groupBy({ by: ["key"], _count: { _all: true }, having: { key: { _count: { gt: 1 } } } }),
    prisma.partNameMaster.groupBy({ by: ["key"], _count: { _all: true }, having: { key: { _count: { gt: 1 } } } }),
    prisma.partGradeMaster.groupBy({ by: ["key"], _count: { _all: true }, having: { key: { _count: { gt: 1 } } } }),
    prisma.supplier.groupBy({ by: ["name"], _count: { _all: true }, having: { name: { _count: { gt: 1 } } } }),
  ]);
  const [partNameRows, partCategoryRows] = await Promise.all([
    prisma.partNameMaster.findMany({ select: { categoryId: true } }),
    prisma.partCategoryMaster.findMany({ select: { id: true } }),
  ]);
  const categoryIds = new Set(partCategoryRows.map((row) => row.id));
  const namesWithoutCategory = partNameRows.filter((row) => !categoryIds.has(row.categoryId)).length;
  const actual: Counts = { repairWorkCategories, repairWorkActions, partCategories, partNames, partGrades, suppliers };
  return {
    actualCounts: actual,
    expectedCountMismatches: Object.entries(actual).filter(([key, value]) => value !== expectedCounts()[key as keyof Counts]),
    fkIntegrity: { partNamesWithoutCategory: namesWithoutCategory },
    duplicateNaturalKeyGroups: categoryDuplicates.length + actionDuplicates.length + partCategoryDuplicates.length + partNameDuplicates.length + gradeDuplicates.length + supplierDuplicates.length,
  };
}

async function main() {
  const args = parseArgs(); const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL is required.");
  if (args.clone && !isLocalUrl(url)) throw new Error("--clone requires a localhost DATABASE_URL.");
  if (args.execute && !args.clone && (isLocalUrl(url) || args.confirmation !== PRODUCTION_CONFIRMATION || process.env.PRODUCTION_FOUNDATION_MASTER_IMPORT_CONFIRM !== PRODUCTION_CONFIRMATION)) throw new Error("Production write requires non-local DATABASE_URL, --production-confirm=TASK142_FOUNDATION_MASTER_IMPORT, and matching PRODUCTION_FOUNDATION_MASTER_IMPORT_CONFIRM.");
  if (args.execute && args.clone && args.confirmation !== CLONE_CONFIRMATION) throw new Error("Clone write requires --production-confirm=TASK142_CLONE_IMPORT.");
  const prisma = new PrismaClient();
  try {
    const planned = await plannedChanges(prisma);
    if (args.execute) await upsertAll(prisma);
    const postVerification = args.execute ? await verification(prisma) : undefined;
    console.log(JSON.stringify({ mode: args.execute ? (args.clone ? "clone-execute" : "production-execute") : "dry-run", expectedCounts: expectedCounts(), planned, executed: args.execute, postVerification }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
