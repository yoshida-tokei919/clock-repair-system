import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { assertApprovalReturnAddress } from "@/lib/return-address";
import { reconcileRepairPartAllocations } from "@/lib/repair-part-allocation";
import { assertNoUnansweredAlternatives, lockEstimateOptions, UnansweredEstimateOptionsError } from "@/lib/estimate-options";
import { findRepairIdByPublicToken } from "../_workflow";
import { assertFreshReopenEstimate, isEstimateDocumentArchived, ReopenApprovalError } from "@/lib/repair-reopen-approval";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const repairId = await findRepairIdByPublicToken((await params).id);
  if (!repairId) {
    return NextResponse.json({ error: "修理案件が見つかりません。" }, { status: 404 });
  }

  try {
  const result = await prisma.$transaction(async (tx) => {
    await lockEstimateOptions(tx, repairId);
    await assertNoUnansweredAlternatives(tx, repairId);
    const repair = await tx.repair.findUnique({
      where: { id: repairId },
      include: {
        customer: { select: { type: true } },
        estimate: { include: { items: true } },
        orderRequests: {
          where: { status: { in: ["pending", "ordered", "received"] } },
          select: { status: true },
        },
      },
    });

    if (!repair) {
      throw new Error("修理案件が見つかりません。");
    }
    if (repair.estimateDocumentId && await isEstimateDocumentArchived(tx, repair.estimateDocumentId)) {
      throw new ReopenApprovalError("再開前の見積書は履歴です。新しい見積書を確認してください。");
    }

    if (repair.status === "キャンセル") {
      throw new Error("キャンセル済みの案件は承認できません。");
    }
    if (["修理不可返却", "キャンセル返却"].includes(repair.status)) {
      throw new Error("返却処理済みの案件は承認できません。");
    }
    await assertFreshReopenEstimate(tx, repairId, repair);

    if (repair.customer.type === "individual") {
      try {
        assertApprovalReturnAddress(repair.customer.type, repair);
      } catch {
        throw new Error("返送先を確認・入力してから承認してください。");
      }
    }

    const approvalDate = new Date();
    const updateResult = await tx.repair.updateMany({
      where: { id: repair.id, approvalStatus: { not: "approved" } },
      data: {
        approvalStatus: "approved",
        approvalDate,
      },
    });

    if (updateResult.count === 0) {
      throw new Error("この案件はすでに承認済みです。");
    }

    await reconcileRepairPartAllocations(tx, repair.id, {
      allowAdvanceFromApproval: true,
    });

    return tx.repair.findUniqueOrThrow({ where: { id: repair.id } });
  });

  return NextResponse.json({ success: true, repair: result });
  } catch (error) {
    if (error instanceof ReopenApprovalError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof UnansweredEstimateOptionsError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
