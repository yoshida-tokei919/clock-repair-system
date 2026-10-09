import type { Shipment } from "@prisma/client";
import * as iconv from "iconv-lite";

export type YupuriCloudShipment = Pick<Shipment,
  "id" | "direction" | "status" | "actualShippedAt" | "plannedShipDate" | "requestedDeliveryDate" | "requestedDeliveryTimeSlot" |
  "destinationRecipientName" | "destinationPostalCode" | "destinationPrefecture" |
  "destinationCity" | "destinationStreet" | "destinationBuilding" | "destinationPhone"
>;

export class YupuriCloudError extends Error {
  constructor(message: string, public readonly status: 409 | 422 = 422) {
    super(message);
    this.name = "YupuriCloudError";
  }
}

export const YUPURI_CLOUD_HEADERS = [
  "送り状種別",
  "荷物商品名",
  "個口数",
  "お客さま管理番号（受注番号等）",
  "品名1",
  "サイズ",
  "お届け先郵便番号",
  "お届け先住所1",
  "お届け先氏名1",
  "お届け先電話番号",
  "ご依頼主郵便番号",
  "ご依頼主住所1",
  "ご依頼主氏名1",
  "ご依頼主電話番号",
  "発送予定日",
  "配達希望日",
  "配達希望時間帯",
] as const;

const sender = {
  postalCode: "6511213",
  address: "神戸市北区広陵町1-162-1-401",
  name: "ヨシダ時計修理工房",
  phone: "090-2041-8275",
};

const watch = "腕時計";

const timeCodes: Readonly<Record<string, string>> = {
  "00": "00", "51": "51", "52": "52", "53": "53", "54": "54", "55": "55", "57": "57",
  "指定なし": "00", "時間指定なし": "00", "希望なし": "00",
  "午前中": "51",
  "12時～14時": "52", "14時～16時": "53", "16時～18時": "54", "18時～20時": "55", "19時～21時": "57",
  "12～14時": "52", "14～16時": "53", "16～18時": "54", "18～20時": "55", "19～21時": "57",
};

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || /[\0\r\n]/.test(value)) {
    throw new YupuriCloudError(`${field} is required`);
  }
  return value.trim();
}

function optional(value: string | null, field: string): string {
  if (value == null) return "";
  if (typeof value !== "string" || /[\0\r\n]/.test(value)) {
    throw new YupuriCloudError(`${field} is invalid`);
  }
  return value.trim();
}

function maxLength(value: string, limit: number, field: string): string {
  if (value.length > limit) throw new YupuriCloudError(`${field} is too long`);
  return value;
}

function cp932Compatible(value: string, field: string): string {
  const bytes = iconv.encode(value, "cp932");
  if (iconv.decode(bytes, "cp932") !== value) {
    throw new YupuriCloudError(`${field} contains unsupported characters`);
  }
  return value;
}

function postal(value: unknown, field: string): string {
  const text = required(value, field);
  if (!/^\d{7}$/.test(text)) throw new YupuriCloudError(`${field} must have seven digits`);
  return text;
}

function phone(value: unknown, field: string): string {
  const text = required(value, field);
  const digits = text.replace(/-/g, "");
  if (!/^0[\d-]*\d$/.test(text) || !/^\d{10,11}$/.test(digits)) {
    throw new YupuriCloudError(`${field} is invalid`);
  }
  return text;
}

function dateString(value: Date | null, field: string, requiredDate: boolean): string {
  if (value == null) {
    if (requiredDate) throw new YupuriCloudError(`${field} is required`);
    return "";
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new YupuriCloudError(`${field} is invalid`);
  const iso = value.toISOString();
  if (!iso.endsWith("T00:00:00.000Z")) throw new YupuriCloudError(`${field} must be a date-only value`);
  return iso.slice(0, 10);
}

function japanDateString(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function yupuriCloudTimeCode(value: string | null): string {
  if (value == null || !value.trim()) return "00";
  const key = value.trim();
  const code = Object.prototype.hasOwnProperty.call(timeCodes, key) ? timeCodes[key] : undefined;
  if (!code) throw new YupuriCloudError("Requested delivery time is unsupported");
  return code;
}

function csvField(value: string): string {
  if (/[\r\n]/.test(value)) throw new YupuriCloudError("Export contains a line break unsupported by Yu-Pri Cloud");
  return /[,\"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function yupuriCloudFields(shipment: YupuriCloudShipment, now = new Date()): string[] {
  if (!Number.isInteger(shipment.id) || shipment.id < 1 || shipment.id > 2147483647) {
    throw new YupuriCloudError("Shipment ID is invalid");
  }
  if (
    shipment.direction !== "OUTBOUND" ||
    !["DRAFT", "READY", "LABEL_ISSUED", "AWAITING_ACCEPTANCE"].includes(shipment.status) ||
    shipment.actualShippedAt !== null
  ) {
    throw new YupuriCloudError("This shipment cannot be exported", 409);
  }

  const managementNumber = `SHP-${shipment.id}`;
  if (managementNumber.length > 16 || !/^[\x21-\x7e]+$/.test(managementNumber)) {
    throw new YupuriCloudError("Customer management number is invalid");
  }

  const destinationAddress = cp932Compatible(maxLength([
    required(shipment.destinationPrefecture, "Destination prefecture"),
    required(shipment.destinationCity, "Destination city"),
    required(shipment.destinationStreet, "Destination street"),
    optional(shipment.destinationBuilding, "Destination building"),
  ].join(""), 75, "Destination address"), "Destination address");

  const destinationRecipient = cp932Compatible(
    maxLength(required(shipment.destinationRecipientName, "Destination recipient"), 50, "Destination recipient"),
    "Destination recipient",
  );

  const plannedDate = dateString(shipment.plannedShipDate, "Planned ship date", true);
  if (plannedDate < japanDateString(now)) throw new YupuriCloudError("Planned ship date is in the past");
  const requestedDate = dateString(shipment.requestedDeliveryDate, "Requested delivery date", false);
  const rawRequestedTime = shipment.requestedDeliveryTimeSlot?.trim() ?? "";
  const requestedTime = requestedDate || rawRequestedTime
    ? yupuriCloudTimeCode(shipment.requestedDeliveryTimeSlot)
    : "";

  return [
    "0",
    "101",
    "1",
    managementNumber,
    cp932Compatible(maxLength(watch, 60, "Item name"), "Item name"),
    "060",
    postal(shipment.destinationPostalCode, "Destination postal code"),
    destinationAddress,
    destinationRecipient,
    phone(shipment.destinationPhone, "Destination phone"),
    postal(sender.postalCode, "Sender postal code"),
    cp932Compatible(required(sender.address, "Sender address"), "Sender address"),
    cp932Compatible(required(sender.name, "Sender name"), "Sender name"),
    phone(sender.phone, "Sender phone"),
    plannedDate.replace(/-/g, ""),
    requestedDate.replace(/-/g, ""),
    requestedTime,
  ];
}

export function yupuriCloudCsv(shipment: YupuriCloudShipment, now = new Date()): Buffer {
  const header = YUPURI_CLOUD_HEADERS.map(csvField).join(",");
  const row = yupuriCloudFields(shipment, now).map(csvField).join(",");
  const csv = `${header}\r\n${row}\r\n`;
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csv, "utf8")]);
}
