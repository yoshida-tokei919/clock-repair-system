import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { applyRepairReturn } from "@/lib/repair-return";
import { findRepairIdByPublicToken } from "../_workflow";

class CustomerCancelReturnError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const repairId = await findRepairIdByPublicToken((await params).id);
  if (!repairId) {
    return NextResponse.json({ error: "修理案件が見つかりません。" }, { status: 404 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const repair = await tx.repair.findUnique({
        where: { id: repairId },
        select: { id: true, customer: { select: { type: true } } },
      });
      if (!repair || repair.customer.type !== "business") {
        throw new CustomerCancelReturnError("この操作は取引先共有ページでのみ利用できます。", 403);
      }

      const returned = await applyRepairReturn(tx, repair.id, null, {
        outcome: "キャンセル返却",
        charge: 0,
        shipping: 0,
      });

      await tx.repairCustomerMessage.create({
        data: {
          repairId: repair.id,
          body: "取引先が共有ページからキャンセル・返却を選択しました。",
          senderType: "partner",
        },
      });

      return returned;
    }, { timeout: 20000, isolationLevel: "Serializable" });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const status = error instanceof CustomerCancelReturnError ? error.status : 409;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "キャンセル・返却処理に失敗しました。" },
      { status },
    );
  }
}
