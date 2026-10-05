import * as iconv from "iconv-lite";

export const YUPURI_HISTORY_MAX_BYTES = 256 * 1024;
export const YUPURI_HISTORY_MAX_ROWS = 500;

// Transcribed from the CP932 shipping_history.csv produced by Yu-Pri R in the PoC.
export const YUPURI_HISTORY_HEADER = [
  "お客様側管理番号",
  "お問い合わせ番号",
  "仮引受確定作業年月日",
  "配送完了作業年月日",
  "配達ステータス集約コード",
  "配達ステータス明細コード",
] as const;

export class YupuriHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YupuriHistoryError";
  }
}

type CsvRow = { rowNumber: number; fields: string[] };
export type HistoryRow = {
  rowNumber: number;
  managementNumber: string;
  resolvedShipmentId: number | null;
  shipmentFound: boolean;
  trackingNumberCandidate: string;
  acceptanceRelatedValue: string;
  deliveryCompletionCandidate: string;
  aggregateStatusCode: string;
  detailStatusCode: string;
  confirmedDescriptionOrNull: string | null;
  currentShipment: HistoryShipmentPreview | null;
  statusCandidate: ShipmentStatusCandidate | null;
  statusChange: "NO_CHANGE" | "CANDIDATE" | "NONE";
  trackingChange: "NO_CHANGE" | "CANDIDATE" | "CONFLICT" | "NONE";
  warnings: string[];
  errors: string[];
  importableLater: boolean;
};
export type ShipmentStatusCandidate = "AWAITING_ACCEPTANCE" | "SHIPPED" | "IN_TRANSIT" |
  "OUT_FOR_DELIVERY" | "DELIVERED" | "EXCEPTION";
export type HistoryShipment = {
  id: number; direction: "INBOUND" | "OUTBOUND"; status: string; trackingNumber: string | null;
  actualShippedAt: Date | null; deliveredAt: Date | null;
};
export type HistoryShipmentPreview = Omit<HistoryShipment, "actualShippedAt" | "deliveredAt"> & {
  actualShippedAt: string | null; deliveredAt: string | null;
};

// Japan Post Yu-Pri R, 入出力インターフェース仕様書 (2025-08-07), section 10.
// These are the table's descriptions, not Shipment state transitions.
type StatusGroup = readonly [aggregate: string, description: string, details: readonly string[]];
const describedStatusGroups: readonly StatusGroup[] = [
  ["10", "引受予定", ["01", "02", "0A", "0B", "0H"]],
  ["11", "引受", ["01", "02", "06", "07", "0C", "0F", "0G"]],
  ["12", "通過", ["14"]],
  ["12", "最寄局送付", ["15"]],
  ["12", "ＣＶＳ等引渡", ["16"]],
  ["12", "はこぽす等入庫", ["17"]],
  ["13", "発送", ["19", "23", "25"]],
  ["14", "車船輸送", ["83", "84", "85", "86", "87", "88"]],
  ["30", "到着", ["00"]],
  ["50", "持出中", ["01", "02"]],
  ["51", "不在持戻", ["30", "31", "32"]],
  ["51", "最寄局保管", ["33"]],
  ["52", "配達完了", ["01", "31", "32", "35"]],
  ["52", "返還完了", ["34"]],
  ["53", "窓口渡し", ["37"]],
  ["53", "配達完了", ["38"]],
  ["60", "局内保管", ["48", "50"]],
  ["60", "私書箱保管", ["49"]],
  ["60", "保管中", ["77"]],
  ["60", "保管", ["99"]],
  ["61", "転送", ["51", "52", "53", "54", "55"]],
  ["61", "他局転送", ["79"]],
  ["62", "返還", ["44", "56", "57", "58", "59", "60", "61", "62", "63", "64", "76", "79"]],
  ["62", "処分", ["65"]],
  ["62", "返還不能", ["66"]],
  ["63", "配達希望", ["67", "68", "72", "78", "79", "80"]],
  ["63", "保管延長", ["70"]],
  ["64", "休日保管", ["73"]],
  ["64", "保管", ["74", "75", "79"]],
  ["65", "調査中", ["44", "56", "58", "59", "60", "61", "64", "76", "79", "80"]],
];
const statusKey = (aggregate: string, detail: string) => `${aggregate}/${detail}`;
const officialDescriptions = new Map(describedStatusGroups.flatMap(([aggregate, description, details]) =>
  details.map(detail => [statusKey(aggregate, detail), description] as const)));

