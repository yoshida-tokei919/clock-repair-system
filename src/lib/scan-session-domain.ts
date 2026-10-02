import { parsePhysicalTagIdentifier, type PhysicalTagIdentifier } from "./physical-tag-resolver";
import type { SelectedStorageLocation, StorageLocationIdentifier } from "./storage-location-resolver";

export const SCAN_MODES = ["OPEN_REPAIR", "TIMER", "BATCH_SELECT", "DELIVERY_NOTE", "SHIPMENT_SELECT", "LOCATION_MOVE", "LOCATION_AUDIT"] as const;
export type ScanMode = typeof SCAN_MODES[number];
export type SelectedRepair = {
  repairId: number;
  inquiryNumber: string;
  customerId: number;
  physicalTagId: number;
  shortCode: string;
};
export type ScanResult =
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS" }
  | { status: "RETIRED"; physicalTagId: number; shortCode: string }
  | { status: "UNASSIGNED"; physicalTagId: number; shortCode: string }
  | ({ status: "RESOLVED" } & SelectedRepair);

const COMPLETE_HEX_BYTES = /^[0-9A-Fa-f]{2}(?:[:\- ]?[0-9A-Fa-f]{2})*$/;

export function scanCandidates(raw: string): PhysicalTagIdentifier[] {
  const value = raw.trim();
  if (!value) return [];
  const candidates: PhysicalTagIdentifier[] = [];
  if (/^PT-[0-9]{6,}$/i.test(value)) {
    candidates.push({ type: "SHORT_CODE", value });
  } else {
    candidates.push({ type: "QR_TOKEN", value });
  }
  if (COMPLETE_HEX_BYTES.test(value)) {
    candidates.push(parsePhysicalTagIdentifier({ type: "NFC_UID", value }));
  }
  return candidates.filter((candidate, index) =>
    candidates.findIndex(other => other.type === candidate.type && other.value === candidate.value) === index);
}

export function locationScanCandidates(raw: string): StorageLocationIdentifier[] {
  const value = raw.trim();
  if (!value) return [];
  const candidates: StorageLocationIdentifier[] = /^LOC-[0-9]{6,}$/i.test(value)
    ? [{ type: "SHORT_CODE", value }] : [{ type: "QR_TOKEN", value }];
  if (COMPLETE_HEX_BYTES.test(value)) {
    candidates.push({ type: "NFC_UID", value: parsePhysicalTagIdentifier({ type: "NFC_UID", value }).value });
  }
  return candidates.filter((candidate, index) => candidates.findIndex(other =>
    other.type === candidate.type && other.value === candidate.value) === index);
}

export type LocationScanResult = { status: "NOT_FOUND" } | { status: "AMBIGUOUS" } |
  ({ status: "INACTIVE" | "RESOLVED" } & SelectedStorageLocation);

export function combineLocationScanResults(results: LocationScanResult[]): LocationScanResult {
  if (results.some(result => result.status === "AMBIGUOUS")) return { status: "AMBIGUOUS" };
  const found = results.filter((result): result is Extract<LocationScanResult, { storageLocationId: number }> =>
    result.status === "INACTIVE" || result.status === "RESOLVED");
  if (found.length === 0) return { status: "NOT_FOUND" };
  const first = found[0];
  if (found.some(result => result.storageLocationId !== first.storageLocationId || result.status !== first.status ||
    result.name !== first.name || result.locationType !== first.locationType || result.shortCode !== first.shortCode)) {
    return { status: "AMBIGUOUS" };
  }
  return first;
}

export function scanPhase(mode: ScanMode, destination: SelectedStorageLocation | null): "LOCATION" | "REPAIR" {
  return (mode === "LOCATION_MOVE" || mode === "LOCATION_AUDIT") && !destination ? "LOCATION" : "REPAIR";
}

