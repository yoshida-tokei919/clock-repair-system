import { Prisma, type PrismaClient, type ShipmentHandoffMethod } from "@prisma/client";
import { parseRepairReturnAddress } from "./return-address";

export class ShipmentError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "ShipmentError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new ShipmentError(400, "入力が不正です。");
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new ShipmentError(400, "入力が不正です。");
}

export function shipmentId(value: unknown): number {
  const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || id > 2147483647)
    throw new ShipmentError(400, "発送IDが不正です。");
  return id;
}

export function parseShipmentCreate(body: unknown): { repairIds: number[]; confirmed: true } {
  const value = record(body);
  onlyKeys(value, ["repairIds", "confirmed"]);
  if (value.confirmed !== true) throw new ShipmentError(400, "発送の作成には明示的な確認が必要です。");
  if (!Array.isArray(value.repairIds) || value.repairIds.length < 1 || value.repairIds.length > 100)
    throw new ShipmentError(400, "修理案件の件数が不正です。");
  const ids = value.repairIds.map(id => {
    if (typeof id !== "number") throw new ShipmentError(400, "修理案件IDが不正です。");
    return shipmentId(id);
  });
  return { repairIds: [...new Set(ids)], confirmed: true };
}

function dateOnly(value: unknown): Date | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ShipmentError(400, "日付が不正です。");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new ShipmentError(400, "日付が不正です。");
  return date;
}

function japanDateString(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function optionalText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100)
    throw new ShipmentError(400, "文字列が不正です。");
  return value.trim();
}

const handoffMethods: ShipmentHandoffMethod[] = ["PICKUP", "COUNTER_DROP_OFF", "OTHER"];
export type ShipmentPlanningUpdate = {
  plannedShipDate?: Date | null;
  carrierCode?: string | null;
  serviceCode?: string | null;
  handoffMethod?: ShipmentHandoffMethod | null;
  requestedDeliveryDate?: Date | null;
  requestedDeliveryTimeSlot?: string | null;
};

export function parseShipmentUpdate(body: unknown): ShipmentPlanningUpdate {
  const value = record(body);
  const keys = ["plannedShipDate", "carrierCode", "serviceCode", "handoffMethod", "requestedDeliveryDate", "requestedDeliveryTimeSlot"];
  onlyKeys(value, keys);
  if (Object.keys(value).length === 0) throw new ShipmentError(400, "更新項目がありません。");
  const data: ShipmentPlanningUpdate = {};
  if ("plannedShipDate" in value) data.plannedShipDate = dateOnly(value.plannedShipDate);
  if ("requestedDeliveryDate" in value) data.requestedDeliveryDate = dateOnly(value.requestedDeliveryDate);
  if ("carrierCode" in value) data.carrierCode = optionalText(value.carrierCode);
  if ("serviceCode" in value) data.serviceCode = optionalText(value.serviceCode);
  if ("requestedDeliveryTimeSlot" in value) data.requestedDeliveryTimeSlot = optionalText(value.requestedDeliveryTimeSlot);
  if ("handoffMethod" in value) {
    if (value.handoffMethod !== null && !handoffMethods.includes(value.handoffMethod as ShipmentHandoffMethod))
      throw new ShipmentError(400, "引渡方法が不正です。");
    data.handoffMethod = value.handoffMethod as ShipmentHandoffMethod | null;
  }
  return data;
}

const detail = {
  customer: { select: { id: true, name: true, type: true } },
  repairs: { select: { repairId: true, repair: { select: { id: true, inquiryNumber: true, customerId: true } } } },
} satisfies Prisma.ShipmentInclude;

export function shipmentFailure(error: unknown): { status: number; message: string } {
  if (error instanceof ShipmentError) return { status: error.status, message: error.message };
  if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034"))
    return { status: 409, message: "発送の状態が変更されました。再確認してください。" };
  return { status: 500, message: "発送の処理に失敗しました。" };
}

export async function createShipment(db: PrismaClient, input: { repairIds: number[]; confirmed: true }, now = new Date()) {
  // Guard the domain entry point too: callers other than the HTTP route must confirm.
  const { repairIds } = parseShipmentCreate(input);
  return db.$transaction(async tx => {
    const repairs = await tx.repair.findMany({
      where: { id: { in: repairIds } },
      select: { id: true, customerId: true,
        returnRecipientName: true, returnPostalCode: true, returnPrefecture: true, returnCity: true,
        returnStreet: true, returnBuilding: true, returnPhone: true,
        deliveryPreference: { select: { requestedDeliveryDate: true, requestedDeliveryTimeSlot: true } },
        shipmentRepairs: { select: { shipment: { select: {
          direction: true, status: true, actualShippedAt: true,
        } } } } },
    });
    if (repairs.length !== repairIds.length) throw new ShipmentError(404, "修理案件が見つかりません。");
    const customerId = repairs[0].customerId;
    if (repairs.some(repair => repair.customerId !== customerId))
      throw new ShipmentError(409, "異なる顧客の修理案件は同じ発送にできません。");
    let destinations;
    try {
      destinations = repairs.map(parseRepairReturnAddress);
    } catch {
      throw new ShipmentError(409, "返送先の必須項目が不足または不正です。");
    }
    const destination = destinations[0];
    if (destinations.some(address => JSON.stringify(address) !== JSON.stringify(destination)))
      throw new ShipmentError(409, "修理案件の返送先が一致しません。");
    const hasExistingActiveOutboundShipment = repairs.length === 1 && repairs[0].shipmentRepairs.some(({ shipment }) =>
      shipment.direction === "OUTBOUND" && shipment.status !== "CANCELLED" && shipment.actualShippedAt === null,
    );
    const storedDeliveryPreference = repairs.length === 1 && !hasExistingActiveOutboundShipment
      ? repairs[0].deliveryPreference
      : null;
    const storedDeliveryDate = storedDeliveryPreference?.requestedDeliveryDate;
    const deliveryPreference = storedDeliveryDate && storedDeliveryDate.toISOString().slice(0, 10) < japanDateString(now)
      ? null
      : storedDeliveryPreference;
    return tx.shipment.create({
      data: {
        customerId, direction: "OUTBOUND", status: "DRAFT",
        requestedDeliveryDate: deliveryPreference?.requestedDeliveryDate ?? null,
        requestedDeliveryTimeSlot: deliveryPreference?.requestedDeliveryTimeSlot ?? null,
        destinationRecipientName: destination.recipientName,
        destinationPostalCode: destination.postalCode,
        destinationPrefecture: destination.prefecture,
        destinationCity: destination.city,
        destinationStreet: destination.street,
        destinationBuilding: destination.building,
        destinationPhone: destination.phone,
        repairs: { create: repairIds.map(repairId => ({ repair: { connect: { id: repairId } } })) },
      },
      include: detail,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function readShipment(db: PrismaClient, id: number) {
  const shipment = await db.shipment.findUnique({ where: { id }, include: detail });
  if (!shipment) throw new ShipmentError(404, "発送が見つかりません。");
  return shipment;
}

export async function updateShipment(db: PrismaClient, id: number, data: ShipmentPlanningUpdate) {
  return db.$transaction(async tx => {
    const updated = await tx.shipment.updateMany({ where: { id, status: "DRAFT" }, data });
    if (updated.count !== 1) {
      const existing = await tx.shipment.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new ShipmentError(404, "発送が見つかりません。");
      throw new ShipmentError(409, "下書き以外の発送は変更できません。");
    }
    return tx.shipment.findUniqueOrThrow({ where: { id }, include: detail });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
