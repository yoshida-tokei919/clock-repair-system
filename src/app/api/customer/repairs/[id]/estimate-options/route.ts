import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { commonEstimateAmountMatches, documentTokenIncludesRepair, isIssuedOptionPdfCurrent, isSameOptionApproval, issuedOptionSourceHash, lockEstimateOptions, parseOptionSet, selectedOptionTotal, validateOptionSelection } from "@/lib/estimate-options";
import { assertYen, sumCustomerLines } from "@/lib/pricing-tax";
import { reconcileRepairPartAllocations } from "@/lib/repair-part-allocation";
import { addStatusLogIfMissing } from "../_workflow";
import { assertFreshReopenEstimate, isEstimateDocumentArchived, ReopenApprovalError } from "@/lib/repair-reopen-approval";

export const runtime = "nodejs";

class OptionApprovalConflict extends Error {
  status = 409;
}

type Submission = { repairId?: unknown; planChoiceId?: unknown; addOnChoiceIds?: unknown; approverName?: unknown; pdfFileId?: unknown; optionSourceHash?: unknown };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = (await params).id.trim();
  if (!token || token.length > 256) return NextResponse.json({ error: "共有URLが不正です。" }, { status: 404 });
  let body: Submission;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "回答が不正です。" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "回答が不正です。" }, { status: 400 });
  const approverName = typeof body.approverName === "string" ? body.approverName.trim() : "";
  if (!approverName || approverName.length > 100 || !Number.isSafeInteger(body.pdfFileId) || typeof body.optionSourceHash !== "string") {
    return NextResponse.json({ error: "承認者名と見積内容を確認してください。" }, { status: 400 });
  }

  try {
    // A repair token identifies exactly one repair. A document token may name a
    // repair only after membership and the document's B2B owner are verified.
    const tokenRepair = await prisma.repair.findUnique({ where: { publicToken: token }, select: { id: true } });
    const tokenDocument = tokenRepair ? null : await prisma.estimateDocument.findUnique({ where: { publicToken: token }, select: { id: true, customerId: true, repairs: { select: { id: true } } } });
    if (!tokenRepair && !tokenDocument) return NextResponse.json({ error: "共有URLが見つかりません。" }, { status: 404 });
    const repairId = tokenRepair?.id ?? body.repairId;
    if (!Number.isSafeInteger(repairId) || (repairId as number) < 1 ||
        (tokenRepair && body.repairId !== undefined && body.repairId !== repairId) ||
        (tokenDocument && !tokenDocument.repairs.some(repair => repair.id === repairId))) {
      return NextResponse.json({ error: "対象案件が見つかりません。" }, { status: 404 });
    }
    const result = await prisma.$transaction(async tx => {
      await lockEstimateOptions(tx, repairId as number);
      // Same order as PDF publishing: document -> repair -> option rows.
      const documentId = tokenDocument?.id ?? (await tx.repair.findUnique({ where: { id: repairId as number }, select: { estimateDocumentId: true } }))?.estimateDocumentId;
      if (!documentId) throw new OptionApprovalConflict("見積書が発行されていません。");
      await tx.$queryRaw`SELECT "id" FROM "EstimateDocument" WHERE "id" = ${documentId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} FOR UPDATE`;
      const repair = await tx.repair.findUnique({ where: { id: repairId as number }, include: {
        customer: { select: { type: true, pricingTaxMode: true } },
        watch: { include: { brand: true, model: true, reference: true, caseReference: true } },
        estimate: { include: { items: { orderBy: { id: "asc" }, include: { partsMaster: { select: { grade: true, notes2: true } } } } } },
        estimateOptionSet: { include: { choices: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { lines: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } } } },
        estimateOptionApproval: true,
      } });
      const document = await tx.estimateDocument.findUnique({ where: { id: documentId }, include: {
        currentPdfFile: true, customer: { select: { type: true, name: true, companyName: true, address: true } },
      } });
      if (!repair || !document || repair.estimateDocumentId !== documentId || repair.customerId !== document.customerId || repair.customer.type !== "business" ||
          (tokenRepair && repair.publicToken !== token) ||
          (tokenDocument && (document.publicToken !== token || !documentTokenIncludesRepair(tokenDocument, { id: repair.id, customerId: repair.customerId, customerType: repair.customer.type })))) {
        throw new OptionApprovalConflict("共有URLの対象案件が一致しません。");
      }
      if (await isEstimateDocumentArchived(tx, documentId)) {
        throw new OptionApprovalConflict("再開前の見積書は履歴です。新しい見積書を確認してください。");
      }
      await assertFreshReopenEstimate(tx, repair.id, repair, { allowEmptyCommonLines: true });
      const pdf = document.currentPdfFile;
      if (!pdf || pdf.id !== body.pdfFileId || pdf.status !== "current" || pdf.estimateDocumentId !== document.id || !pdf.storageKey || !pdf.hash || !pdf.fileSize) {
        throw new OptionApprovalConflict("見積PDFが更新されました。ページを読み直してください。");
      }
      const requestedAddOns = Array.isArray(body.addOnChoiceIds) ? [...body.addOnChoiceIds].sort((a, b) => a - b) : body.addOnChoiceIds;
      const previous = repair.estimateOptionApproval;
      if (previous) {
        if (isSameOptionApproval(previous, { pdfFileId: pdf.id, planChoiceId: body.planChoiceId, addOnChoiceIds: requestedAddOns,
          approverName, optionSourceHash: body.optionSourceHash as string }) && repair.approvalStatus === "approved" &&
            !["キャンセル", "キャンセル返却", "修理不可返却", "納品済み"].includes(repair.status)) {
          return { alreadyApproved: true, grossAmount: previous.grossAmount, taxAmount: previous.taxAmount };
        }
        throw new OptionApprovalConflict("この案件は承認済みです。改訂見積の再承認は現在できません。");
      }
      if (repair.approvalStatus !== "pending" || repair.status !== "承認待ち" || !repair.estimate || !repair.estimateOptionSet?.isActive ||
          !["INCLUSIVE", "EXCLUSIVE"].includes(document.pricingTaxMode) || repair.estimate.pricingTaxMode !== document.pricingTaxMode ||
          repair.customer.pricingTaxMode !== document.pricingTaxMode || repair.estimate.discountAmount !== 0 || repair.estimate.shipping !== 0) {
        throw new OptionApprovalConflict("この見積は選択承認できません。");
      }
      if (repair.partsAllocationLegacy) throw new OptionApprovalConflict("旧形式の部品引当案件は選択承認できません。工房へご連絡ください。");
      const set = repair.estimateOptionSet;
      parseOptionSet(set);
      const sourceHash = issuedOptionSourceHash(document, repair);
      if (!isIssuedOptionPdfCurrent(pdf, document.id, repair.id, body.pdfFileId as number, sourceHash) || body.optionSourceHash !== sourceHash) {
        throw new OptionApprovalConflict("発行時の見積内容が変わりました。PDFの再発行が必要です。");
      }
      const { plan, addOns } = validateOptionSelection(set, body.planChoiceId, requestedAddOns);
      const commonLines = repair.estimate.items;
      if (!commonEstimateAmountMatches(commonLines, repair.estimate, document.pricingTaxMode as "INCLUSIVE" | "EXCLUSIVE")) throw new OptionApprovalConflict("共通明細の金額が一致しません。");
      const totals = selectedOptionTotal(commonLines, plan, addOns, document.pricingTaxMode as "INCLUSIVE" | "EXCLUSIVE");
      const selectedLines = [...(plan?.lines ?? []), ...addOns.flatMap(choice => choice.lines)];
      if (commonLines.length === 0 && selectedLines.length === 0) throw new OptionApprovalConflict("見積明細がありません。見積を確認してください。");
      const existingLines = await tx.repairLineItem.findMany({ where: { repairId: repair.id }, select: { sortOrder: true } });
      const firstSortOrder = Math.max(-1, ...existingLines.map(line => line.sortOrder)) + 1;
      await tx.estimateItem.createMany({ data: selectedLines.map(line => ({
        estimateId: repair.estimate!.id, itemName: line.itemNameSnapshot, quantity: line.quantity, unitPrice: line.unitPrice,
        type: line.lineType === "PART" ? "part" : "labor", partsMasterId: line.partsMasterId,
        sourceAreaSnapshot: line.workTypeSnapshot?.toLowerCase() ?? null, categoryNameSnapshot: line.categoryNameSnapshot,
        targetPartNameSnapshot: line.targetPartNameSnapshot, actionNameSnapshot: line.actionNameSnapshot,
        detailLabelSnapshot: line.detailLabelSnapshot, b2cDisplayNameSnapshot: line.displayNameSnapshot,
      })) });
      await tx.repairLineItem.createMany({ data: selectedLines.map((line, index) => ({
        repairId: repair.id, lineType: line.lineType, partsMasterId: line.partsMasterId, pricingRuleId: line.pricingRuleId,
        repairWorkCategoryId: line.repairWorkCategoryId, repairWorkActionId: line.repairWorkActionId, targetPartNameId: line.targetPartNameId,
        itemNameSnapshot: line.itemNameSnapshot, estimateDisplayNameSnapshot: line.displayNameSnapshot ?? line.itemNameSnapshot,
        b2bDisplayNameSnapshot: line.displayNameSnapshot ?? line.itemNameSnapshot, notesForCustomerSnapshot: line.notesForCustomerSnapshot,
        categoryNameSnapshot: line.categoryNameSnapshot, actionNameSnapshot: line.actionNameSnapshot, targetPartNameSnapshot: line.targetPartNameSnapshot,
        detailLabelSnapshot: line.detailLabelSnapshot, quantity: line.quantity, unitPrice: line.unitPrice,
        amount: assertYen(line.quantity * line.unitPrice), showPriceB2b: true, sortOrder: firstSortOrder + index,
      })) });
      const technicalFee = assertYen(repair.estimate.technicalFee + sumCustomerLines(selectedLines.filter(line => line.lineType === "LABOR")));
      const partsTotal = assertYen(repair.estimate.partsTotal + sumCustomerLines(selectedLines.filter(line => line.lineType === "PART")));
      await tx.estimate.update({ where: { id: repair.estimate.id }, data: { technicalFee, partsTotal, totalAmount: totals.totalAmount, taxAmount: totals.taxAmount } });
      const approvedAt = new Date();
      await tx.repair.update({ where: { id: repair.id }, data: { approvalStatus: "approved", approvalDate: approvedAt } });
      await tx.estimateOptionApproval.create({ data: {
        repairId: repair.id, estimateDocumentId: document.id, pdfFileId: pdf.id, pdfVersion: pdf.version,
        optionSetId: set.id, optionSourceHash: sourceHash, planChoiceId: plan?.id ?? null,
        addOnChoiceIds: requestedAddOns as Prisma.InputJsonValue,
        lineSnapshot: JSON.parse(JSON.stringify({ commonLines, selectedLines, totals })) as Prisma.InputJsonValue,
        approverName, approvalMethod: "public-share", grossAmount: totals.grossAmount, taxAmount: totals.taxAmount, approvedAt,
      } });
      const reconciled = await reconcileRepairPartAllocations(tx, repair.id, { allowAdvanceFromApproval: true });
      await addStatusLogIfMissing(tx, repair.id, reconciled.status, approvedAt);
      return { alreadyApproved: false, grossAmount: totals.grossAmount, taxAmount: totals.taxAmount };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ReopenApprovalError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof OptionApprovalConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && /選択|金額|プラン|追加作業/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Public estimate option approval failed", error);
    return NextResponse.json({ error: "承認を保存できませんでした。" }, { status: 500 });
  }
}
