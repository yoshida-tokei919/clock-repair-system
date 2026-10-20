import { NextResponse } from "next/server";
import { getAdminApiIdentity } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { canEditEstimateOptions, lockEstimateOptions, optionTotals, parseOptionSet } from "@/lib/estimate-options";
import { effectivePricingTaxMode, sumCustomerLines } from "@/lib/pricing-tax";
import { buildEstimateOptionContactText, isTargetEstimateCustomer, replaceOrRemoveGeneratedSection, TARGET_COMPANY_NAME_PART } from "@/lib/estimate-option-contact-text";

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
      estimate: { select: { pricingTaxMode: true, items: { select: { itemName: true, unitPrice: true, quantity: true } } } },
      estimateOptionSet: { include: { choices: { orderBy: { sortOrder: "asc" }, include: { lines: { orderBy: { sortOrder: "asc" } } } } } },
    } });
    if (!repair) return NextResponse.json({ error: "案件が見つかりません。" }, { status: 404 });
    const set = repair.estimateOptionSet;
    const mode = repair.estimate?.pricingTaxMode === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE";
    const commonLines = repair.estimate?.items ?? [];
    return NextResponse.json({ set, editable: canEditEstimateOptions(repair), commonLines, commonAmount: sumCustomerLines(commonLines),
      ...(isTargetEstimateCustomer(repair.customer, TARGET_COMPANY_NAME_PART) ? { contactText: repair.customerNote ?? "" } : {}),
      pricingTaxMode: mode, totals: set ? optionTotals(commonLines, set.choices, mode) : [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "読込に失敗しました。" }, { status: 400 }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminApiIdentity();
  if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    const repairId = await repairIdFrom(params);
    const input = parseOptionSet(await request.json());
    await prisma.$transaction(async (tx) => {
      await lockEstimateOptions(tx, repairId);
      await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} FOR UPDATE`;
      const repair = await tx.repair.findUnique({ where: { id: repairId }, select: {
        status: true, approvalStatus: true, estimateDocumentId: true, inquiryNumber: true, customerNote: true,
        customer: { select: { type: true, prefix: true, companyName: true, pricingTaxMode: true } },
        estimate: { select: { pricingTaxMode: true, totalAmount: true, taxAmount: true,
          items: { orderBy: { id: "asc" }, select: { itemName: true, quantity: true, unitPrice: true } } } },
        estimateDocument: { select: { currentPdfFileId: true, pdfFiles: { select: { id: true }, take: 1 } } },
      } });
      if (!repair) throw new Error("案件が見つかりません。");
      if (!canEditEstimateOptions(repair) || repair.estimateDocument?.currentPdfFileId || repair.estimateDocument?.pdfFiles.length) {
        throw new Error("承認済み・帳票発行済み・終了済みの案件では選択肢を変更できません。");
      }
      // References are optional draft snapshots, but supplied references must be real and type-consistent.
      for (const choice of input.choices) for (const line of choice.lines) {
        if (line.partsMasterId && !await tx.partsMaster.findUnique({ where: { id: line.partsMasterId }, select: { id: true } })) throw new Error("部品マスタが見つかりません。");
        if (line.pricingRuleId && !await tx.pricingRule.findUnique({ where: { id: line.pricingRuleId }, select: { id: true } })) throw new Error("価格ルールが見つかりません。");
        if (line.repairWorkCategoryId) {
          const category = await tx.repairWorkCategory.findUnique({ where: { id: line.repairWorkCategoryId }, select: { repairType: true } });
          if (!category || (line.workTypeSnapshot && category.repairType !== line.workTypeSnapshot)) throw new Error("作業カテゴリと内装・外装区分が一致しません。");
          line.workTypeSnapshot = category.repairType;
        }
        if (line.repairWorkActionId && !await tx.repairWorkAction.findUnique({ where: { id: line.repairWorkActionId }, select: { id: true } })) throw new Error("処置マスタが見つかりません。");
        if (line.targetPartNameId && !await tx.partNameMaster.findUnique({ where: { id: line.targetPartNameId }, select: { id: true } })) throw new Error("標準部品名マスタが見つかりません。");
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
        if (input.isActive && estimate &&
            sumCustomerLines(commonLines) !== estimate!.totalAmount + (mode === "INCLUSIVE" ? estimate!.taxAmount : 0)) {
          throw new Error("共通見積の保存額と明細額が一致しないため、連絡文を生成できません。");
        }
        const savedSet = await tx.estimateOptionSet.findUniqueOrThrow({ where: { id: set.id }, include: {
          choices: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } },
        } });
        const quote = input.isActive ? buildEstimateOptionContactText({
          inquiryNumber: repair.inquiryNumber, title: savedSet.title, notes: savedSet.notes, mode,
          commonLines: commonLines.map(line => ({ itemName: line.itemName, quantity: line.quantity, unitPrice: line.unitPrice })),
          choices: savedSet.choices.map(choice => ({ kind: choice.kind, name: choice.name, notes: choice.notes,
            lines: choice.lines.map(line => ({ itemName: line.displayNameSnapshot || line.itemNameSnapshot, quantity: line.quantity, unitPrice: line.unitPrice })) })),
        }) : null;
        const customerNote = replaceOrRemoveGeneratedSection(repair.customerNote, quote);
        if (customerNote !== (repair.customerNote ?? "")) await tx.repair.update({ where: { id: repairId }, data: { customerNote } });
      }
    });
    return GET(request, { params: Promise.resolve({ id: String(repairId) }) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "保存に失敗しました。" }, { status: 400 }); }
}
