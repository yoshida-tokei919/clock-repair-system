import type { PrismaClient, ShipmentStatus } from "@prisma/client";
import { normalizeJapanPostStatus, type ShipmentStatusCandidate } from "./yupuri-history";

const HOST = "trackings.post.japanpost.jp";
const SEARCH_PATH = "/services/srv/search";
const MAX_HTML_BYTES = 512 * 1024;
export const JAPAN_POST_POLL_CAP = 5;
export const JAPAN_POST_POLL_STATUSES: readonly ShipmentStatus[] = [
  "LABEL_ISSUED", "AWAITING_ACCEPTANCE", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "EXCEPTION",
];

export type TrackingHistory = {
  dateTimeText: string;
  statusText: string;
  officeText: string;
  otherFields: string[];
};
export type TrackingResult =
  | { kind: "FOUND"; state: Exclude<ShipmentStatusCandidate, "AWAITING_ACCEPTANCE">; history: TrackingHistory[] }
  | { kind: "ERROR"; code: "INVALID_NUMBER" | "UPSTREAM_ERROR" | "UNSAFE_REDIRECT" |
      "CONTRACT_CHANGED" | "TRACKING_MISMATCH" | "NOT_FOUND" | "NO_HISTORY" | "UNKNOWN_STATUS";
      history?: TrackingHistory[] };

type HtmlNode = {
  tagName?: string;
  textContent: string;
  childNodes: HtmlNode[];
  getAttribute(name: string): string | undefined;
  querySelectorAll(selector: string): HtmlNode[];
};

export function allowedTrackingUrl(url: URL): boolean {
  return url.protocol === "https:" && url.hostname === HOST && url.port === "" &&
    (url.pathname === SEARCH_PATH || url.pathname.startsWith(`${SEARCH_PATH}/`)) &&
    !url.username && !url.password;
}

function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
function cells(row: HtmlNode): HtmlNode[] {
  return row.childNodes.filter(node => node.tagName === "TH" || node.tagName === "TD");
}
function values(row: HtmlNode): string[] { return cells(row).map(node => clean(node.textContent)); }
function hasCells(row: HtmlNode, tag: "TH" | "TD", expected: number): boolean {
  const nodes = cells(row);
  return nodes.length === expected && nodes.every(node =>
    node.tagName === tag && (node.getAttribute("colspan") ?? "1") === "1");
}
function rowspan(node: HtmlNode): string { return node.getAttribute("rowspan") ?? "1"; }
function directRows(table: HtmlNode): HtmlNode[] {
  return table.querySelectorAll("tr").filter(row => {
    let parent = row as HtmlNode & { parentNode?: HtmlNode };
    while (parent.parentNode && parent.parentNode !== table) parent = parent.parentNode;
    return parent.parentNode === table;
  });
}
function stateFor(text: string): Exclude<ShipmentStatusCandidate, "AWAITING_ACCEPTANCE"> | null {
  const aliases: Record<string, string> = {
    "中継": "通過", "お届け先にお届け済み": "配達完了", "お届け済み": "配達完了",
    "持ち出し中": "持出中", "配達中": "持出中",
  };
  const state = normalizeJapanPostStatus(aliases[text] ?? text);
  return state && state !== "AWAITING_ACCEPTANCE" ? state : null;
}

