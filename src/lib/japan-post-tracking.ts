import type { PrismaClient, ShipmentStatus } from "@prisma/client";
import {
  parseYupuriHistory,
  resolveYupuriHistory,
  YUPURI_HISTORY_MAX_BYTES,
  type HistoryRow,
  type ShipmentStatusCandidate,
} from "./yupuri-history";

export const JAPAN_POST_POLL_STATUSES: readonly ShipmentStatus[] = [
  "LABEL_ISSUED",
  "AWAITING_ACCEPTANCE",
  "SHIPPED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "EXCEPTION",
];
export const JAPAN_POST_TRACKING_CSV_MAX_BYTES = YUPURI_HISTORY_MAX_BYTES;

export type JapanPostTrackingPreview = {
  rowNumber: number;
  shipmentId: number | null;
  managementNumber: string;
  trackingNumber: string;
  aggregateStatusCode: string;
  detailStatusCode: string;
  description: string | null;
  state: ShipmentStatusCandidate | null;
  acceptanceRaw: string;
  deliveryCompletionRaw: string;
  currentStatus: string | null;
  carrierCode: string | null;
  candidate: boolean;
  warnings: string[];
  errors: string[];
};

type PreviewDb = Pick<PrismaClient, "shipment">;
function uniqueIds(rows: readonly HistoryRow[]): number[] {
  return [...new Set(rows.flatMap(row => row.resolvedShipmentId === null ? [] : [row.resolvedShipmentId]))];
}

export async function previewJapanPostTrackingCsv(
  db: PreviewDb,
  bytes: Buffer,
): Promise<JapanPostTrackingPreview[]> {
  const parsed = parseYupuriHistory(bytes);
  const ids = uniqueIds(parsed);
  const shipments = ids.length ? await db.shipment.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      direction: true,
      status: true,
      carrierCode: true,
      trackingNumber: true,
      actualShippedAt: true,
      deliveredAt: true,
    },
  }) : [];
  const shipmentById = new Map(shipments.map(shipment => [shipment.id, shipment]));
  const resolved = resolveYupuriHistory(parsed, shipments);

  return resolved.map(row => {
    const errors = [...row.errors];
    const warnings = [...row.warnings];
    const currentStatus = row.currentShipment?.status ?? null;
    const carrierCode = row.resolvedShipmentId === null ? null : shipmentById.get(row.resolvedShipmentId)?.carrierCode ?? null;
    if (row.currentShipment && carrierCode !== "JAPAN_POST") errors.push("Shipment carrier is not Japan Post");
    if (row.currentShipment && !JAPAN_POST_POLL_STATUSES.includes(row.currentShipment.status as ShipmentStatus)) {
      errors.push("Shipment is not an active Japan Post tracking candidate");
    }
    if (row.currentShipment && row.trackingChange !== "NO_CHANGE") {
      errors.push("Shipment tracking number does not exactly match the Cloud CSV");
    }
    const candidate = errors.length === 0 && row.shipmentFound && row.statusCandidate !== null &&
      row.trackingChange === "NO_CHANGE" && currentStatus !== null && carrierCode === "JAPAN_POST" &&
      JAPAN_POST_POLL_STATUSES.includes(currentStatus as ShipmentStatus);
    return {
      rowNumber: row.rowNumber,
      shipmentId: row.resolvedShipmentId,
      managementNumber: row.managementNumber,
      trackingNumber: row.trackingNumberCandidate,
      aggregateStatusCode: row.aggregateStatusCode,
      detailStatusCode: row.detailStatusCode,
      description: row.confirmedDescriptionOrNull,
      state: row.statusCandidate,
      acceptanceRaw: row.acceptanceRelatedValue,
      deliveryCompletionRaw: row.deliveryCompletionCandidate,
      currentStatus,
      carrierCode,
      candidate,
      warnings,
      errors,
    };
  });
}
