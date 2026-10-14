import { getAdminApiIdentity } from "@/lib/admin-api-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseManualDate, persistManualRepairStatus } from "@/lib/repair-manual-status";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminApiIdentity();
  if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  const repairId = Number((await params).id);
  const { status, date } = await req.json();

  if (!Number.isInteger(repairId) || typeof status !== "string") {
    return NextResponse.json({ error: "Invalid repair or status" }, { status: 400 });
  }

  try {
    const selectedDate = date === undefined ? undefined : parseManualDate(date);
    const result = await prisma.$transaction((tx) => persistManualRepairStatus(tx, repairId, status, admin.id, selectedDate));
    return NextResponse.json({ repair: result.repair, warnings: [], reconciliation: result.reconciliation, normalized: result.repair.status !== status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新に失敗しました。" }, { status: 400 });
  }
}
