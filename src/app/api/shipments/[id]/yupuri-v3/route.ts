import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { shipmentFailure, shipmentId } from "@/lib/shipment";
import { YupuriV3Error, yupuriV3Csv } from "@/lib/yupuri-v3";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!admin) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const id = shipmentId((await params).id);
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      select: {
        id: true, direction: true, status: true, actualShippedAt: true,
        plannedShipDate: true, requestedDeliveryDate: true,
        requestedDeliveryTimeSlot: true, destinationRecipientName: true, destinationPostalCode: true,
        destinationPrefecture: true, destinationCity: true, destinationStreet: true,
        destinationBuilding: true, destinationPhone: true,
      },
    });
    if (!shipment) return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    const bytes = yupuriV3Csv(shipment);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "text/csv; charset=Shift_JIS",
        "Content-Disposition": `attachment; filename="yupuri-v3-shipment-${id}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof YupuriV3Error)
      return NextResponse.json({ error: error.message }, { status: error.status });
    const failure = shipmentFailure(error);
    if (failure.status === 500) console.error("Yu-Pack V3 export failed", error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
