import type { PrismaClient, ShipmentStatus } from "@prisma/client";

export class RepairDeliveryRequestNotFoundError extends Error {}

export type RepairDeliveryShipment = {
  id: number;
  status: ShipmentStatus;
  plannedShipDate: string | null;
  requestedDeliveryDate: string | null;
  requestedDeliveryTimeSlot: string | null;
  inquiryNumbers: (string | null)[];
};

export async function getRepairDeliveryShipments(db: PrismaClient, repairId: number): Promise<RepairDeliveryShipment[]> {
  const repair = await db.repair.findUnique({ where: { id: repairId }, select: { id: true } });
  if (!repair) throw new RepairDeliveryRequestNotFoundError("Repairが見つかりません。");

  const shipments = await db.shipment.findMany({
    where: {
      repairs: { some: { repairId } },
      direction: "OUTBOUND",
      actualShippedAt: null,
      status: { not: "CANCELLED" },
    },
    select: {
      id: true, status: true, plannedShipDate: true,
      requestedDeliveryDate: true, requestedDeliveryTimeSlot: true,
      repairs: { select: { repair: { select: { inquiryNumber: true } } } },
    },
    orderBy: { id: "asc" },
  });
  return shipments.map(shipment => ({
    id: shipment.id,
    status: shipment.status,
    plannedShipDate: shipment.plannedShipDate?.toISOString().slice(0, 10) ?? null,
    requestedDeliveryDate: shipment.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    requestedDeliveryTimeSlot: shipment.requestedDeliveryTimeSlot,
    inquiryNumbers: shipment.repairs.map(({ repair }) => repair.inquiryNumber),
  }));
}

export function initialDeliveryShipmentId(shipments: readonly Pick<RepairDeliveryShipment, "id">[]): number | null {
  return shipments.length === 1 ? shipments[0].id : null;
}

export function canEditDeliveryShipment(shipment: Pick<RepairDeliveryShipment, "status">): boolean {
  return shipment.status === "DRAFT";
}

export function deliveryPatchPayload(date: string, timeSlot: string) {
  return { requestedDeliveryDate: date || null, requestedDeliveryTimeSlot: timeSlot || null };
}
