import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRepairDeliveryPreferenceForAdmin } from "@/lib/repair-delivery-preference";
import { getRepairDeliveryShipments, RepairDeliveryRequestNotFoundError } from "@/lib/repair-delivery-request";
import { YUPURI_DELIVERY_TIME_OPTIONS } from "@/lib/yupuri-v3";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } }))
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  const rawId = (await params).id;
  const repairId = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isInteger(repairId) || repairId < 1 || repairId > 2147483647)
    return NextResponse.json({ error: "修理案件IDが不正です。" }, { status: 400 });
  try {
    const shipments = await getRepairDeliveryShipments(prisma, repairId);
    const customerResponse = await getRepairDeliveryPreferenceForAdmin(prisma, repairId);
    return NextResponse.json({ shipments, customerResponse, timeOptions: YUPURI_DELIVERY_TIME_OPTIONS });
  } catch (error) {
    if (error instanceof RepairDeliveryRequestNotFoundError)
      return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("Repair delivery shipments read failed", error);
    return NextResponse.json({ error: "発送候補を読み込めませんでした。" }, { status: 500 });
  }
}
