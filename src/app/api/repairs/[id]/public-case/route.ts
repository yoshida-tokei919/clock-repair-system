import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

function text(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function publicCaseSourceArea(repairType: "INTERNAL" | "EXTERNAL"): "internal" | "external" {
  return repairType === "INTERNAL" ? "internal" : "external";
}

function partSourceArea(partType: string | null): "internal" | "external" | null {
  if (partType === "interior") return "internal";
  if (partType === "exterior") return "external";
  return null;
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const repairId = Number(params.id);
  if (!Number.isInteger(repairId) || repairId <= 0) {
    return NextResponse.json({ error: "修理IDが不正です。" }, { status: 400 });
  }

  // WEB_APP の sourceRepairId は通常Repairの安定した重複防止キーとして使う。
  // repairId も保持し、元Repairとのリレーションを明示する。
  const sourceRepairId = String(repairId);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.publicCase.findUnique({
        where: {
          sourceType_sourceRepairId: {
            sourceType: "WEB_APP",
            sourceRepairId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        return { publicCaseId: existing.id, created: false };
      }

      const repair = await tx.repair.findUnique({
        where: { id: repairId },
        select: {
          id: true,
          inquiryNumber: true,
          receptionDate: true,
          movementCaliber: { select: { name: true } },
          baseMovementCaliber: { select: { name: true } },
          watch: {
            select: {
              brand: { select: { id: true, name: true, nameJp: true, kana: true } },
              model: { select: { id: true, name: true, nameJp: true } },
              reference: { select: { id: true, name: true } },
              caliber: { select: { id: true, name: true } },
            },
          },
          repairLineItems: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              lineType: true,
              partsMasterId: true,
              repairWorkCategoryId: true,
              repairWorkActionId: true,
              targetPartNameId: true,
              itemNameSnapshot: true,
              estimateDisplayNameSnapshot: true,
              b2cDisplayNameSnapshot: true,
              gradeNameSnapshot: true,
              detailLabelSnapshot: true,
              categoryNameSnapshot: true,
              targetPartNameSnapshot: true,
              actionNameSnapshot: true,
              sortOrder: true,
              repairWorkCategory: { select: { repairType: true } },
              partsMaster: { select: { id: true, nameJp: true, partType: true } },
            },
          },
        },
      });

      if (!repair) {
        throw new Error("修理案件が見つかりません。");
      }

      const brandName = text(repair.watch.brand.name);
      const brandDisplayName = text(repair.watch.brand.nameJp) ?? brandName;
      const modelName = text(repair.watch.model.nameJp) ?? text(repair.watch.model.name);
      const ref = text(repair.watch.reference?.name);
      const caliber =
        text(repair.movementCaliber?.name) ??
        text(repair.baseMovementCaliber?.name) ??
        text(repair.watch.caliber?.name);
      const searchText = [brandName, brandDisplayName, modelName, ref, caliber]
        .filter((value): value is string => Boolean(value))
        .join(" ");

      const workItems = repair.repairLineItems.flatMap((lineItem) => {
        if (lineItem.lineType !== "LABOR" || !lineItem.repairWorkCategory) {
          return [];
        }

        const sourceText = text(lineItem.itemNameSnapshot);
        if (!sourceText) return [];

        return [{
          sourceArea: publicCaseSourceArea(lineItem.repairWorkCategory.repairType),
          sourceSlot: lineItem.sortOrder,
          sourceText,
          normalizedSourceText: sourceText,
          isRuleMatched: false,
          isPublishable: false,
          reviewStatus: "DRAFT" as const,
          normalizedWorkName: sourceText,
          b2bDisplayName: text(lineItem.estimateDisplayNameSnapshot) ?? sourceText,
          b2cDisplayName: text(lineItem.b2cDisplayNameSnapshot) ?? sourceText,
          laborPrice: null,
          showPriceB2b: false,
          showPriceB2c: false,
          category: text(lineItem.categoryNameSnapshot),
          partName: text(lineItem.targetPartNameSnapshot),
          action: text(lineItem.actionNameSnapshot),
          actionDetail: text(lineItem.detailLabelSnapshot),
          attributes: {
            repairLineItemId: lineItem.id,
            repairWorkCategoryId: lineItem.repairWorkCategoryId,
            repairWorkActionId: lineItem.repairWorkActionId,
            targetPartNameId: lineItem.targetPartNameId,
          },
          sortOrder: lineItem.sortOrder,
        }];
      });

      const partItems = repair.repairLineItems.flatMap((lineItem) => {
        if (lineItem.lineType !== "PART" || !lineItem.partsMaster) {
          return [];
        }

        const sourceArea = partSourceArea(lineItem.partsMaster.partType);
        const sourceText = text(lineItem.itemNameSnapshot);
        if (!sourceArea || !sourceText) return [];

        return [{
          sourceArea,
          sourceSlot: lineItem.sortOrder,
          sourceText,
          normalizedSourceText: sourceText,
          displayName: text(lineItem.partsMaster.nameJp) ?? sourceText,
          price: null,
          showPriceB2b: false,
          showPriceB2c: false,
          relationStatus: "UNLINKED",
          reviewStatus: "DRAFT" as const,
          sortOrder: lineItem.sortOrder,
          metadata: {
            repairLineItemId: lineItem.id,
            partsMasterId: lineItem.partsMaster.id,
            gradeNameSnapshot: text(lineItem.gradeNameSnapshot),
          },
        }];
      });

      const publicCase = await tx.publicCase.create({
        data: {
          sourceType: "WEB_APP",
          sourceRepairId,
          repairId: repair.id,
          receivedDate: repair.receptionDate,
          brandName,
          brandNameKana: text(repair.watch.brand.kana),
          brandDisplayName,
          modelName,
          ref,
          caliber,
          searchText: text(searchText),
          reviewStatus: "DRAFT",
          b2bPublishStatus: "HIDDEN",
          b2cPublishStatus: "HIDDEN",
          showPriceB2b: false,
          showPriceB2c: false,
          sourceSnapshot: {
            repairId: repair.id,
            inquiryNumber: repair.inquiryNumber,
            brandId: repair.watch.brand.id,
            modelId: repair.watch.model.id,
            referenceId: repair.watch.reference?.id ?? null,
            watchCaliberId: repair.watch.caliber?.id ?? null,
            movementCaliber: text(repair.movementCaliber?.name),
            baseMovementCaliber: text(repair.baseMovementCaliber?.name),
          },
          workItems: { create: workItems },
          partItems: { create: partItems },
        },
        select: { id: true },
      });

      return { publicCaseId: publicCase.id, created: true };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    // 同時実行時はDBの一意制約を最終防衛線にし、既存下書きを返す。
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.publicCase.findUnique({
        where: {
          sourceType_sourceRepairId: { sourceType: "WEB_APP", sourceRepairId },
        },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json({ success: true, publicCaseId: existing.id, created: false });
      }
    }

    console.error("Create PublicCase draft error:", error);
    const message = error instanceof Error ? error.message : "事例下書きの作成に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