export function combineScanResults(results: ScanResult[]): ScanResult {
  const found = results.filter((result): result is Extract<ScanResult, { physicalTagId: number }> =>
    result.status !== "NOT_FOUND" && result.status !== "AMBIGUOUS");
  if (results.some(result => result.status === "AMBIGUOUS")) return { status: "AMBIGUOUS" };
  if (found.length === 0) return { status: "NOT_FOUND" };
  const first = found[0];
  if (found.some(result => result.physicalTagId !== first.physicalTagId ||
      result.shortCode !== first.shortCode || result.status !== first.status ||
      (result.status === "RESOLVED" && first.status === "RESOLVED" &&
        (result.repairId !== first.repairId || result.customerId !== first.customerId)))) {
    return { status: "AMBIGUOUS" };
  }
  return first;
}

export const MAX_LOCATION_MOVE_REPAIRS = 100;
export const MAX_LOCATION_AUDIT_REPAIRS = 100;
export const MAX_SHIPMENT_REPAIRS = 100;
export function shipmentConfirmationBlockAfterSelectionChange(
  blocked: boolean, previous: SelectedRepair[], next: SelectedRepair[],
): boolean {
  return blocked && previous.length === next.length &&
    previous.every((repair, index) => repair.repairId === next[index].repairId);
}
export type SelectionOutcome = "ADDED" | "DUPLICATE" | "MIXED_CUSTOMER" | "LIMIT_REACHED";
export function addSelection(mode: ScanMode, selected: SelectedRepair[], repair: SelectedRepair):
  { outcome: SelectionOutcome; selected: SelectedRepair[] } {
  if (selected.some(item => item.repairId === repair.repairId)) return { outcome: "DUPLICATE", selected };
  if (((mode === "LOCATION_MOVE" && selected.length >= MAX_LOCATION_MOVE_REPAIRS) ||
      (mode === "LOCATION_AUDIT" && selected.length >= MAX_LOCATION_AUDIT_REPAIRS) ||
      (mode === "SHIPMENT_SELECT" && selected.length >= MAX_SHIPMENT_REPAIRS))) return { outcome: "LIMIT_REACHED", selected };
  if ((mode === "DELIVERY_NOTE" || mode === "SHIPMENT_SELECT") &&
      selected.length > 0 && selected[0].customerId !== repair.customerId) {
    return { outcome: "MIXED_CUSTOMER", selected };
  }
  return { outcome: "ADDED", selected: [...selected, repair] };
}

export function timerDecision(active: { activityType: string; repairId: number | null } | null, repairId: number):
  "ALREADY_ACTIVE" | "START" | "SWITCH" {
  if (active?.activityType === "REPAIR" && active.repairId === repairId) return "ALREADY_ACTIVE";
  return active ? "SWITCH" : "START";
}

// Suppress repeat input from a tag left on the reader for 750 ms after its last accepted scan.
export const SCAN_DEBOUNCE_MS = 750;
export type ScanDebounceState = { raw: string; acceptedAt: number } | null;

export function shouldDebounceScan(state: ScanDebounceState, raw: string, at: number): boolean {
  const value = raw.trim();
  return value.length > 0 && state !== null && state.raw === value &&
    at >= state.acceptedAt && at - state.acceptedAt < SCAN_DEBOUNCE_MS;
}

// Bounds pending scans while one scan is being resolved. The in-flight scan is separate.
export const MAX_QUEUED_SCANS = 16;

export function enqueueQueuedScan<T>(queue: T[], item: T): { queued: boolean; queue: T[] } {
  if (queue.length >= MAX_QUEUED_SCANS) return { queued: false, queue };
  return { queued: true, queue: [...queue, item] };
}

export function nextQueuedScan<T extends { mode: ScanMode; generation: number }>(
  queue: T[], mode: ScanMode, generation: number,
): { next: T | null; remaining: T[] } {
  const current = queue.filter(item => item.mode === mode && item.generation === generation);
  return { next: current[0] ?? null, remaining: current.slice(1) };
}
