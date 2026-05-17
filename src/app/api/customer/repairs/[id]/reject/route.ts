import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { addStatusLogIfMissing, findRepairIdByIdOrToken } from "../_workflow";

const REJECT_STATUS = "保留";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => null);
  const reason = typeof body?.body === "string" ? body.body.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "差戻し理由を入力してください。" }, { status: 400 });
  }

  const repairId = await findRepairIdByIdOrToken(params.id);
  if (!repairId) {
    return NextResponse.json({ error: "修理案件が見つかりません。" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUnique({
      where: { id: repairId },
      select: { id: true, status: true },
    });

    if (!repair) {
      throw new Error("修理案件が見つかりません。");
    }

    if (repair.status === "キャンセル") {
      throw new Error("キャンセル済みの案件は差戻しできません。");
    }

    const updated = await tx.repair.update({
      where: { id: repair.id },
      data: {
        status: REJECT_STATUS,
        approvalStatus: "rejected",
      },
    });

    await tx.repairCustomerMessage.create({
      data: {
        repairId: repair.id,
        body: `差戻し: ${reason.slice(0, 500)}`,
      },
    });
    await addStatusLogIfMissing(tx, repair.id, REJECT_STATUS);

    return updated;
  });

  return NextResponse.json({ success: true, repair: result });
}
