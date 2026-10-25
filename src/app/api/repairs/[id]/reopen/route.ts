import { NextResponse } from "next/server";
import { getAdminApiIdentity } from "@/lib/admin-api-auth";
import { prisma } from "@/lib/prisma";
import { reopenReturnedRepair } from "@/lib/repair-reopen";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminApiIdentity();
  if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "案件IDが不正です。" }, { status: 400 });
  try {
    const result = await prisma.$transaction(tx => reopenReturnedRepair(tx, id, admin.id),
      { isolationLevel: "Serializable", timeout: 20000 });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "再開に失敗しました。" }, { status: 409 });
  }
}
