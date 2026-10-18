import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseRepairIds, parseRepairTagReleaseRequest, previewRepairTagRelease, releaseRepairTags } from "@/lib/repair-tag-release";
import { shipmentTagReleaseFailure } from "@/lib/shipment-tag-release";

export const dynamic = "force-dynamic";

async function adminId(): Promise<number | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
  return admin?.id ?? null;
}

function failure(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  const result = shipmentTagReleaseFailure(error);
  if (result.status === 500) console.error("Repair PhysicalTag release failed", error);
  return NextResponse.json({ error: result.status === 500 ? "NFCタグ割当の解除に失敗しました。" : result.message }, { status: result.status });
}

export async function POST(request: Request) {
  if (!(await adminId())) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    return NextResponse.json(await previewRepairTagRelease(prisma, parseRepairIds(await request.json())));
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  const operatorId = await adminId();
  if (!operatorId) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    return NextResponse.json(await releaseRepairTags(prisma, parseRepairTagReleaseRequest(await request.json()), operatorId));
  } catch (error) { return failure(error); }
}