// Preview proposal only. An official description does not establish update eligibility.
const normalizedStatusByDescription: Readonly<Record<string, ShipmentStatusCandidate>> = {
  "引受予定": "AWAITING_ACCEPTANCE", "引受": "SHIPPED",
  "通過": "IN_TRANSIT", "最寄局送付": "IN_TRANSIT", "ＣＶＳ等引渡": "IN_TRANSIT",
  "はこぽす等入庫": "IN_TRANSIT", "発送": "IN_TRANSIT", "車船輸送": "IN_TRANSIT", "到着": "IN_TRANSIT",
  "持出中": "OUT_FOR_DELIVERY", "配達完了": "DELIVERED",
  "不在持戻": "EXCEPTION", "最寄局保管": "EXCEPTION", "返還完了": "EXCEPTION",
  "局内保管": "EXCEPTION", "私書箱保管": "EXCEPTION", "配達希望": "EXCEPTION",
  "保管中": "EXCEPTION", "保管": "EXCEPTION", "転送": "EXCEPTION",
  "他局転送": "EXCEPTION", "返還": "EXCEPTION", "処分": "EXCEPTION",
  "返還不能": "EXCEPTION", "保管延長": "EXCEPTION", "休日保管": "EXCEPTION",
  "調査中": "EXCEPTION",
};

// A dash in the official table is a listed pair without a description.
const officiallyUndescribedPairs = new Set([
  "11/0D", "11/0E",
  "12/10", "12/11", "12/12", "12/13",
  "13/20", "13/21", "13/22", "13/24", "13/26", "13/27",
  "20/03", "20/18", "40/00", "52/36",
  "60/81", "60/82", "63/69", "63/71",
  "90/39", "90/40", "90/41", "90/42", "90/43", "90/44", "90/45", "90/46", "90/47", "90/79",
]);

function csvRows(input: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let fields: string[] = [];
  let field = "";
  let state: "start" | "plain" | "quoted" | "afterQuote" = "start";
  let line = 1;
  let rowNumber = 1;
  let endedWithRecordBreak = false;
  const endField = () => { fields.push(field); field = ""; state = "start"; };
  const endRow = () => {
    endField();
    rows.push({ rowNumber, fields });
    if (rows.length > YUPURI_HISTORY_MAX_ROWS + 1) throw new YupuriHistoryError("CSV row limit exceeded");
    fields = [];
    rowNumber = line + 1;
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (state === "quoted") {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else state = "afterQuote";
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && input[i + 1] !== "\n") throw new YupuriHistoryError(`Malformed CSV at line ${line}`);
        field += char;
        if (char === "\r") { field += "\n"; i++; }
        line++;
      } else field += char;
      endedWithRecordBreak = false;
      continue;
    }
    if (char === ",") {
      endField();
      endedWithRecordBreak = false;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && input[i + 1] !== "\n") throw new YupuriHistoryError(`Malformed CSV at line ${line}`);
      endRow();
      if (char === "\r") i++;
      line++;
      rowNumber = line;
      endedWithRecordBreak = true;
    } else if (char === '"') {
      if (state !== "start") throw new YupuriHistoryError(`Malformed CSV quoting at line ${line}`);
      state = "quoted";
      endedWithRecordBreak = false;
    } else {
      if (state === "afterQuote") throw new YupuriHistoryError(`Malformed CSV quoting at line ${line}`);
      field += char;
      state = "plain";
      endedWithRecordBreak = false;
    }
  }
  if (state === "quoted") throw new YupuriHistoryError("Unclosed CSV quote");
  if (!endedWithRecordBreak) endRow();
  return rows;
}

