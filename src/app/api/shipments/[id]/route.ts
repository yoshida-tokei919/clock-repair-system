import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseShipmentUpdate, readShipment, shipmentFailure, shipmentId, updateShipment } from "@/lib/shipment";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function authorized() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return false;
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
  return Boolean(admin);
}

function failureResponse(error: unknown) {
  const failure = shipmentFailure(error);
  if (failure.status === 500) console.error("Shipment request failed", error);
  return NextResponse.json({ error: failure.message }, { status: failure.status });
}

export async function GET(_request: Request, { params }: Context) {
  if (!(await authorized())) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    return NextResponse.json(await readShipment(prisma, shipmentId((await params).id)));
  } catch (error) {
    return failureResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  if (!(await authorized())) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  let id;
  let data;
  try {
    id = shipmentId((await params).id);
    data = parseShipmentUpdate(await request.json());
  } catch (error) {
    const failure = shipmentFailure(error);
    return NextResponse.json({ error: failure.status === 500 ? "入力が不正です。" : failure.message }, { status: 400 });
  }
  try {
    return NextResponse.json(await updateShipment(prisma, id, data));
  } catch (error) {
    return failureResponse(error);
  }
}
