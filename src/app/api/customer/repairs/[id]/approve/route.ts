import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { assertApprovalReturnAddress } from "@/lib/return-address";
import type { RepairPartsOrderStatus } from "@/lib/repair-parts-status";
import { addStatusLogIfMissing, findRepairIdByIdOrToken, getApprovedRepairStatus } from "../_workflow";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const repairId = await findRepairIdByIdOrToken(params.id);
  if (!repairId) {
    return NextResponse.json({ error: "修理案件が見つかりません。" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
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

    if (repair.status === "キャンセル") {
      throw new Error("キャンセル済みの案件は承認できません。");
    }

    if (repair.customer.type === "individual") {
      try {
        assertApprovalReturnAddress(repair.customer.type, repair);
      } catch {
        throw new Error("返送先を確認・入力してから承認してください。");
      }
    }

    const hasPartItems = (repair.estimate?.items ?? []).some(
      (item) => item.type === "part" || !!item.partsMasterId
    );
    const nextStatus = getApprovedRepairStatus({
      hasPartItems,
      orderStatuses: repair.orderRequests.map((order) => order.status as RepairPartsOrderStatus),
    });

    const approvalDate = new Date();
    const updateResult = await tx.repair.updateMany({
      where: { id: repair.id, approvalStatus: { not: "approved" } },
      data: {
        status: nextStatus,
        approvalStatus: "approved",
        approvalDate,
      },
    });

    if (updateResult.count === 0) {
      throw new Error("この案件はすでに承認済みです。");
    }

    await addStatusLogIfMissing(tx, repair.id, nextStatus);

    return tx.repair.findUniqueOrThrow({ where: { id: repair.id } });
  });

  return NextResponse.json({ success: true, repair: result });
}
