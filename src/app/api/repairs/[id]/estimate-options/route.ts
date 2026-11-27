import { NextResponse } from "next/server";
import { getAdminApiIdentity } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { canEditEstimateOptions, lockEstimateOptions, optionTotals, parseOptionSet, realCommonLineCount } from "@/lib/estimate-options";
import { effectivePricingTaxMode, sumCustomerLines } from "@/lib/pricing-tax";
import { buildEstimateContactText, isTargetEstimateCustomer, replaceOrRemoveGeneratedSection, TARGET_COMPANY_NAME_PART } from "@/lib/estimate-option-contact-text";
import { isRepairWorkActionApplicable, isRepairWorkTargetPartApplicable } from "@/lib/repair-work-selection";
import { matchesExteriorPartCandidate, matchesInternalPartCandidate, mergeWatchRefs } from "@/lib/parts-master-compatibility";

const repairIdFrom = async (params: Promise<{ id: string }>) => {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("案件IDが不正です。");
  return id;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getAdminApiIdentity()) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    const repairId = await repairIdFrom(params);
    const repair = await prisma.repair.findUnique({ where: { id: repairId }, select: {
      status: true, approvalStatus: true, estimateDocumentId: true, customerNote: true,
      customer: { select: { type: true, prefix: true, companyName: true } },
      watch: { select: { brandId: true, modelId: true, caliberId: true, reference: { select: { name: true } }, caseReference: { select: { name: true } } } },
      movementMakerId: true, movementCaliberId: true, baseMovementMakerId: true, baseMovementCaliberId: true,
      estimate: { select: { pricingTaxMode: true, items: { select: { itemName: true, unitPrice: true, quantity: true } } } },
      estimateOptionSet: { include: { choices: { orderBy: { sortOrder: "asc" }, include: { lines: { orderBy: { sortOrder: "asc" } } } } } },
    } });
    if (!repair) return NextResponse.json({ error: "案件が見つかりません。" }, { status: 404 });
    const set = repair.estimateOptionSet;
    const mode = repair.estimate?.pricingTaxMode === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE";
    const commonLines = repair.estimate?.items ?? [];
    return NextResponse.json({ set, editable: canEditEstimateOptions(repair), commonLines, commonAmount: sumCustomerLines(commonLines),
      masterContext: { customerType: repair.customer.type, ...repair.watch, movementMakerId: repair.movementMakerId,
        movementCaliberId: repair.movementCaliberId, baseMovementMakerId: repair.baseMovementMakerId, baseMovementCaliberId: repair.baseMovementCaliberId },
      ...(isTargetEstimateCustomer(repair.customer, TARGET_COMPANY_NAME_PART) ? { contactText: repair.customerNote ?? "" } : {}),
      pricingTaxMode: mode, totals: set ? optionTotals(commonLines, set.choices, mode) : [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "読込に失敗しました。" }, { status: 400 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminApiIdentity();
  if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    const repairId = await repairIdFrom(params);
    const body = await request.json();
    await prisma.$transaction(async (tx) => {
      await lockEstimateOptions(tx, repairId);
      await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} FOR UPDATE`;
      const repair = await tx.repair.findUnique({ where: { id: repairId }, select: {
        status: true, approvalStatus: true, estimateDocumentId: true, inquiryNumber: true, customerNote: true, endUserName: true,
        customerId: true, movementMakerId: true, movementCaliberId: true, baseMovementMakerId: true, baseMovementCaliberId: true,
        watch: { include: { brand: true, model: true, reference: true, caseReference: true } },
        customer: { select: { type: true, prefix: true, companyName: true, pricingTaxMode: true } },
        estimate: { select: { pricingTaxMode: true, totalAmount: true, taxAmount: true,
          items: { orderBy: { id: "asc" }, select: { itemName: true, quantity: true, quantityUnit: true, unitPrice: true } } } },
        estimateDocument: { select: { currentPdfFileId: true, pdfFiles: { select: { id: true }, take: 1 } } },
      } });
      if (!repair) throw new Error("案件が見つかりません。");
      const input = parseOptionSet(body, realCommonLineCount(repair.estimate?.items ?? []));
      if (!canEditEstimateOptions(repair) || repair.estimateDocument?.currentPdfFileId || repair.estimateDocument?.pdfFiles.length) {
        throw new Error("承認済み・帳票発行済み・終了済みの案件では選択肢を変更できません。");
      }
      // Manual lines have no master references. Referenced lines must match the canonical hierarchy.
      for (const choice of input.choices) for (const line of choice.lines) {
        const workType = line.workTypeSnapshot;
        if ((line.repairWorkCategoryId || line.repairWorkActionId || line.pricingRuleId || line.partsMasterId || line.targetPartNameId) && !workType) throw new Error("マスタ参照には内装・外装区分が必要です。");
        if (line.partsMasterId) {
          const part = await tx.partsMaster.findUnique({ where: { id: line.partsMasterId }, select: {
            standardPartNameId: true, partType: true, category: true, nameJp: true, brandId: true, modelId: true, watchRefs: true,
            movementMakerId: true, caliberId: true, baseMakerId: true, baseCaliberId: true,
          } });
          const target = line.targetPartNameId ? await tx.partNameMaster.findUnique({ where: { id: line.targetPartNameId }, select: { nameJa: true, displayJa: true } }) : null;
          if (!part || line.lineType !== "PART" || !target || !workType || !(workType === "INTERNAL"
            ? matchesInternalPartCandidate(part, { movementMakerId: repair.movementMakerId, movementCaliberId: repair.movementCaliberId,
                baseMovementMakerId: repair.baseMovementMakerId, baseMovementCaliberId: repair.baseMovementCaliberId,
                standardPartNameId: line.targetPartNameId, standardPartName: target.nameJa, standardDisplayName: target.displayJa })
            : matchesExteriorPartCandidate(part, { brandId: repair.watch.brandId, modelId: repair.watch.modelId,
                currentRefs: mergeWatchRefs(repair.watch.reference?.name, repair.watch.caseReference?.name),
                standardPartNameId: line.targetPartNameId, standardPartName: target.nameJa, standardDisplayName: target.displayJa }))) {
            throw new Error("実部品と時計・標準部品名・内外装区分が一致しません。");
          }
        }
        if (line.repairWorkCategoryId) {
          const category = await tx.repairWorkCategory.findUnique({ where: { id: line.repairWorkCategoryId }, select: { name: true, displayName: true, repairType: true } });
          if (!category || line.lineType !== "LABOR" || category.repairType !== workType) throw new Error("作業カテゴリと内装・外装区分が一致しません。");
          line.categoryNameSnapshot = category.displayName || category.name;
        }
        if (line.repairWorkActionId) {
          const action = await tx.repairWorkAction.findUnique({ where: { id: line.repairWorkActionId }, select: { name: true, displayName: true } });
          if (!action || line.lineType !== "LABOR" || !workType || !isRepairWorkActionApplicable(workType, action.name)) throw new Error("処置マスタと内外装区分が一致しません。");
          line.actionNameSnapshot = action.displayName || action.name;
        }
        if (line.targetPartNameId) {
          const target = await tx.partNameMaster.findUnique({ where: { id: line.targetPartNameId }, select: {
            key: true, nameJa: true, displayJa: true, partType: true, category: { select: { key: true, partType: true } }, isActive: true,
          } });
          if (!target?.isActive || !workType || !(workType === "INTERNAL"
            ? ["part_internal", "internal", "interior"].includes(target.partType || target.category.partType)
            : ["part_external", "external", "exterior"].includes(target.partType || target.category.partType))) throw new Error("標準部品名マスタと内外装区分が一致しません。");
          if (line.lineType === "LABOR" && line.repairWorkCategoryId) {
            const category = await tx.repairWorkCategory.findUniqueOrThrow({ where: { id: line.repairWorkCategoryId }, select: { name: true } });
            if (!isRepairWorkTargetPartApplicable(workType, category.name, { key: target.key, partType: target.partType || target.category.partType, categoryKey: target.category.key })) throw new Error("作業カテゴリと対象部品が一致しません。");
          }
          line.targetPartNameSnapshot = target.displayJa || target.nameJa;
        }
        if (line.pricingRuleId) {
          const rule = await tx.pricingRule.findUnique({ where: { id: line.pricingRuleId }, select: {
            customerType: true, brandId: true, modelId: true, caliberId: true, repairWorkCategoryId: true, repairWorkActionId: true,
            targetPartNameId: true, suggestedWorkName: true, detailLabel: true,
          } });
          if (!rule || line.lineType !== "LABOR" || rule.customerType !== repair.customer.type ||
              rule.brandId !== repair.watch.brandId || (rule.modelId && rule.modelId !== repair.watch.modelId) ||
              (workType === "EXTERNAL" ? rule.caliberId !== null :
                ![repair.movementCaliberId, repair.baseMovementCaliberId, repair.watch.caliberId, null].includes(rule.caliberId)) ||
              (workType === "INTERNAL" ? rule.repairWorkCategoryId !== line.repairWorkCategoryId :
                Boolean(rule.repairWorkCategoryId && rule.repairWorkCategoryId !== line.repairWorkCategoryId)) ||
              rule.repairWorkActionId !== line.repairWorkActionId ||
              rule.targetPartNameId !== line.targetPartNameId || (rule.detailLabel ?? "") !== (line.detailLabelSnapshot ?? "")) {
            throw new Error("価格ルールと作業・顧客区分が一致しません。");
          }
        }
      }
      const set = await tx.estimateOptionSet.upsert({ where: { repairId }, create: { repairId, title: input.title, notes: input.notes, isActive: input.isActive }, update: { title: input.title, notes: input.notes, isActive: input.isActive } });
      await tx.estimateOptionChoice.deleteMany({ where: { setId: set.id } });
      for (const [sortOrder, choice] of input.choices.entries()) {
        await tx.estimateOptionChoice.create({ data: { setId: set.id, kind: choice.kind, name: choice.name, notes: choice.notes, recommended: choice.recommended, sortOrder,
          lines: { create: choice.lines.map((line, index) => ({ ...line, sortOrder: index })) },
        } });
      }
      if (isTargetEstimateCustomer(repair.customer, TARGET_COMPANY_NAME_PART)) {
        const estimate = repair.estimate;
        const mode = estimate ? estimate.pricingTaxMode === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE" : effectivePricingTaxMode(repair.customer);
        const commonLines = estimate?.items ?? [];
        if (estimate &&
            sumCustomerLines(commonLines) !== estimate!.totalAmount + (mode === "INCLUSIVE" ? estimate!.taxAmount : 0)) {
          throw new Error("共通見積の保存額と明細額が一致しないため、連絡文を生成できません。");
        }
        const savedSet = await tx.estimateOptionSet.findUniqueOrThrow({ where: { id: set.id }, include: {
          choices: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } },
        } });
        const quote = buildEstimateContactText({
          endUserName: repair.endUserName, watch: repair.watch, inquiryNumber: repair.inquiryNumber, mode,
          commonLines: commonLines.map(line => ({ itemName: line.itemName, quantity: line.quantity, unitPrice: line.unitPrice })),
          optionSet: { isActive: savedSet.isActive, title: savedSet.title, notes: savedSet.notes,
            choices: savedSet.choices.map(choice => ({ kind: choice.kind, name: choice.name, notes: choice.notes,
              lines: choice.lines.map(line => ({ itemName: line.displayNameSnapshot || line.itemNameSnapshot, quantity: line.quantity, unitPrice: line.unitPrice })) })),
          },
        });
        const customerNote = replaceOrRemoveGeneratedSection(repair.customerNote, quote);
        if (customerNote !== (repair.customerNote ?? "")) await tx.repair.update({ where: { id: repairId }, data: { customerNote } });
      }
    });
    return GET(request, { params: Promise.resolve({ id: String(repairId) }) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "保存に失敗しました。" }, { status: 400 }); }
}
