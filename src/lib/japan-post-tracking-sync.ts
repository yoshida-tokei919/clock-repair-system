import { Prisma, type PrismaClient, type ShipmentStatus } from "@prisma/client";
import {
  JAPAN_POST_POLL_STATUSES,
  previewJapanPostTrackingCsv,
  type JapanPostTrackingPreview,
} from "./japan-post-tracking";
import type { ShipmentStatusCandidate } from "./yupuri-history";

export type JapanPostSyncResult = {
  shipmentId: number | null;
  state: ShipmentStatusCandidate | null;
  outcome: "UPDATED" | "NO_CHANGE" | "SKIPPED";
  actualShippedAt: string | null;
  deliveredAt: string | null;
  errors: string[];
};

type SyncDb = Pick<PrismaClient, "$transaction" | "shipment">;

export function parseYuPriOperationTimestamp(raw: string): Date | null {
  if (!/^\d{14}$/.test(raw)) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10));
  const minute = Number(raw.slice(10, 12));
  const second = Number(raw.slice(12, 14));
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31 ||
      hour > 23 || minute > 59 || second > 59) return null;
  const value = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
  const jst = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  if (jst.getUTCFullYear() !== year || jst.getUTCMonth() + 1 !== month || jst.getUTCDate() !== day ||
      jst.getUTCHours() !== hour || jst.getUTCMinutes() !== minute || jst.getUTCSeconds() !== second) return null;
  return value;
}

const nextStates: Readonly<Record<string, readonly ShipmentStatusCandidate[]>> = {
  LABEL_ISSUED: ["AWAITING_ACCEPTANCE", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"],
  AWAITING_ACCEPTANCE: ["AWAITING_ACCEPTANCE", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"],
  SHIPPED: ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"],
  IN_TRANSIT: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"],
  OUT_FOR_DELIVERY: ["OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"],
  EXCEPTION: ["EXCEPTION", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"],
};

export function canApplyJapanPostState(current: string, next: ShipmentStatusCandidate): boolean {
  return nextStates[current]?.includes(next) ?? false;
}

function skipped(row: JapanPostTrackingPreview, error: string): JapanPostSyncResult {
  return {
    shipmentId: row.shipmentId,
    state: row.state,
    outcome: "SKIPPED",
    actualShippedAt: null,
    deliveredAt: null,
    errors: [...row.errors, error],
  };
}

async function syncCandidate(db: SyncDb, row: JapanPostTrackingPreview): Promise<JapanPostSyncResult> {
  if (!row.candidate || row.shipmentId === null || row.state === null) {
    return skipped(row, "CSV row is not an eligible synchronization candidate");
  }
  const shipmentId = row.shipmentId;
  const nextState = row.state;
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT "id" FROM "Shipment" WHERE "id" = ${shipmentId} FOR UPDATE`;
    const shipment = await tx.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true, direction: true, carrierCode: true, status: true, trackingNumber: true,
        actualShippedAt: true, deliveredAt: true,
      },
    });
    if (!shipment || shipment.direction !== "OUTBOUND" || shipment.carrierCode !== "JAPAN_POST" ||
        shipment.trackingNumber !== row.trackingNumber ||
        !JAPAN_POST_POLL_STATUSES.includes(shipment.status as ShipmentStatus)) {
      return skipped(row, "Shipment changed after CSV preview");
    }
    if (!canApplyJapanPostState(shipment.status, nextState)) {
      return skipped(row, `Refusing stale or regressive transition ${shipment.status} -> ${nextState}`);
    }

    let actualShippedAt = shipment.actualShippedAt;
    if (nextState !== "AWAITING_ACCEPTANCE" && !actualShippedAt) {
      actualShippedAt = parseYuPriOperationTimestamp(row.acceptanceRaw);
      if (!actualShippedAt) return skipped(row, "Acceptance timestamp is missing or is not verified 14-digit JST format");
    }
    let deliveredAt = shipment.deliveredAt;
    if (nextState === "DELIVERED" && !deliveredAt) {
      deliveredAt = parseYuPriOperationTimestamp(row.deliveryCompletionRaw);
      if (!deliveredAt) return skipped(row, "Delivery timestamp is missing or is not verified 14-digit JST format");
      if (actualShippedAt && deliveredAt.getTime() < actualShippedAt.getTime()) {
        return skipped(row, "Delivery timestamp precedes acceptance timestamp");
      }
    }

    const changed = shipment.status !== nextState ||
      shipment.actualShippedAt?.getTime() !== actualShippedAt?.getTime() ||
      shipment.deliveredAt?.getTime() !== deliveredAt?.getTime();
    if (!changed) {
      return {
        shipmentId: shipment.id,
        state: nextState,
        outcome: "NO_CHANGE" as const,
        actualShippedAt: actualShippedAt?.toISOString() ?? null,
        deliveredAt: deliveredAt?.toISOString() ?? null,
        errors: [],
      };
    }
    await tx.shipment.update({
      where: { id: shipment.id },
      data: { status: nextState, actualShippedAt, deliveredAt },
    });
    return {
      shipmentId: shipment.id,
      state: nextState,
      outcome: "UPDATED" as const,
      actualShippedAt: actualShippedAt?.toISOString() ?? null,
      deliveredAt: deliveredAt?.toISOString() ?? null,
      errors: [],
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function syncJapanPostTrackingCsv(db: SyncDb, bytes: Buffer): Promise<JapanPostSyncResult[]> {
  const preview = await previewJapanPostTrackingCsv(db, bytes);
  const results: JapanPostSyncResult[] = [];
  for (const row of preview) results.push(await syncCandidate(db, row));
  return results;
}
