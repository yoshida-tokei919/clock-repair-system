import type { Prisma } from "@prisma/client";
import { encodeReopenEvent } from "@/lib/repair-reopen-approval";
import { assertYen, calculateTaxableAmounts } from "@/lib/pricing-tax";

const RETURN_NAMES = new Set(["修理不可による返却", "キャンセルによる返却"]);

export async function reopenReturnedRepair(tx: Prisma.TransactionClient, repairId: number, actorId: number) {
  await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} FOR UPDATE`;
  const repair = await tx.repair.findUnique({ where: { id: repairId }, select: {
    status: true, invoiceId: true, deliveryNoteId: true, estimateDocumentId: true,
    estimate: { select: { id: true, technicalFee: true, partsTotal: true, mechanicCost: true, discountAmount: true,
      shipping: true, taxAmount: true, totalAmount: true, pricingTaxMode: true,
      items: { orderBy: { id: "asc" }, select: { itemName: true, quantity: true, unitPrice: true, type: true, partsMasterId: true,
      sourceAreaSnapshot: true, categoryNameSnapshot: true, targetPartNameSnapshot: true, actionNameSnapshot: true, detailLabelSnapshot: true } } } },
    repairLineItems: { orderBy: { sortOrder: "asc" }, select: { itemNameSnapshot: true, lineType: true, quantity: true, unitPrice: true, partsMasterId: true,
      pricingRuleId: true, repairWorkCategoryId: true, repairWorkActionId: true, targetPartNameId: true,
      categoryNameSnapshot: true, targetPartNameSnapshot: true, actionNameSnapshot: true, detailLabelSnapshot: true } },
  } });
  if (!repair) throw new Error("案件が見つかりません。");
  if (!["修理不可返却", "キャンセル返却"].includes(repair.status)) throw new Error("返却状態の案件だけを再開できます。画面を再読み込みしてください。");
  if (repair.invoiceId != null || repair.deliveryNoteId != null) throw new Error("請求書または納品書があります。発行・入金状況を照合してください。");
  if (repair.estimateDocumentId != null) {
    const oldDocument = await tx.estimateDocument.findUnique({ where: { id: repair.estimateDocumentId },
      select: { repairs: { take: 2, select: { id: true } } } });
    if (!oldDocument || oldDocument.repairs.length !== 1 || oldDocument.repairs[0].id !== repairId) {
      throw new Error("旧見積書の案件対応が一意ではありません。複数案件の見積はグループ全体の改訂手続きで確認してください。");
    }
  }
  if (await tx.shipmentRepair.findFirst({ where: { repairId }, select: { shipmentId: true } })) throw new Error("発送グループの履歴があります。発送・現物の所在を確認してください。");
  if (await tx.payment.findFirst({ where: { repairId }, select: { id: true } })) throw new Error("前受金・返金の履歴があります。決済を照合してください。");
  if (await tx.invoiceRepairSnapshot.findFirst({ where: { repairId }, select: { id: true } })) throw new Error("請求時の案件スナップショットがあります。請求・入金を照合してください。");
  if (await tx.orderRequest.findFirst({ where: { repairId, status: { not: "cancelled" } }, select: { id: true } })) throw new Error("発注依頼があります。発注・入荷状況を照合してください。");
  if (await tx.repairPartAllocation.findFirst({ where: { repairId, state: { not: "RELEASED" } }, select: { id: true } })) throw new Error("有効な部品割当があります。在庫を照合してください。");
  if (await tx.lineManagerSendOutbox.findFirst({ where: { sourceRepairId: repairId, status: { in: ["APPROVED", "CLAIMED", "PRE_SEND_FAILED", "POST_UNCONFIRMED"] } }, select: { id: true } })) throw new Error("未確定のLINE送信待ちがあります。送信状況を照合してください。");
  if (repair.estimateDocumentId && await tx.lineManagerSendOutbox.findFirst({ where: {
    idempotencyKey: { startsWith: `estimate-document-line:${repair.estimateDocumentId}:` },
    status: { in: ["APPROVED", "CLAIMED", "PRE_SEND_FAILED", "POST_UNCONFIRMED"] },
  }, select: { id: true } })) throw new Error("旧見積のLINE送信待ちがあります。送信状況を照合してください。");
  if (await tx.estimateOptionApproval.findUnique({ where: { repairId }, select: { id: true } }) ||
      await tx.estimateOptionSet.findFirst({ where: { repairId, isActive: true }, select: { id: true } })) {
    throw new Error("選択肢付き見積の承認・設定があります。改訂手続きを確認してください。");
  }
  const items = repair.estimate?.items ?? [];
  const lines = repair.repairLineItems;
  const validNames = (names: string[]) => names.length >= 1 && names.length <= 2 && RETURN_NAMES.has(names[0]) &&
    (names.length === 1 || names[1] === "返送料");
  const expectedName = repair.status === "修理不可返却" ? "修理不可による返却" : "キャンセルによる返却";
  if (!repair.estimate || !validNames(items.map(item => item.itemName)) || items[0]?.itemName !== expectedName ||
      !validNames(lines.map(line => line.itemNameSnapshot)) ||
      items.length !== lines.length || items.some((item, i) => item.itemName !== lines[i].itemNameSnapshot ||
        item.quantity !== 1 || lines[i].quantity !== 1 || item.unitPrice !== lines[i].unitPrice ||
        item.unitPrice < 0 || item.type !== "labor" || item.partsMasterId != null || item.sourceAreaSnapshot != null ||
        item.categoryNameSnapshot != null || item.targetPartNameSnapshot != null || item.actionNameSnapshot != null || item.detailLabelSnapshot != null) ||
      lines.some(line => line.lineType !== "LABOR" || line.partsMasterId != null || line.pricingRuleId != null ||
        line.repairWorkCategoryId != null || line.repairWorkActionId != null || line.targetPartNameId != null ||
        line.categoryNameSnapshot != null || line.targetPartNameSnapshot != null || line.actionNameSnapshot != null || line.detailLabelSnapshot != null)) {
    throw new Error("現在の明細が返却専用の構成と一致しません。明細を確認してください。");
  }
  const charge = assertYen(items[0].unitPrice);
  const shipping = items.length === 2 ? assertYen(items[1].unitPrice) : 0;
  const mode = repair.estimate.pricingTaxMode;
  if ((mode !== "INCLUSIVE" && mode !== "EXCLUSIVE") || repair.estimate.technicalFee !== charge ||
      repair.estimate.partsTotal !== 0 || repair.estimate.mechanicCost !== 0 || repair.estimate.discountAmount !== 0 ||
      repair.estimate.shipping !== 0) throw new Error("返却時の請求金額を照合できません。再開せず確認してください。");
  const totals = calculateTaxableAmounts(assertYen(charge + shipping), mode);
  if (repair.estimate.taxAmount !== totals.taxAmount || repair.estimate.totalAmount !== totals.totalAmount) {
    throw new Error("返却時の税込金額を照合できません。再開せず確認してください。");
  }
  const latestDocument = await tx.estimateDocument.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  const boundary = latestDocument?.id ?? 0;
  if (repair.estimateDocumentId != null && repair.estimateDocumentId > boundary) throw new Error("旧見積書を照合できません。再開せず確認してください。");
  await tx.repairStatusLog.create({ data: { repairId, status: encodeReopenEvent({ boundary,
    oldDocumentId: repair.estimateDocumentId, charge, shipping, tax: totals.taxAmount,
    total: totals.totalAmount, taxMode: mode }), changedBy: actorId } });
  await tx.estimateItem.deleteMany({ where: { estimateId: repair.estimate.id } });
  await tx.repairLineItem.deleteMany({ where: { repairId } });
  await tx.estimate.update({ where: { id: repair.estimate.id }, data: {
    technicalFee: 0, partsTotal: 0, mechanicCost: 0, discountAmount: 0, shipping: 0, taxAmount: 0, totalAmount: 0,
  } });
  await tx.repair.update({ where: { id: repairId }, data: { status: "見積中", approvalStatus: "pending", approvalDate: null } });
  await tx.repairStatusLog.create({ data: { repairId, status: "見積中", changedBy: actorId } });
  return { status: "見積中" as const };
}
