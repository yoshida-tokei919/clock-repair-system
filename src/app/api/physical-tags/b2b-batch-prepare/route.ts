import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { B2bBatchTagError, parseB2bBatchTagInput, prepareB2bBatchPhysicalTags } from "@/lib/b2b-batch-physical-tags";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    const repairIds = parseB2bBatchTagInput(await request.json());
    return NextResponse.json({ labels: await prepareB2bBatchPhysicalTags(prisma, repairIds, admin.id) },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
    if (error instanceof B2bBatchTagError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("B2B batch PhysicalTag preparation failed", error);
    return NextResponse.json({ error: "管理タグの準備に失敗しました。再度準備できます。" }, { status: 500 });
  }
}
