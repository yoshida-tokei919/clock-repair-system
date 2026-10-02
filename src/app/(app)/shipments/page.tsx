import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tokyoDateKey } from "@/lib/shipment-schedule";
import ShipmentsClient, { type ScheduleShipment } from "./ShipmentsClient";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!admin) redirect("/login");

  const shipments = await prisma.shipment.findMany({
    where: { direction: "OUTBOUND", actualShippedAt: null, status: { not: "CANCELLED" } },
    orderBy: [{ plannedShipDate: "asc" }, { id: "asc" }],
    select: {
      id: true, status: true, plannedShipDate: true, actualShippedAt: true,
      requestedDeliveryDate: true, requestedDeliveryTimeSlot: true, labelIssuedAt: true,
      carrierCode: true, serviceCode: true, handoffMethod: true,
      customer: { select: { id: true, name: true, type: true } },
      repairs: { select: { repair: { select: {
        id: true, inquiryNumber: true, status: true, deliveryNoteId: true,
      } } } },
    },
  });
  const rows: ScheduleShipment[] = shipments.map(shipment => ({
    ...shipment,
    plannedShipDate: shipment.plannedShipDate?.toISOString().slice(0, 10) ?? null,
    actualShippedAt: shipment.actualShippedAt?.toISOString() ?? null,
    requestedDeliveryDate: shipment.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    labelIssuedAt: shipment.labelIssuedAt?.toISOString() ?? null,
  }));

  return <ShipmentsClient rows={rows} today={tokyoDateKey(new Date())} />;
}