export function parseJapanPostTracking(html: string, trackingNumber: string): TrackingResult {
  if (!/^\d{12}$/.test(trackingNumber)) return { kind: "ERROR", code: "INVALID_NUMBER" };
  // Next bundles this DOM parser; no browser execution or remote scripts are involved.
  const { parse } = require("next/dist/compiled/node-html-parser") as { parse: (input: string) => HtmlNode };
  const document = parse(html);
  const tables = document.querySelectorAll("table");
  const inquiryTables = tables.filter(table => table.getAttribute("summary") === "配達状況詳細");
  if (inquiryTables.length !== 1) return { kind: "ERROR", code: "CONTRACT_CHANGED" };
  const inquiryRows = directRows(inquiryTables[0]);
  if (inquiryRows.length !== 2 || !hasCells(inquiryRows[0], "TH", 2) ||
      !hasCells(inquiryRows[1], "TD", 2) ||
      JSON.stringify(values(inquiryRows[0])) !== JSON.stringify(["お問い合わせ番号", "商品種別"]) ||
      [...cells(inquiryRows[0]), ...cells(inquiryRows[1])].some(node => rowspan(node) !== "1"))
    return { kind: "ERROR", code: "CONTRACT_CHANGED" };
  const echoed = values(inquiryRows[1])[0].replace(/[\s-]/g, "");
  if (echoed !== trackingNumber) return { kind: "ERROR", code: "TRACKING_MISMATCH" };

  const historyTables = tables.filter(table => table.getAttribute("summary") === "履歴情報");
  if (historyTables.length !== 1) {
    const pageText = clean(document.textContent);
    if (historyTables.length === 0 && /該当する.*(情報|データ).*ありません|お問い合わせ番号が見つかりません/.test(pageText))
      return { kind: "ERROR", code: "NOT_FOUND" };
    return { kind: "ERROR", code: "CONTRACT_CHANGED" };
  }
  const rows = directRows(historyTables[0]);
  if (rows.length < 2 || !hasCells(rows[0], "TH", 5) || !hasCells(rows[1], "TH", 1) ||
      JSON.stringify(values(rows[0])) !== JSON.stringify(["状態発生日", "配送履歴", "詳細", "取扱局", "県名等"]) ||
      values(rows[1])[0] !== "郵便番号" || rowspan(cells(rows[1])[0]) !== "1" ||
      cells(rows[0]).some((node, index) => rowspan(node) !== (index === 3 ? "1" : "2")))
    return { kind: "ERROR", code: "CONTRACT_CHANGED" };
  const data = rows.slice(2);
  if (!data.length) return { kind: "ERROR", code: "NO_HISTORY" };
  if (data.length % 2 !== 0) return { kind: "ERROR", code: "CONTRACT_CHANGED" };
  const history: TrackingHistory[] = [];
  for (let i = 0; i < data.length; i += 2) {
    const first = data[i], second = data[i + 1];
    if (!hasCells(first, "TD", 5) || !hasCells(second, "TD", 1) ||
        cells(first).some((node, index) => rowspan(node) !== (index === 3 ? "1" : "2")) ||
        rowspan(cells(second)[0]) !== "1")
      return { kind: "ERROR", code: "CONTRACT_CHANGED" };
    const [dateTimeText, statusText, detailText, officeText, prefectureText] = values(first);
    const [postalCodeText] = values(second);
    if (!dateTimeText || !statusText)
      return { kind: "ERROR", code: "CONTRACT_CHANGED" };
    history.push({ dateTimeText, statusText, officeText,
      otherFields: [detailText, prefectureText, postalCodeText] });
  }
  const state = stateFor(history[history.length - 1].statusText);
  return state ? { kind: "FOUND", state, history } : { kind: "ERROR", code: "UNKNOWN_STATUS", history };
}

export async function fetchJapanPostTracking(trackingNumber: string, fetcher: typeof fetch = fetch): Promise<TrackingResult> {
  if (!/^\d{12}$/.test(trackingNumber)) return { kind: "ERROR", code: "INVALID_NUMBER" };
  let url = new URL(`https://${HOST}${SEARCH_PATH}`);
  url.searchParams.set("requestNo1", trackingNumber);
  url.searchParams.set("locale", "ja");
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!allowedTrackingUrl(url)) return { kind: "ERROR", code: "UNSAFE_REDIRECT" };
      const response = await fetcher(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(10000),
        headers: { Accept: "text/html" }, cache: "no-store" });
      if (!allowedTrackingUrl(new URL(response.url))) return { kind: "ERROR", code: "UNSAFE_REDIRECT" };
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { kind: "ERROR", code: "CONTRACT_CHANGED" };
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) return { kind: "ERROR", code: "UPSTREAM_ERROR" };
      if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html"))
        return { kind: "ERROR", code: "CONTRACT_CHANGED" };
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_HTML_BYTES) return { kind: "ERROR", code: "CONTRACT_CHANGED" };
      return parseJapanPostTracking(new TextDecoder("utf-8", { fatal: true }).decode(bytes), trackingNumber);
    }
    return { kind: "ERROR", code: "UNSAFE_REDIRECT" };
  } catch {
    return { kind: "ERROR", code: "UPSTREAM_ERROR" };
  }
}

export async function pollJapanPostShipments(
  db: Pick<PrismaClient, "shipment">, fetcher: typeof fetch = fetch,
): Promise<{ shipmentId: number; trackingNumber: string; result: TrackingResult }[]> {
  const shipments = await db.shipment.findMany({
    where: { direction: "OUTBOUND", carrierCode: "JAPAN_POST",
      AND: [{ trackingNumber: { not: null } }, { trackingNumber: { not: "" } }],
      status: { in: [...JAPAN_POST_POLL_STATUSES] } },
    select: { id: true, trackingNumber: true }, orderBy: { id: "asc" }, take: JAPAN_POST_POLL_CAP,
  });
  const output = [];
  const byNumber = new Map<string, TrackingResult>();
  for (const shipment of shipments) {
    const trackingNumber = shipment.trackingNumber ?? "";
    let result = byNumber.get(trackingNumber);
    if (!result) {
      result = await fetchJapanPostTracking(trackingNumber, fetcher);
      byNumber.set(trackingNumber, result);
    }
    output.push({ shipmentId: shipment.id, trackingNumber,
      result });
  }
  return output;
}
