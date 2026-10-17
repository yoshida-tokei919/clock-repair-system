import { NextResponse } from "next/server";
import { getAdminApiIdentity } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { applyRepairReturn } from "@/lib/repair-return";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminApiIdentity();
  if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "案件IDが不正です。" }, { status: 400 });
    const body = await req.json();
    const result = await prisma.$transaction(tx => applyRepairReturn(tx, id, admin.id, {
      outcome: body.outcome, charge: body.charge, shipping: body.shipping,
    }), { timeout: 20000, isolationLevel: "Serializable" });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "返却処理に失敗しました。" }, { status: 400 });
  }
}
