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
  warnings: string[];
  errors: string[];
  importableLater: boolean;
};
export type HistoryShipment = { id: number; trackingNumber: string | null };

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
    const confirmedDescriptionOrNull = aggregateStatusCode === "10" && detailStatusCode === "0A" ? "引受予定" : null;
    if (confirmedDescriptionOrNull === null) warnings.push("Unverified delivery status codes");
    return { rowNumber, managementNumber, resolvedShipmentId, shipmentFound: false,
      trackingNumberCandidate, acceptanceRelatedValue, deliveryCompletionCandidate,
      aggregateStatusCode, detailStatusCode, confirmedDescriptionOrNull, warnings, errors,
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
      else if (shipment.trackingNumber && shipment.trackingNumber !== row.trackingNumberCandidate)
        row.errors.push("Existing Shipment tracking number conflicts with candidate");
    }
  }
  for (const group of byManagement.values()) if (group.length > 1)
    for (const row of group) row.errors.push("Duplicate management number");
  for (const group of byShipment.values()) if (group.length > 1) {
    for (const row of group) row.errors.push("Duplicate resolved Shipment");
    if (new Set(group.map(row => row.trackingNumberCandidate)).size > 1)
      for (const row of group) row.errors.push("Conflicting tracking numbers for the same Shipment");
  }
  for (const row of result) row.importableLater = row.errors.length === 0 && row.confirmedDescriptionOrNull !== null;
  return result;
}
