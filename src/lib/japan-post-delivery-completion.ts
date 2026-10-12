import { Prisma, type PrismaClient } from "@prisma/client";
import { syncJapanPostTrackingCsvWithNotices, type ShippingNoticeQueueResult } from "./japan-post-shipping-notice";
import type { JapanPostSyncResult } from "./japan-post-tracking-sync";

export type RepairDeliveryCompletionResult = {
  shipmentId: number;
  repairId: number;
  outcome: "UPDATED" | "NO_CHANGE" | "SKIPPED";
  reason?: string;
  deliveryDateActual?: string;
};

type CompletionDb = Pick<PrismaClient, "$transaction" | "shipment" | "repair" | "repairStatusLog">;

function maxDate(values: Date[]): Date {
  return new Date(Math.max(...values.map(value => value.getTime())));
}

export async function finalizeDeliveredShipmentRepairs(
  db: CompletionDb,
  shipmentId: number,
): Promise<RepairDeliveryCompletionResult[]> {
  if (!Number.isSafeInteger(shipmentId) || shipmentId <= 0) return [];
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT "id" FROM "Shipment" WHERE "id" = ${shipmentId} FOR UPDATE`;
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true, direction: true, status: true, deliveredAt: true,
        repairs: { select: { repairId: true }, orderBy: { repairId: "asc" } },
      },
    });
    if (!shipment || shipment.direction !== "OUTBOUND" || shipment.status !== "DELIVERED" || !shipment.deliveredAt) return [];

    const repairIds = [...new Set(shipment.repairs.map(link => link.repairId))].sort((a, b) => a - b);
    for (const repairId of repairIds) {
      await tx.$queryRaw`SELECT "id" FROM "Repair" WHERE "id" = ${repairId} FOR UPDATE`;
    }

    const results: RepairDeliveryCompletionResult[] = [];
    for (const repairId of repairIds) {
      const repair = await tx.repair.findUnique({
        where: { id: repairId },
        select: {
          id: true, status: true, deliveryDateActual: true,
          shipmentRepairs: { select: { shipment: { select: {
            direction: true, status: true, deliveredAt: true,
          } } } },
        },
      });
      if (!repair) {
        results.push({ shipmentId, repairId, outcome: "SKIPPED", reason: "repair_not_found" });
        continue;
      }
      const outbound = repair.shipmentRepairs
        .map(link => link.shipment)
        .filter(item => item.direction === "OUTBOUND" && item.status !== "CANCELLED");
      if (!outbound.length || outbound.some(item => item.status !== "DELIVERED" || !item.deliveredAt)) {
        results.push({ shipmentId, repairId, outcome: "SKIPPED", reason: "outstanding_shipments" });
        continue;
      }
      const deliveryDateActual = maxDate(outbound.map(item => item.deliveredAt as Date));
      if (repair.status === "納品済み") {
        results.push({
          shipmentId, repairId, outcome: "NO_CHANGE",
          deliveryDateActual: repair.deliveryDateActual?.toISOString() ?? deliveryDateActual.toISOString(),
        });
        continue;
      }
      if (repair.status !== "作業完了") {
        results.push({ shipmentId, repairId, outcome: "SKIPPED", reason: "repair_status_changed" });
        continue;
      }
      await tx.repair.update({
        where: { id: repair.id },
        data: { status: "納品済み", deliveryDateActual },
      });
      await tx.repairStatusLog.create({
        data: { repairId: repair.id, status: "納品済み", changedBy: null },
      });
      results.push({ shipmentId, repairId, outcome: "UPDATED", deliveryDateActual: deliveryDateActual.toISOString() });
    }
    return results;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function syncJapanPostTrackingDeliveryFlow(
  db: CompletionDb,
  bytes: Buffer,
  sync: typeof syncJapanPostTrackingCsvWithNotices = syncJapanPostTrackingCsvWithNotices,
  finalize: typeof finalizeDeliveredShipmentRepairs = finalizeDeliveredShipmentRepairs,
): Promise<{
  tracking: JapanPostSyncResult[];
  notices: ShippingNoticeQueueResult[];
  repairs: RepairDeliveryCompletionResult[];
}> {
  const base = await sync(db, bytes);
  const repairs: RepairDeliveryCompletionResult[] = [];
  const deliveredShipmentIds = [...new Set(base.tracking
    .filter(item => item.outcome !== "SKIPPED" && item.state === "DELIVERED" && item.deliveredAt && item.shipmentId)
    .map(item => item.shipmentId as number))];
  for (const shipmentId of deliveredShipmentIds) {
    repairs.push(...await finalize(db, shipmentId));
  }
  return { ...base, repairs };
}
