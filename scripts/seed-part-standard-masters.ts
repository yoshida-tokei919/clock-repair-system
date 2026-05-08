import { PrismaClient } from "@prisma/client";

import { PART_CATEGORIES, PART_NAME_OPTIONS } from "../src/lib/part-input-options";

const prisma = new PrismaClient();

const PART_GRADES = [
  { key: "genuine", nameJa: "純正", nameEn: "genuine", sortOrder: 10 },
  { key: "fit", nameJa: "FIT", nameEn: "fit / aftermarket", sortOrder: 20 },
  { key: "custom_fit", nameJa: "合わせ", nameEn: "custom fit", sortOrder: 30 },
] as const;

function findDuplicateKeys(items: ReadonlyArray<{ key: string }>) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    if (seen.has(item.key)) duplicates.add(item.key);
    seen.add(item.key);
  }

  return Array.from(duplicates);
}

function assertNoDuplicateKeys(label: string, items: ReadonlyArray<{ key: string }>) {
  const duplicates = findDuplicateKeys(items);
  if (duplicates.length > 0) {
    throw new Error(`${label} has duplicate keys: ${duplicates.join(", ")}`);
  }
}

async function main() {
  assertNoDuplicateKeys("PART_CATEGORIES", PART_CATEGORIES);
  assertNoDuplicateKeys("PART_NAME_OPTIONS", PART_NAME_OPTIONS);
  assertNoDuplicateKeys("PART_GRADES", PART_GRADES);

  const categoryByKey = new Map<string, { id: string; partType: string }>();

  for (let index = 0; index < PART_CATEGORIES.length; index += 1) {
    const category = PART_CATEGORIES[index];
    const savedCategory = await prisma.partCategoryMaster.upsert({
      where: { key: category.key },
      update: {
        partType: category.partType,
        nameJa: category.labelJa,
        nameEn: null,
        sortOrder: (index + 1) * 10,
        isActive: true,
      },
      create: {
        key: category.key,
        partType: category.partType,
        nameJa: category.labelJa,
        nameEn: null,
        sortOrder: (index + 1) * 10,
        isActive: true,
      },
      select: {
        id: true,
        partType: true,
      },
    });

    categoryByKey.set(category.key, savedCategory);
  }

  for (const grade of PART_GRADES) {
    await prisma.partGradeMaster.upsert({
      where: { key: grade.key },
      update: {
        nameJa: grade.nameJa,
        nameEn: grade.nameEn,
        sortOrder: grade.sortOrder,
        isActive: true,
      },
      create: {
        key: grade.key,
        nameJa: grade.nameJa,
        nameEn: grade.nameEn,
        sortOrder: grade.sortOrder,
        isActive: true,
      },
    });
  }

  for (let index = 0; index < PART_NAME_OPTIONS.length; index += 1) {
    const partName = PART_NAME_OPTIONS[index];
    const category = categoryByKey.get(partName.categoryKey);
    if (!category) {
      throw new Error(
        `Category not found for part name "${partName.key}": ${partName.categoryKey}`,
      );
    }

    if (category.partType !== partName.partType) {
      throw new Error(
        `Part type mismatch for part name "${partName.key}": category=${category.partType}, part=${partName.partType}`,
      );
    }

    await prisma.partNameMaster.upsert({
      where: { key: partName.key },
      update: {
        categoryId: category.id,
        partType: partName.partType,
        nameJa: partName.nameJa,
        nameEn: partName.nameEn,
        displayJa: partName.displayJa ?? null,
        displayEn: partName.displayEn ?? null,
        sortOrder: (index + 1) * 10,
        isActive: true,
      },
      create: {
        key: partName.key,
        categoryId: category.id,
        partType: partName.partType,
        nameJa: partName.nameJa,
        nameEn: partName.nameEn,
        displayJa: partName.displayJa ?? null,
        displayEn: partName.displayEn ?? null,
        sortOrder: (index + 1) * 10,
        isActive: true,
      },
    });
  }

  console.log(`PartCategoryMaster upserted: ${PART_CATEGORIES.length}`);
  console.log(`PartNameMaster upserted: ${PART_NAME_OPTIONS.length}`);
  console.log(`PartGradeMaster upserted: ${PART_GRADES.length}`);
  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
