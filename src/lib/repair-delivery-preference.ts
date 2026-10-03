import { Prisma, type PrismaClient } from "@prisma/client";
import { completionNoticeKey } from "./repair-completion-notice";
import { YUPURI_DELIVERY_TIME_OPTIONS } from "./yupuri-v3";

export const NO_DELIVERY_TIME_PREFERENCE = "指定なし";
export const DELIVERY_PREFERENCE_MODES = ["NONE", "DATE", "TIME", "DATE_TIME"] as const;
export type DeliveryPreferenceMode = typeof DELIVERY_PREFERENCE_MODES[number];

const selectableTimeSlots = new Set<string>(
  YUPURI_DELIVERY_TIME_OPTIONS
    .map(option => option.value)
    .filter(value => value !== NO_DELIVERY_TIME_PREFERENCE),
);

export class RepairDeliveryPreferenceError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "RepairDeliveryPreferenceError";
  }
}

export type NormalizedDeliveryPreference = {
  requestedDeliveryDate: Date | null;
  requestedDeliveryTimeSlot: string;
};

function plainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new RepairDeliveryPreferenceError(400, "入力が不正です。");
  }
  return value as Record<string, unknown>;
}
function japanDateString(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseDate(value: unknown, now: Date) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RepairDeliveryPreferenceError(400, "配達希望日が不正です。");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RepairDeliveryPreferenceError(400, "配達希望日が不正です。");
  }
  if (value < japanDateString(now)) {
    throw new RepairDeliveryPreferenceError(400, "過去の日付は選択できません。");
  }
  return date;
}

function selectedTimeSlot(value: unknown) {
  if (typeof value !== "string" || !selectableTimeSlots.has(value)) {
    throw new RepairDeliveryPreferenceError(400, "配達希望時間帯が不正です。");
  }
  return value;
}
export function parseDeliveryPreferenceInput(value: unknown, now = new Date()): NormalizedDeliveryPreference {
  const body = plainRecord(value);
  if (Object.keys(body).some(key => !["mode", "date", "timeSlot"].includes(key))) {
    throw new RepairDeliveryPreferenceError(400, "入力が不正です。");
  }
  if (typeof body.mode !== "string" || !DELIVERY_PREFERENCE_MODES.includes(body.mode as DeliveryPreferenceMode)) {
    throw new RepairDeliveryPreferenceError(400, "回答方法を選択してください。");
  }
  const mode = body.mode as DeliveryPreferenceMode;
  const hasDate = typeof body.date === "string" && body.date.length > 0;
  const hasTime = typeof body.timeSlot === "string" && body.timeSlot.length > 0;

  if (mode === "NONE") {
    if (hasDate || hasTime) throw new RepairDeliveryPreferenceError(400, "希望なしの入力が不正です。");
    return { requestedDeliveryDate: null, requestedDeliveryTimeSlot: NO_DELIVERY_TIME_PREFERENCE };
  }
  if (mode === "DATE") {
    if (!hasDate || hasTime) throw new RepairDeliveryPreferenceError(400, "配達希望日の入力が不正です。");
    return { requestedDeliveryDate: parseDate(body.date, now), requestedDeliveryTimeSlot: NO_DELIVERY_TIME_PREFERENCE };
  }
  if (mode === "TIME") {
    if (hasDate || !hasTime) throw new RepairDeliveryPreferenceError(400, "配達希望時間帯の入力が不正です。");
    return { requestedDeliveryDate: null, requestedDeliveryTimeSlot: selectedTimeSlot(body.timeSlot) };
  }
  if (!hasDate || !hasTime) throw new RepairDeliveryPreferenceError(400, "配達希望日と時間帯を入力してください。");
  return { requestedDeliveryDate: parseDate(body.date, now), requestedDeliveryTimeSlot: selectedTimeSlot(body.timeSlot) };
}
export type DeliveryPreferenceApplicationStatus =
  | "UNANSWERED" | "APPLIED" | "PENDING_NO_SHIPMENT"
  | "PENDING_MULTIPLE_SHIPMENTS" | "PENDING_MULTI_REPAIR_SHIPMENT"
  | "PENDING_MISMATCH" | "LOCKED";

