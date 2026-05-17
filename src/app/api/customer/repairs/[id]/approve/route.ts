import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
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

    const hasPartItems = (repair.estimate?.items ?? []).some(
      (item) => item.type === "part" || !!item.partsMasterId
    );
    const nextStatus = getApprovedRepairStatus({
      hasPartItems,
      orderStatuses: repair.orderRequests.map((order) => order.status as RepairPartsOrderStatus),
    });

    const updated = await tx.repair.update({
      where: { id: repair.id },
      data: {
        status: nextStatus,
        approvalStatus: "approved",
        approvalDate: new Date(),
      },
    });

    await addStatusLogIfMissing(tx, repair.id, nextStatus);

    return updated;
  });

  return NextResponse.json({ success: true, repair: result });
}
