import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createShipment, parseShipmentCreate, shipmentFailure } from "@/lib/shipment";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!admin) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  let input;
  try {
    input = parseShipmentCreate(await request.json());
  } catch (error) {
    const failure = shipmentFailure(error);
    return NextResponse.json({ error: failure.status === 500 ? "入力が不正です。" : failure.message }, { status: 400 });
  }
  try {
    return NextResponse.json(await createShipment(prisma, input), { status: 201 });
  } catch (error) {
    const failure = shipmentFailure(error);
    if (failure.status === 500) console.error("Shipment create failed", error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