function dateString(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function samePreference(
  preference: { requestedDeliveryDate: Date | null; requestedDeliveryTimeSlot: string },
  shipment: { requestedDeliveryDate: Date | null; requestedDeliveryTimeSlot: string | null },
) {
  return dateString(preference.requestedDeliveryDate) === dateString(shipment.requestedDeliveryDate) &&
    preference.requestedDeliveryTimeSlot === shipment.requestedDeliveryTimeSlot;
}

const publicRepairSelect = {
  id: true,
  customer: { select: { type: true } },
  deliveryPreference: { select: {
    requestedDeliveryDate: true, requestedDeliveryTimeSlot: true, respondedAt: true,
  } },
  lineManagerSendOutboxes: { select: { idempotencyKey: true, status: true } },
  shipmentRepairs: { select: { shipment: { select: {
    id: true, direction: true, status: true, actualShippedAt: true,
    requestedDeliveryDate: true, requestedDeliveryTimeSlot: true,
    repairs: { select: { repairId: true } },
  } } } },
} satisfies Prisma.RepairSelect;
type PublicRepair = Prisma.RepairGetPayload<{ select: typeof publicRepairSelect }>;

function activeOutboundShipments(repair: PublicRepair) {
  return repair.shipmentRepairs
    .map(link => link.shipment)
    .filter(shipment => shipment.direction === "OUTBOUND" && shipment.status !== "CANCELLED" && shipment.actualShippedAt === null);
}

function applicationStatus(repair: PublicRepair): DeliveryPreferenceApplicationStatus {
  const preference = repair.deliveryPreference;
  const shipments = activeOutboundShipments(repair);
  if (shipments.some(shipment => shipment.actualShippedAt || shipment.status !== "DRAFT")) return "LOCKED";
  if (!preference) return "UNANSWERED";
  if (shipments.length === 0) return "PENDING_NO_SHIPMENT";
  if (shipments.length > 1) return "PENDING_MULTIPLE_SHIPMENTS";
  if (shipments[0].repairs.length !== 1) return "PENDING_MULTI_REPAIR_SHIPMENT";
  return samePreference(preference, shipments[0]) ? "APPLIED" : "PENDING_MISMATCH";
}

function hasCompletionNoticeIntent(repair: PublicRepair) {
  const key = completionNoticeKey(repair.id);
  return repair.lineManagerSendOutboxes.some(outbox =>
    outbox.idempotencyKey === key && outbox.status !== "CANCELLED",
  );
}

export function deliveryPreferenceMode(value: {
  requestedDeliveryDate: Date | string | null;
  requestedDeliveryTimeSlot: string;
}): DeliveryPreferenceMode {
  const hasDate = Boolean(value.requestedDeliveryDate);
  const hasTime = value.requestedDeliveryTimeSlot !== NO_DELIVERY_TIME_PREFERENCE;
  if (hasDate && hasTime) return "DATE_TIME";
  if (hasDate) return "DATE";
  if (hasTime) return "TIME";
  return "NONE";
}

function publicPayload(repair: PublicRepair) {
  if (repair.customer.type !== "individual" || !hasCompletionNoticeIntent(repair)) {
    throw new RepairDeliveryPreferenceError(404, "回答ページが見つかりません。");
  }
  const status = applicationStatus(repair);
  return {
    editable: status !== "LOCKED",
    applicationStatus: status,
    preference: repair.deliveryPreference ? {
      mode: deliveryPreferenceMode(repair.deliveryPreference),
      requestedDeliveryDate: dateString(repair.deliveryPreference.requestedDeliveryDate),
      requestedDeliveryTimeSlot: repair.deliveryPreference.requestedDeliveryTimeSlot,
      respondedAt: repair.deliveryPreference.respondedAt.toISOString(),
    } : null,
  };
}
function publicToken(value: string) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(value)) {
    throw new RepairDeliveryPreferenceError(404, "回答ページが見つかりません。");
  }
  return value;
}

export async function getPublicRepairDeliveryPreference(db: PrismaClient, token: string) {
  const repair = await db.repair.findUnique({
    where: { publicToken: publicToken(token) },
    select: publicRepairSelect,
  });
  if (!repair) throw new RepairDeliveryPreferenceError(404, "回答ページが見つかりません。");
  return publicPayload(repair);
}

export async function savePublicRepairDeliveryPreference(
  db: PrismaClient,
  token: string,
  rawInput: unknown,
  now = new Date(),
) {
  const normalized = parseDeliveryPreferenceInput(rawInput, now);
  const safeToken = publicToken(token);

  try {
    return await db.$transaction(async tx => {
      const repair = await tx.repair.findUnique({
        where: { publicToken: safeToken },
        select: publicRepairSelect,
      });
      if (!repair || repair.customer.type !== "individual" || !hasCompletionNoticeIntent(repair)) {
        throw new RepairDeliveryPreferenceError(404, "回答ページが見つかりません。");
      }
      const shipments = activeOutboundShipments(repair);
      if (shipments.some(shipment => shipment.actualShippedAt || shipment.status !== "DRAFT")) {
        throw new RepairDeliveryPreferenceError(409, "発送準備が進んでいるため、配達希望を変更できません。LINEでご連絡ください。");
      }

      await tx.repairDeliveryPreference.upsert({
        where: { repairId: repair.id },
        create: { repairId: repair.id, ...normalized, respondedAt: now },
        update: { ...normalized, respondedAt: now },
      });

      if (shipments.length === 1 && shipments[0].repairs.length === 1) {
        const updated = await tx.shipment.updateMany({
          where: { id: shipments[0].id, status: "DRAFT", actualShippedAt: null },
          data: normalized,
        });
        if (updated.count !== 1) {
          throw new RepairDeliveryPreferenceError(409, "発送の状態が変わりました。画面を更新してもう一度お試しください。");
        }
      }

      const refreshed = await tx.repair.findUniqueOrThrow({
        where: { id: repair.id },
        select: publicRepairSelect,
      });
      return publicPayload(refreshed);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof RepairDeliveryPreferenceError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
      throw new RepairDeliveryPreferenceError(409, "状態が変わりました。画面を更新してもう一度お試しください。");
    }
    throw error;
  }
}

export async function getRepairDeliveryPreferenceForAdmin(db: PrismaClient, repairId: number) {
  if (!Number.isSafeInteger(repairId) || repairId <= 0) {
    throw new RepairDeliveryPreferenceError(404, "Repairが見つかりません。");
  }
  const repair = await db.repair.findUnique({
    where: { id: repairId },
    select: publicRepairSelect,
  });
  if (!repair) throw new RepairDeliveryPreferenceError(404, "Repairが見つかりません。");
  return {
    applicationStatus: applicationStatus(repair),
    preference: repair.deliveryPreference ? {
      requestedDeliveryDate: dateString(repair.deliveryPreference.requestedDeliveryDate),
      requestedDeliveryTimeSlot: repair.deliveryPreference.requestedDeliveryTimeSlot,
      respondedAt: repair.deliveryPreference.respondedAt.toISOString(),
    } : null,
  };
}
