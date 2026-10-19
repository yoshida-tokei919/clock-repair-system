import { NextResponse } from "next/server";

import { getAdminApiIdentity } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { parseManualDate } from "@/lib/repair-manual-status";
import { recordManualApproval } from "@/lib/repair-manual-approval";
import { lockEstimateOptions } from "@/lib/estimate-options";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminApiIdentity();
  if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    const repairId = Number((await params).id);
    if (!Number.isSafeInteger(repairId) || repairId <= 0) throw new Error("無効な案件です。");
    const { approvalAt } = await req.json();
    const approvalDate = parseManualDate(approvalAt, true);
    const repair = await prisma.$transaction(async (tx) => {
      await lockEstimateOptions(tx, repairId);
      return recordManualApproval(tx, repairId, approvalDate, admin.id);
    });
    return NextResponse.json({ success: true, repair });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "承認記録に失敗しました。" }, { status: 400 });
  }
}
