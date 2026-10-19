import type { Prisma } from "@prisma/client";

import { approvalAuditStatus, APPROVAL_EVENT_PREFIX } from "@/lib/repair-approval-audit";
import { addConfirmedRepairStatusLog, reconcileRepairPartAllocations } from "@/lib/repair-part-allocation";
import { assertApprovalReturnAddress } from "@/lib/return-address";
import { assertNoUnansweredAlternatives } from "@/lib/estimate-options";

export async function recordManualApproval(
  tx: Prisma.TransactionClient,
  repairId: number,
  approvalDate: Date,
  actorId: number,
  reconcile: typeof reconcileRepairPartAllocations = reconcileRepairPartAllocations,
) {
  const current = await tx.repair.findUnique({
    where: { id: repairId },
    include: { customer: { select: { type: true } }, estimate: { include: { items: true } } },
  });
  if (!current) throw new Error("修理案件が見つかりません。");
  await assertNoUnansweredAlternatives(tx, repairId);
  if (current.status === "キャンセル") throw new Error("キャンセル済みの案件は承認できません。");
  if (["修理不可返却", "キャンセル返却"].includes(current.status)) throw new Error("返却処理済みの案件は承認できません。");
  if (!current.estimate?.items.some((item) => item.itemName.trim() && item.quantity > 0 && item.unitPrice >= 0)) {
    throw new Error("承認前に見積明細を保存してください。");
  }
  if (current.customer.type === "individual") {
    try { assertApprovalReturnAddress(current.customer.type, current); }
    catch { throw new Error("返送先を確認・入力してから承認してください。"); }
  }
  if (current.approvalStatus === "approved" && current.approvalDate?.getTime() === approvalDate.getTime()) {
    return current;
  }

  const priorLog = await tx.repairStatusLog.findFirst({ where: { repairId }, orderBy: { id: "desc" }, select: { id: true } });
  await tx.repair.update({ where: { id: repairId }, data: { approvalStatus: "approved", approvalDate } });
  if (current.approvalStatus !== "approved" && ["見積中", "承認待ち"].includes(current.status)) {
    const result = await reconcile(tx, repairId, { allowAdvanceFromApproval: true });
    if (result.status !== current.status) await addConfirmedRepairStatusLog(tx, repairId, result.status);
  }
  await tx.repairStatusLog.updateMany({
    where: { repairId, id: { gt: priorLog?.id ?? 0 }, status: { not: { startsWith: APPROVAL_EVENT_PREFIX } } },
    data: { changedBy: actorId },
  });
  await tx.repairStatusLog.create({
    data: {
      repairId,
      status: approvalAuditStatus(current.approvalStatus === "approved" ? "DATE_CORRECTED" : "RECORDED", approvalDate),
      changedBy: actorId,
    },
  });
  return tx.repair.findUniqueOrThrow({ where: { id: repairId } });
}
