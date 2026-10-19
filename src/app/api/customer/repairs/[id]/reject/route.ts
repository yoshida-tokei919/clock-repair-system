import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { addStatusLogIfMissing, findRepairIdByPublicToken } from "../_workflow";
import { lockEstimateOptions } from "@/lib/estimate-options";

const REJECT_STATUS = "保留";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = await request.json().catch(() => null);
  const reason = typeof body?.body === "string" ? body.body.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "差戻し理由を入力してください。" }, { status: 400 });
  }

  const repairId = await findRepairIdByPublicToken((await params).id);
  if (!repairId) {
    return NextResponse.json({ error: "修理案件が見つかりません。" }, { status: 404 });
  }

  try {
  const result = await prisma.$transaction(async (tx) => {
    await lockEstimateOptions(tx, repairId);
    await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} FOR UPDATE`;
    const repair = await tx.repair.findUnique({
      where: { id: repairId },
      select: { id: true, status: true },
    });

    if (!repair) {
      throw new Error("修理案件が見つかりません。");
    }
    if (await tx.estimateOptionApproval.findUnique({ where: { repairId }, select: { id: true } })) {
      throw new Error("選択承認済みの見積は差戻しできません。改訂手続きが必要です。");
    }

    if (repair.status === "キャンセル") {
      throw new Error("キャンセル済みの案件は差戻しできません。");
    }
    if (["修理不可返却", "キャンセル返却"].includes(repair.status)) {
      throw new Error("返却処理済みの案件は差戻しできません。");
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
  } catch (error) {
    if (error instanceof Error && error.message === "選択承認済みの見積は差戻しできません。改訂手続きが必要です。") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
