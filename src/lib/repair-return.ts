import type { Prisma } from "@prisma/client";
import { calculateTaxableAmounts, assertYen } from "@/lib/pricing-tax";
import { replaceRepairLineItems } from "@/lib/repair-line-items";
import { persistManualRepairStatus } from "@/lib/repair-manual-status";

export type RepairReturnOutcome = "修理不可返却" | "キャンセル返却";

export function repairReturnLines(outcome: RepairReturnOutcome, charge: number, shipping: number) {
  if (outcome !== "修理不可返却" && outcome !== "キャンセル返却") throw new Error("返却理由を選択してください。");
  assertYen(charge);
  assertYen(shipping);
  return [
    { name: outcome === "修理不可返却" ? "修理不可による返却" : "キャンセルによる返却", amount: charge },
    ...(shipping > 0 ? [{ name: "返送料", amount: shipping }] : []),
  ];
}

/** Changes only current billing and case state. Issued document/PDF snapshots stay intact. */
export async function applyRepairReturn(
  tx: Prisma.TransactionClient,
  repairId: number,
  actorId: number | null,
  input: { outcome: RepairReturnOutcome; charge: number; shipping: number },
  persist: typeof persistManualRepairStatus = persistManualRepairStatus,
) {
  const lines = repairReturnLines(input.outcome, input.charge, input.shipping);
  // Serialize with other writes to this Repair; the route owns the transaction.
  await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} FOR UPDATE`;
  const repair = await tx.repair.findUnique({ where: { id: repairId }, select: { status: true, invoiceId: true, deliveryNoteId: true, estimate: { select: { id: true, pricingTaxMode: true } } } });
  if (!repair) throw new Error("案件が見つかりません。");
  if (["納品済み", "修理不可返却", "キャンセル返却", "キャンセル"].includes(repair.status)) throw new Error("返却処理済み、キャンセル済み、または納品済みの案件です。");
  if (repair.status === "送付待ち") throw new Error("未受領の案件は返却処理できません。通常のキャンセルを使用してください。");
  if (repair.invoiceId !== null) throw new Error("請求書が発行済みです。請求・入金を照合してから返却処理してください。");
  if (repair.deliveryNoteId !== null) throw new Error("納品書が発行済みです。納品書を取消・再発行・照合してから返却処理してください。");
  const pendingPrepayment = await tx.payment.findFirst({
    where: { repairId, kind: "REPAIR_PREPAYMENT", status: "PENDING" }, select: { id: true },
  });
  if (pendingPrepayment) throw new Error("未決済の前受金があります。返却処理の前に前受金を取消・照合してください。");
  const consumed = await tx.repairPartAllocation.findFirst({
    where: { repairId, state: "CONSUMED" }, select: { id: true },
  });
  if (consumed) throw new Error("消費済み部品割当があります。部品の扱いを手動で照合してから返却処理してください。");
  const mode = repair.estimate?.pricingTaxMode === "INCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE";
  const lineSum = assertYen(input.charge + input.shipping);
  const totals = calculateTaxableAmounts(lineSum, mode);
  const estimate = await tx.estimate.upsert({
    where: { repairId },
    create: { repairId, pricingTaxMode: mode, technicalFee: input.charge, partsTotal: 0, mechanicCost: 0, discountAmount: 0, shipping: 0, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount },
    update: { technicalFee: input.charge, partsTotal: 0, mechanicCost: 0, discountAmount: 0, shipping: 0, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount },
  });
  await tx.estimateItem.deleteMany({ where: { estimateId: estimate.id } });
  await tx.estimateItem.createMany({ data: lines.map(line => ({ estimateId: estimate.id, itemName: line.name, type: "labor", quantity: 1, unitPrice: line.amount })) });
  await replaceRepairLineItems(repairId, lines.map((line, sortOrder) => ({
    lineType: "LABOR", itemNameSnapshot: line.name, estimateDisplayNameSnapshot: line.name,
    b2bDisplayNameSnapshot: line.name, b2cDisplayNameSnapshot: line.name,
    quantity: 1, unitPrice: line.amount, sortOrder, showPriceB2b: true, showPriceB2c: true,
  })), tx);
  const status = await persist(tx, repairId, input.outcome, actorId, undefined, undefined, { allowReturnStatus: true });
  if (status.repair.status !== input.outcome) throw new Error("返却ステータスの確定に失敗しました。");
  return { repair: status.repair, estimate, totals };
}
