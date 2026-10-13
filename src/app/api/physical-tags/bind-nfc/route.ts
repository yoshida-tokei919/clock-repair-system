import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bindPhysicalTagNfcUid, parsePhysicalTagNfcBind, physicalTagNfcBindFailure } from "@/lib/physical-tag-nfc-bind";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });

  let input;
  try {
    input = parsePhysicalTagNfcBind(await request.json());
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }
  try {
    return NextResponse.json(await bindPhysicalTagNfcUid(prisma, input),
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = physicalTagNfcBindFailure(error);
    if (failure.status === 500) console.error("PhysicalTag NFC binding failed");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