export function parseYupuriHistory(bytes: Buffer): HistoryRow[] {
  if (bytes.length === 0) throw new YupuriHistoryError("CSV file is empty");
  if (bytes.length > YUPURI_HISTORY_MAX_BYTES) throw new YupuriHistoryError("CSV file size limit exceeded");
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ||
      bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe])) ||
      bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff])))
    throw new YupuriHistoryError("Only BOM-free CP932 CSV is supported");
  const input = iconv.decode(bytes, "cp932");
  if (!iconv.encode(input, "cp932").equals(bytes) || input.includes("\0"))
    throw new YupuriHistoryError("CSV is not valid CP932 text");
  const rows = csvRows(input);
  if (!rows.length || rows[0].fields.length !== 6 ||
      rows[0].fields.some((field, index) => field !== YUPURI_HISTORY_HEADER[index]))
    throw new YupuriHistoryError("Unexpected Yu-Pri R history CSV header");
  if (rows.length === 1) throw new YupuriHistoryError("CSV has no data rows");

  return rows.slice(1).map(({ rowNumber, fields }) => {
    const [managementNumber = "", trackingNumberCandidate = "", acceptanceRelatedValue = "",
      deliveryCompletionCandidate = "", aggregateStatusCode = "", detailStatusCode = ""] = fields;
    const errors: string[] = [];
    const warnings: string[] = [];
    if (fields.length !== 6) errors.push(`Expected 6 columns; found ${fields.length}`);
    const match = /^SHP-([1-9][0-9]*)$/.exec(managementNumber);
    const id = match ? Number(match[1]) : NaN;
    const resolvedShipmentId = Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
    if (resolvedShipmentId === null) errors.push("Invalid SHP management number");
    if (!trackingNumberCandidate.trim()) errors.push("Tracking number is required");
    const key = statusKey(aggregateStatusCode, detailStatusCode);
    const confirmedDescriptionOrNull = officialDescriptions.get(key) ?? null;
    if (confirmedDescriptionOrNull === null) warnings.push(officiallyUndescribedPairs.has(key)
      ? "Official delivery status table lists this pair without a description"
      : "Unverified delivery status codes");
    const statusCandidate = confirmedDescriptionOrNull === null ? null :
      normalizedStatusByDescription[confirmedDescriptionOrNull] ?? null;
    if (confirmedDescriptionOrNull !== null && statusCandidate === null)
      warnings.push("Official description has no normalized Shipment status candidate");
    return { rowNumber, managementNumber, resolvedShipmentId, shipmentFound: false,
      trackingNumberCandidate, acceptanceRelatedValue, deliveryCompletionCandidate,
      aggregateStatusCode, detailStatusCode, confirmedDescriptionOrNull, currentShipment: null,
      statusCandidate, statusChange: "NONE", trackingChange: "NONE", warnings, errors,
      importableLater: false };
  });
}

export function resolveYupuriHistory(rows: HistoryRow[], shipments: readonly HistoryShipment[]): HistoryRow[] {
  const byId = new Map(shipments.map(shipment => [shipment.id, shipment]));
  const byManagement = new Map<string, HistoryRow[]>();
  const byShipment = new Map<number, HistoryRow[]>();
  const result = rows.map(row => ({ ...row, warnings: [...row.warnings], errors: [...row.errors] }));
  for (const row of result) {
    if (row.managementNumber) {
      const group = byManagement.get(row.managementNumber) ?? [];
      group.push(row); byManagement.set(row.managementNumber, group);
    }
    if (row.resolvedShipmentId !== null) {
      const group = byShipment.get(row.resolvedShipmentId) ?? [];
      group.push(row); byShipment.set(row.resolvedShipmentId, group);
      const shipment = byId.get(row.resolvedShipmentId);
      row.shipmentFound = !!shipment;
      if (!shipment) row.errors.push("Shipment not found");
      else {
        row.currentShipment = {
          id: shipment.id, direction: shipment.direction, status: shipment.status,
          trackingNumber: shipment.trackingNumber,
          actualShippedAt: shipment.actualShippedAt?.toISOString() ?? null,
          deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
        };
        row.statusChange = row.statusCandidate === null ? "NONE" :
          shipment.status === row.statusCandidate ? "NO_CHANGE" : "CANDIDATE";
        row.trackingChange = !row.trackingNumberCandidate.trim() ? "NONE" :
          shipment.trackingNumber === row.trackingNumberCandidate ? "NO_CHANGE" :
          shipment.trackingNumber ? "CONFLICT" : "CANDIDATE";
        if (row.trackingChange === "CONFLICT")
          row.errors.push("Existing Shipment tracking number conflicts with candidate");
        if (shipment.direction !== "OUTBOUND") row.errors.push("INBOUND Shipment is not a supported synchronization target");
        if (shipment.status === "CANCELLED") row.errors.push("CANCELLED Shipment is not a supported synchronization target");
      }
    }
  }
  for (const group of byManagement.values()) if (group.length > 1)
    for (const row of group) row.errors.push("Duplicate management number");
  for (const group of byShipment.values()) if (group.length > 1) {
    for (const row of group) row.errors.push("Duplicate resolved Shipment");
    if (new Set(group.map(row => row.trackingNumberCandidate)).size > 1)
      for (const row of group) row.errors.push("Conflicting tracking numbers for the same Shipment");
  }
  for (const row of result) row.importableLater = row.errors.length === 0 && row.shipmentFound &&
    row.statusCandidate !== null;
  return result;
}
