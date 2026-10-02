import type { Shipment } from "@prisma/client";
import * as iconv from "iconv-lite";

// The final 2026-09-24 Print R V3 PoC is a 100-column, headerless row.
// Positions in this module are one-based to match that file.
export type YupuriShipment = Pick<Shipment,
  "id" | "direction" | "status" | "actualShippedAt" | "plannedShipDate" | "requestedDeliveryDate" | "requestedDeliveryTimeSlot" |
  "destinationRecipientName" | "destinationPostalCode" | "destinationPrefecture" |
  "destinationCity" | "destinationStreet" | "destinationBuilding" | "destinationPhone"
>;

export class YupuriV3Error extends Error {
  constructor(message: string, public readonly status: 409 | 422 = 422) {
    super(message);
    this.name = "YupuriV3Error";
  }
}

const sender = {
  postalCode: "6511213",
  address: "\u795e\u6238\u5e02\u5317\u533a\u5e83\u9675\u753a1-162-1-401",
  name: "\u30e8\u30b7\u30c0\u6642\u8a08\u4fee\u7406\u5de5\u623f",
  phone: "090-2041-8275",
};
const watch = "\u8155\u6642\u8a08";

const timeCodes: Readonly<Record<string, string>> = {
  "00": "00", "51": "51", "52": "52", "53": "53", "54": "54", "55": "55", "57": "57",
  "指定なし": "00", "時間指定なし": "00", "希望なし": "00",
  "\u5348\u524d\u4e2d": "51",
  "12時～14時": "52", "14時～16時": "53", "16時～18時": "54", "18時～20時": "55", "19時～21時": "57",
  "12\uff5e14\u6642": "52",
  "14\uff5e16\u6642": "53",
  "16\uff5e18\u6642": "54",
  "18\uff5e20\u6642": "55",
  "19\uff5e21\u6642": "57",
};

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || /[\0\r\n]/.test(value)) throw new YupuriV3Error(`${field} is required`);
  return value.trim();
}

function optional(value: string | null, field: string): string {
  if (value == null) return "";
  if (typeof value !== "string" || /[\0\r\n]/.test(value)) throw new YupuriV3Error(`${field} is invalid`);
  return value.trim();
}

function postal(value: unknown, field: string): string {
  const text = required(value, field);
  if (!/^\d{7}$/.test(text)) throw new YupuriV3Error(`${field} must have seven digits`);
  return text;
}

function phone(value: unknown, field: string): string {
  const text = required(value, field);
  if (!/^\d[\d-]*\d$/.test(text) || !/^\d{10,11}$/.test(text.replace(/-/g, "")))
    throw new YupuriV3Error(`${field} is invalid`);
  return text;
}

function dateOnly(value: Date | null, field: string, requiredDate: boolean): string {
  if (value == null) {
    if (requiredDate) throw new YupuriV3Error(`${field} is required`);
    return "";
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new YupuriV3Error(`${field} is invalid`);
  const iso = value.toISOString();
  if (!iso.endsWith("T00:00:00.000Z")) throw new YupuriV3Error(`${field} must be a date-only value`);
  return iso.slice(0, 10).replace(/-/g, "");
}

export function yupuriTimeCode(value: string | null): string {
  if (value == null || !value.trim()) return "00";
  const key = value.trim();
  const code = Object.prototype.hasOwnProperty.call(timeCodes, key) ? timeCodes[key] : undefined;
  if (!code) throw new YupuriV3Error("Requested delivery time is unsupported");
  return code;
}

export function yupuriV3Fields(shipment: YupuriShipment): string[] {
  if (!Number.isInteger(shipment.id) || shipment.id < 1 || shipment.id > 2147483647)
    throw new YupuriV3Error("Shipment ID is invalid");
  if (shipment.direction !== "OUTBOUND" ||
      !["DRAFT", "READY", "LABEL_ISSUED", "AWAITING_ACCEPTANCE"].includes(shipment.status) ||
      shipment.actualShippedAt !== null)
    throw new YupuriV3Error("This shipment cannot be exported", 409);

  const fields = Array<string>(100).fill("");
  const put = (position: number, value: string) => { fields[position - 1] = value; };
  put(1, `SHP-${shipment.id}`);
  for (const position of [3, 9, 10, 11, 12, 20, 23, 26, 27, 28, 39, 43, 44, 45, 46, 47, 51, 54, 55, 69, 70, 86, 88])
    put(position, "0");
  put(6, dateOnly(shipment.plannedShipDate, "Planned ship date", true));
  put(13, "1100780");
  put(15, postal(shipment.destinationPostalCode, "Destination postal code"));
  put(16, [
    required(shipment.destinationPrefecture, "Destination prefecture"),
    required(shipment.destinationCity, "Destination city"),
    required(shipment.destinationStreet, "Destination street"),
    optional(shipment.destinationBuilding, "Destination building"),
  ].join(""));
  put(18, required(shipment.destinationRecipientName, "Destination recipient"));
  put(21, phone(shipment.destinationPhone, "Destination phone"));
  put(30, postal(sender.postalCode, "Sender postal code"));
  put(31, required(sender.address, "Sender address"));
  put(34, required(sender.name, "Sender name"));
  put(37, phone(sender.phone, "Sender phone"));
  put(48, "060");
  put(52, dateOnly(shipment.requestedDeliveryDate, "Requested delivery date", false));
  put(53, yupuriTimeCode(shipment.requestedDeliveryTimeSlot));
  put(56, "1");
  put(57, watch);
  put(84, watch);
  put(85, "1");
  put(87, "10");
  return fields;
}

export function yupuriV3Csv(shipment: YupuriShipment): Buffer {
  const fields = yupuriV3Fields(shipment);
  // Yu-Pri R rejects embedded record breaks. Its V3 filter requires every field
  // to be enclosed when a value contains a comma; keep PoC rows unquoted otherwise.
  if (fields.some(value => /[\r\n]/.test(value)))
    throw new YupuriV3Error("Export contains a line break unsupported by Yu-Pri R");
  const enclose = fields.some(value => /[,\"]/.test(value));
  const row = (enclose ? fields.map(value => `"${value.replace(/"/g, '""')}"`) : fields).join(",");
  const csv = `${row}\r\n`;
  const bytes = iconv.encode(csv, "cp932");
  if (iconv.decode(bytes, "cp932") !== csv) throw new YupuriV3Error("Export contains characters unavailable in CP932");
  return bytes;
}
