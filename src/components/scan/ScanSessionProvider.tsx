"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWorkTimer } from "@/components/work-time/WorkTimerProvider";
import {
  addPackingScan, addSelection, combineLocationScanResults, combineScanResults, enqueueQueuedScan, locationScanCandidates, MAX_LOCATION_AUDIT_REPAIRS, MAX_LOCATION_MOVE_REPAIRS, MAX_QUEUED_SCANS, MAX_SHIPMENT_REPAIRS,
  nextQueuedScan, scanCandidates, scanPhase, shipmentConfirmationBlockAfterSelectionChange,
  shouldDebounceScan, timerDecision, packingEligibilityError, packingLocallyComplete, packingReadRequest,
  packingResponseIsCurrent, packingSnapshotChanged, parsePackingShipment, parsePackingShipmentId,
  type LocationScanResult, type PackingMismatch, type PackingShipment, type ScanDebounceState, type ScanMode, type ScanResult, type SelectedRepair,
} from "@/lib/scan-session-domain";
import { advanceWedgeBuffer, EMPTY_WEDGE_BUFFER } from "@/lib/scan-wedge";
import type { SelectedStorageLocation } from "@/lib/storage-location-resolver";
import type { StorageLocationAuditResult } from "@/lib/storage-location-audit";
import { createSelectedShipment, ShipmentResultUncertainError } from "@/lib/shipment-confirmation";

type Feedback = { kind: "success" | "error" | "info"; message: string } | null;
type ScanSessionContextValue = {
  mode: ScanMode;
  selected: SelectedRepair[];
  candidate: SelectedRepair | null;
  feedback: Feedback;
  scanning: boolean;
  queuedCount: number;
  destination: SelectedStorageLocation | null;
  moving: boolean;
  auditResult: StorageLocationAuditResult | null;
  auditing: boolean;
  creatingShipment: boolean;
  shipmentConfirmationBlocked: boolean;
  packingShipmentId: string;
  packingTarget: PackingShipment | null;
  packingMatched: SelectedRepair[];
  packingMismatches: PackingMismatch[];
  packingLoading: boolean;
  packingRechecking: boolean;
  packingConfirmed: boolean;
  setMode: (mode: ScanMode) => void;
  setPackingShipmentId: (id: string) => void;
  loadPackingShipment: () => Promise<void>;
  confirmPacking: () => Promise<void>;
  scan: (raw: string) => void;
  remove: (repairId: number) => void;
  clear: () => void;
  confirmTimer: () => Promise<void>;
  confirmLocationMove: () => Promise<void>;
  confirmLocationAudit: () => Promise<void>;
  confirmShipment: () => Promise<void>;
  resetLocationDestination: () => void;
};

const ScanSessionContext = createContext<ScanSessionContextValue | null>(null);
type PendingScan = { raw: string; mode: ScanMode; generation: number };

function isPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseResult(value: unknown): ScanResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("タグの応答形式が不正です。");
  const result = value as Record<string, unknown>;
  if (result.status === "NOT_FOUND") return { status: "NOT_FOUND" };
  if (!isPositiveId(result.physicalTagId) || typeof result.shortCode !== "string") {
    throw new Error("タグの応答形式が不正です。");
  }
  const base = { physicalTagId: result.physicalTagId, shortCode: result.shortCode };
  if (result.status === "RETIRED" || result.status === "UNASSIGNED") return { status: result.status, ...base };
  if (result.status === "RESOLVED" && isPositiveId(result.repairId) &&
      isPositiveId(result.customerId) && typeof result.inquiryNumber === "string") {
    return { status: "RESOLVED", ...base, repairId: result.repairId,
      customerId: result.customerId, inquiryNumber: result.inquiryNumber };
  }
  throw new Error("タグの応答形式が不正です。");
}

function parseLocationResult(value: unknown): LocationScanResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("保管場所の応答形式が不正です。");
  const result = value as Record<string, unknown>;
  if (result.status === "NOT_FOUND") return { status: "NOT_FOUND" };
  if (!isPositiveId(result.storageLocationId) || typeof result.name !== "string" ||
      typeof result.locationType !== "string" ||
      (result.shortCode !== null && typeof result.shortCode !== "string") ||
      (result.status !== "INACTIVE" && result.status !== "RESOLVED")) {
    throw new Error("保管場所の応答形式が不正です。");
  }
  return { status: result.status, storageLocationId: result.storageLocationId,
    name: result.name, locationType: result.locationType, shortCode: result.shortCode };
}

async function resolveCandidate(identifier: { type: string; value: string }): Promise<ScanResult> {
  const response = await fetch("/api/physical-tags/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(identifier),
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("認証が必要です。再ログインしてください。");
    throw new Error("タグを照合できませんでした。もう一度お試しください。");
  }
  return parseResult(await response.json());
}

async function resolveLocationCandidate(identifier: { type: string; value: string }): Promise<LocationScanResult> {
  const response = await fetch("/api/storage-locations/resolve", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(identifier), cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("認証が必要です。再ログインしてください。");
    throw new Error("保管場所を照合できませんでした。もう一度お試しください。");
  }
  return parseLocationResult(await response.json());
}

export function ScanSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const timer = useWorkTimer();
  const [mode, setModeState] = useState<ScanMode>("OPEN_REPAIR");
  const [selected, setSelected] = useState<SelectedRepair[]>([]);
  const [candidate, setCandidate] = useState<SelectedRepair | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [scanning, setScanning] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [destination, setDestination] = useState<SelectedStorageLocation | null>(null);
  const [moving, setMoving] = useState(false);
  const [auditResult, setAuditResult] = useState<StorageLocationAuditResult | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [creatingShipment, setCreatingShipment] = useState(false);
  const [shipmentConfirmationBlocked, setShipmentConfirmationBlocked] = useState(false);
  const [packingShipmentId, setPackingShipmentIdState] = useState("");
  const [packingTarget, setPackingTarget] = useState<PackingShipment | null>(null);
  const [packingMatched, setPackingMatched] = useState<SelectedRepair[]>([]);
  const [packingMismatches, setPackingMismatches] = useState<PackingMismatch[]>([]);
  const [packingLoading, setPackingLoading] = useState(false);
  const [packingRechecking, setPackingRechecking] = useState(false);
  const [packingConfirmed, setPackingConfirmed] = useState(false);
  const modeRef = useRef<ScanMode>(mode);
  const destinationRef = useRef<SelectedStorageLocation | null>(null);
  const movingRef = useRef(false);
  const auditingRef = useRef(false);
  const creatingShipmentRef = useRef(false);
  const shipmentConfirmationBlockedRef = useRef(false);
  const auditRequestRef = useRef(0);
  const selectedRef = useRef<SelectedRepair[]>([]);
  const scanBusyRef = useRef(false);
  const queueRef = useRef<PendingScan[]>([]);
  const generationRef = useRef(0);
  const wedgeRef = useRef(EMPTY_WEDGE_BUFFER);
  const debounceRef = useRef<ScanDebounceState>(null);
  const packingShipmentIdRef = useRef("");
  const packingTargetRef = useRef<PackingShipment | null>(null);
  const packingMatchedRef = useRef<SelectedRepair[]>([]);
  const packingMismatchesRef = useRef<PackingMismatch[]>([]);
  const packingLoadingRef = useRef(false);
  const packingRecheckingRef = useRef(false);
  const packingRequestRef = useRef(0);

  const resetPacking = useCallback(() => {
    packingRequestRef.current += 1;
    packingTargetRef.current = null;
    packingMatchedRef.current = [];
    packingMismatchesRef.current = [];
    packingLoadingRef.current = false;
    packingRecheckingRef.current = false;
    setPackingTarget(null);
    setPackingMatched([]);
    setPackingMismatches([]);
    setPackingLoading(false);
    setPackingRechecking(false);
    setPackingConfirmed(false);
  }, []);

  const setMode = useCallback((next: ScanMode) => {
    if (creatingShipmentRef.current) return;
    if (next === modeRef.current) return;
    modeRef.current = next;
    generationRef.current += 1;
    resetPacking();
    packingShipmentIdRef.current = "";
    setPackingShipmentIdState("");
    auditRequestRef.current += 1;
    auditingRef.current = false;
    setAuditing(false);
    setAuditResult(null);
    queueRef.current = [];
    setQueuedCount(0);
    selectedRef.current = [];
    shipmentConfirmationBlockedRef.current = false;
    setShipmentConfirmationBlocked(false);
    destinationRef.current = null;
    setDestination(null);
    setModeState(next);
    setSelected([]);
    setCandidate(null);
    setFeedback({ kind: "info", message: "モードを切り替えました。選択をクリアしました。" });
    wedgeRef.current = EMPTY_WEDGE_BUFFER;
    debounceRef.current = null;
  }, [resetPacking]);

  const setPackingShipmentId = useCallback((id: string) => {
    if (id === packingShipmentIdRef.current) return;
    generationRef.current += 1;
    queueRef.current = [];
    setQueuedCount(0);
    debounceRef.current = null;
    wedgeRef.current = EMPTY_WEDGE_BUFFER;
    resetPacking();
    packingShipmentIdRef.current = id;
    setPackingShipmentIdState(id);
    setFeedback(null);
  }, [resetPacking]);

  const packingRequestCurrent = useCallback((request: { mode: ScanMode; generation: number; shipmentId: number; requestId: number }) => {
    let shipmentId: number | null = null;
    try { shipmentId = parsePackingShipmentId(packingShipmentIdRef.current); } catch { /* invalid input */ }
    return packingResponseIsCurrent(request, { mode: modeRef.current, generation: generationRef.current,
      shipmentId, requestId: packingRequestRef.current });
  }, []);

  const fetchPackingShipment = useCallback(async (id: number): Promise<PackingShipment> => {
    const { url, init } = packingReadRequest(id);
    const response = await fetch(url, init);
    if (!response.ok) {
      if (response.status === 401) throw new Error("認証が必要です。再ログインしてください。");
      if (response.status === 404) throw new Error("発送が見つかりません。");
      throw new Error("発送を取得できませんでした。");
    }
    return parsePackingShipment(await response.json(), id);
  }, []);

  const loadPackingShipment = useCallback(async () => {
    if (modeRef.current !== "SHIPMENT_PACKING") return;
    let id: number;
    try { id = parsePackingShipmentId(packingShipmentIdRef.current); }
    catch (cause) {
      setFeedback({ kind: "error", message: cause instanceof Error ? cause.message : "発送IDが不正です。" });
      return;
    }
    generationRef.current += 1;
    queueRef.current = [];
    setQueuedCount(0);
    debounceRef.current = null;
    resetPacking();
    packingLoadingRef.current = true;
    setPackingLoading(true);
    setFeedback({ kind: "info", message: `発送 ID ${id} を読み込んでいます。` });
    const request = { mode: "SHIPMENT_PACKING" as const, generation: generationRef.current,
      shipmentId: id, requestId: packingRequestRef.current };
    try {
      const target = await fetchPackingShipment(id);
      if (!packingRequestCurrent(request)) return;
      const eligibilityError = packingEligibilityError(target);
      if (eligibilityError) throw new Error(eligibilityError);
      packingTargetRef.current = target;
      setPackingTarget(target);
      setFeedback({ kind: "success", message: `発送 ID ${id} を読み込みました。タグを読み取ってください。` });
    } catch (cause) {
      if (packingRequestCurrent(request)) setFeedback({ kind: "error", message: cause instanceof Error ? cause.message : "発送を読み込めませんでした。" });
    } finally {
      if (packingRequestCurrent(request)) {
        packingLoadingRef.current = false;
        setPackingLoading(false);
      }
    }
  }, [fetchPackingShipment, packingRequestCurrent, resetPacking]);

  const confirmPacking = useCallback(async () => {
    const target = packingTargetRef.current;
    if (modeRef.current !== "SHIPMENT_PACKING" || !target || packingLoadingRef.current || packingRecheckingRef.current ||
        scanBusyRef.current || queueRef.current.length > 0 ||
        !packingLocallyComplete(target, packingMatchedRef.current, packingMismatchesRef.current)) return;
    packingRecheckingRef.current = true;
    setPackingRechecking(true);
    setPackingConfirmed(false);
    const request = { mode: "SHIPMENT_PACKING" as const, generation: generationRef.current,
      shipmentId: target.shipmentId, requestId: ++packingRequestRef.current };
    try {
      const current = await fetchPackingShipment(target.shipmentId);
      if (!packingRequestCurrent(request)) return;
      const eligibilityError = packingEligibilityError(current);
      if (eligibilityError || packingSnapshotChanged(target, current)) {
        resetPacking();
        setFeedback({ kind: "error", message: `発送の内容または状態が変更されました。${eligibilityError ?? ""}発送IDを再読込し、最初から梱包確認してください。` });
        return;
      }
      if (!packingLocallyComplete(target, packingMatchedRef.current, packingMismatchesRef.current)) return;
      setPackingConfirmed(true);
      setFeedback({ kind: "success", message: "梱包内容一致" });
    } catch (cause) {
      if (packingRequestCurrent(request)) {
        resetPacking();
        setFeedback({ kind: "error", message: `${cause instanceof Error ? cause.message : "再確認に失敗しました。"} 発送IDを再読込し、最初から梱包確認してください。` });
      }
    } finally {
      if (packingRequestCurrent(request)) {
        packingRecheckingRef.current = false;
        setPackingRechecking(false);
      }
    }
  }, [fetchPackingShipment, packingRequestCurrent, resetPacking]);

  const processScan = useCallback(async ({ raw, mode: scanMode, generation }: PendingScan) => {
    try {
      if (scanPhase(scanMode, destinationRef.current) === "LOCATION") {
        const locationResult = combineLocationScanResults(await Promise.all(locationScanCandidates(raw).map(resolveLocationCandidate)));
        if (generation !== generationRef.current) return;
        if (locationResult.status === "NOT_FOUND") {
          setFeedback({ kind: "error", message: "未登録の保管場所タグです。" });
        } else if (locationResult.status === "AMBIGUOUS") {
          setFeedback({ kind: "error", message: "識別子が複数の保管場所に一致しました。確認が必要です。" });
        } else if (locationResult.status === "INACTIVE") {
          setFeedback({ kind: "error", message: `無効な保管場所です: ${locationResult.name}` });
        } else {
          const nextDestination: SelectedStorageLocation = {
            storageLocationId: locationResult.storageLocationId, name: locationResult.name,
            locationType: locationResult.locationType, shortCode: locationResult.shortCode,
          };
          destinationRef.current = nextDestination;
          setDestination(nextDestination);
          setAuditResult(null);
          setFeedback({ kind: "success", message: `${scanMode === "LOCATION_AUDIT" ? "棚卸し場所" : "移動先"}「${nextDestination.name}」を選択しました。時計のタグを読み取ってください。` });
        }
        return;
      }
      const result = combineScanResults(await Promise.all(scanCandidates(raw).map(resolveCandidate)));
      if (generation !== generationRef.current) return;
      if (result.status === "NOT_FOUND") {
        setCandidate(null);
        setFeedback({ kind: "error", message: "未登録のタグです。" });
      } else if (result.status === "AMBIGUOUS") {
        setCandidate(null);
        setFeedback({ kind: "error", message: "識別子が複数のタグに一致しました。確認が必要です。" });
      } else if (result.status === "RETIRED") {
        setCandidate(null);
        setFeedback({ kind: "error", message: `廃止済みのタグです: ${result.shortCode}` });
      } else if (result.status === "UNASSIGNED") {
        setCandidate(null);
        setFeedback({ kind: "error", message: `未割当のタグです: ${result.shortCode}` });
      } else {
        const repair: SelectedRepair = {
          repairId: result.repairId,
          inquiryNumber: result.inquiryNumber,
          customerId: result.customerId,
          physicalTagId: result.physicalTagId,
          shortCode: result.shortCode,
        };
        if (scanMode === "OPEN_REPAIR") {
          setFeedback({ kind: "success", message: `${repair.inquiryNumber} を開きます。` });
          router.push(`/repairs/${repair.repairId}`);
        } else if (scanMode === "TIMER") {
          if (timerDecision(timer.active, repair.repairId) === "ALREADY_ACTIVE") {
            setCandidate(null);
            setFeedback({ kind: "info", message: `${repair.inquiryNumber} は既に計測中です。` });
          } else {
            setCandidate(repair);
            setFeedback({ kind: "info", message: `${repair.inquiryNumber} / ${repair.shortCode} を確認してタイマーを開始してください。` });
          }
        } else if (scanMode === "SHIPMENT_PACKING") {
          const target = packingTargetRef.current;
          if (!target) {
            setFeedback({ kind: "error", message: "先に発送IDを読み込んでください。" });
            return;
          }
          const next = addPackingScan(target, packingMatchedRef.current, packingMismatchesRef.current, repair);
          packingMatchedRef.current = next.matched;
          packingMismatchesRef.current = next.mismatches;
          setPackingMatched(next.matched);
          setPackingMismatches(next.mismatches);
          if (next.outcome === "DUPLICATE") {
            setFeedback({ kind: "info", message: `${repair.inquiryNumber} は読み取り済みです（重複）。` });
          } else if (next.outcome === "MISMATCH") {
            setFeedback({ kind: "error", message: `${repair.inquiryNumber} はこの発送に含まれません。不一致を記録しました。` });
          } else {
            setFeedback({ kind: "success", message: `${repair.inquiryNumber} を梱包対象として照合しました。` });
          }
        } else {
          const next = addSelection(scanMode, selectedRef.current, repair);
          if (next.outcome === "DUPLICATE") {
            setFeedback({ kind: "info", message: `${repair.inquiryNumber} は選択済みです（重複）。` });
          } else if (next.outcome === "LIMIT_REACHED") {
            const message = scanMode === "SHIPMENT_SELECT" ?
              `一度に発送対象にできるのは${MAX_SHIPMENT_REPAIRS}件までです。選択を確認して発送を作成してください。` :
              scanMode === "LOCATION_AUDIT" ?
                `一度に棚卸しできるのは${MAX_LOCATION_AUDIT_REPAIRS}件までです。選択を整理してから確認してください。` :
                `一度に移動できるのは${MAX_LOCATION_MOVE_REPAIRS}件までです。先に選択済みの案件を移動してください。`;
            setFeedback({ kind: "error", message });
          } else if (next.outcome === "MIXED_CUSTOMER") {
            setFeedback({ kind: "error", message: `${repair.inquiryNumber} は別顧客のため追加できません。` });
          } else {
            if (scanMode === "LOCATION_AUDIT") setAuditResult(null);
            if (scanMode === "SHIPMENT_SELECT") {
              shipmentConfirmationBlockedRef.current = shipmentConfirmationBlockAfterSelectionChange(
                shipmentConfirmationBlockedRef.current, selectedRef.current, next.selected);
              setShipmentConfirmationBlocked(shipmentConfirmationBlockedRef.current);
            }
            selectedRef.current = next.selected;
            setSelected(next.selected);
            setFeedback({ kind: "success", message: `${repair.inquiryNumber} / ${repair.shortCode} を選択しました。` });
          }
        }
      }
    } catch (cause) {
      if (generation === generationRef.current) {
        setCandidate(null);
        setFeedback({ kind: "error", message: cause instanceof Error ? cause.message : "タグを照合できませんでした。" });
      }
    }
  }, [router, timer.active]);
  const processRef = useRef(processScan);
  processRef.current = processScan;

  const drainQueue = useCallback(async () => {
    if (scanBusyRef.current) return;
    scanBusyRef.current = true;
    setScanning(true);
    try {
      while (queueRef.current.length > 0) {
        const { next, remaining } = nextQueuedScan(queueRef.current, modeRef.current, generationRef.current);
        queueRef.current = remaining;
        setQueuedCount(remaining.length);
        if (next) await processRef.current(next);
      }
    } finally {
      scanBusyRef.current = false;
      setScanning(false);
    }
  }, []);

  const scan = useCallback((raw: string) => {
    if (creatingShipmentRef.current) {
      setFeedback({ kind: "info", message: "発送作成中です。完了後に読み取ってください。" });
      return;
    }
    if (auditingRef.current) {
      setFeedback({ kind: "info", message: "棚卸し結果の確認中です。完了後に読み取ってください。" });
      return;
    }
    if (movingRef.current) {
      setFeedback({ kind: "info", message: "移動処理中です。完了後に読み取ってください。" });
      return;
    }
    if (modeRef.current === "SHIPMENT_PACKING") {
      if (packingRecheckingRef.current) {
        setFeedback({ kind: "info", message: "発送の再確認中です。完了後に読み取ってください。" });
        return;
      }
      if (packingLoadingRef.current || !packingTargetRef.current) {
        setFeedback({ kind: "error", message: "先に発送IDを読み込んでください。" });
        return;
      }
    }
    const value = raw.trim();
    if (!value) {
      setFeedback({ kind: "error", message: "読み取り値を入力してください。" });
      return;
    }
    const now = performance.now();
    if (shouldDebounceScan(debounceRef.current, value, now)) return;
    const queued = enqueueQueuedScan(queueRef.current,
      { raw: value, mode: modeRef.current, generation: generationRef.current });
    if (!queued.queued) {
      setFeedback({ kind: "error", message: `読取待機が${MAX_QUEUED_SCANS}件に達しました。処理が進んでから再度読み取ってください。` });
      return;
    }
    if (modeRef.current === "LOCATION_AUDIT") setAuditResult(null);
    if (modeRef.current === "SHIPMENT_PACKING") {
      setPackingConfirmed(false);
      setFeedback(null);
    }
    debounceRef.current = { raw: value, acceptedAt: now };
    queueRef.current = queued.queue;
    setQueuedCount(queueRef.current.length);
    void drainQueue();
  }, [drainQueue]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && (target.closest("input, textarea, select, [contenteditable]") ||
          (target as HTMLElement).isContentEditable)) {
        wedgeRef.current = EMPTY_WEDGE_BUFFER;
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat) {
        wedgeRef.current = EMPTY_WEDGE_BUFFER;
        return;
      }
      const next = advanceWedgeBuffer(wedgeRef.current, event.key, performance.now());
      wedgeRef.current = next.buffer;
      if (next.scan !== null) {
        event.preventDefault();
        scan(next.scan);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [scan]);

  const remove = useCallback((repairId: number) => {
    if (auditingRef.current || creatingShipmentRef.current) return;
    setAuditResult(null);
    const next = selectedRef.current.filter(item => item.repairId !== repairId);
    if (modeRef.current === "SHIPMENT_SELECT") {
      shipmentConfirmationBlockedRef.current = shipmentConfirmationBlockAfterSelectionChange(
        shipmentConfirmationBlockedRef.current, selectedRef.current, next);
      setShipmentConfirmationBlocked(shipmentConfirmationBlockedRef.current);
    }
    selectedRef.current = next;
    setSelected(selectedRef.current);
    setFeedback({ kind: "info", message: "選択から外しました。" });
  }, []);
  const clear = useCallback(() => {
    if (auditingRef.current || creatingShipmentRef.current) return;
    if (modeRef.current === "SHIPMENT_PACKING") {
      generationRef.current += 1;
      queueRef.current = [];
      setQueuedCount(0);
      debounceRef.current = null;
      wedgeRef.current = EMPTY_WEDGE_BUFFER;
      resetPacking();
      packingShipmentIdRef.current = "";
      setPackingShipmentIdState("");
      setFeedback({ kind: "info", message: "梱包確認をクリアしました。" });
      return;
    }
    setAuditResult(null);
    shipmentConfirmationBlockedRef.current = false;
    setShipmentConfirmationBlocked(false);
    selectedRef.current = [];
    setSelected([]);
    setFeedback({ kind: "info", message: "選択をクリアしました。" });
  }, [resetPacking]);
  const resetLocationDestination = useCallback(() => {
    if (creatingShipmentRef.current) return;
    generationRef.current += 1;
    auditRequestRef.current += 1;
    auditingRef.current = false;
    setAuditing(false);
    setAuditResult(null);
    queueRef.current = [];
    setQueuedCount(0);
    destinationRef.current = null;
    setDestination(null);
    selectedRef.current = [];
    setSelected([]);
    setCandidate(null);
    wedgeRef.current = EMPTY_WEDGE_BUFFER;
    debounceRef.current = null;
    setFeedback({ kind: "info", message: modeRef.current === "LOCATION_AUDIT" ?
      "棚卸し場所と選択をクリアしました。" : "移動先と選択をクリアしました。" });
  }, []);
  const confirmLocationAudit = useCallback(async () => {
    if (modeRef.current !== "LOCATION_AUDIT" || !destinationRef.current || auditingRef.current ||
        scanBusyRef.current || queueRef.current.length > 0) return;
    auditingRef.current = true;
    setAuditing(true);
    setAuditResult(null);
    const requestId = ++auditRequestRef.current;
    const currentGeneration = generationRef.current;
    const currentLocationId = destinationRef.current.storageLocationId;
    const repairIds = selectedRef.current.map(item => item.repairId);
    try {
      const response = await fetch("/api/storage-locations/audit", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ storageLocationId: currentLocationId, repairIds }),
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error("認証が必要です。再ログインしてください。");
        if (response.status === 404) throw new Error("棚卸し場所または修理案件が見つかりません。再確認してください。");
        if (response.status === 409) throw new Error("棚卸し場所は使用できません。再確認してください。");
        throw new Error("棚卸し結果を確認できませんでした。");
      }
      const result: StorageLocationAuditResult = await response.json();
      if (!result || result.storageLocation?.storageLocationId !== currentLocationId ||
          !Array.isArray(result.scanned) || !Array.isArray(result.missing) || !result.counts ||
          result.scanned.length !== repairIds.length) throw new Error("棚卸し結果の応答形式が不正です。");
      if (requestId === auditRequestRef.current && currentGeneration === generationRef.current &&
          currentLocationId === destinationRef.current?.storageLocationId && modeRef.current === "LOCATION_AUDIT") {
        setAuditResult(result);
        setFeedback({ kind: "success", message: "棚卸し結果を確認しました。" });
      }
    } catch (cause) {
      if (requestId === auditRequestRef.current && currentGeneration === generationRef.current &&
          currentLocationId === destinationRef.current?.storageLocationId && modeRef.current === "LOCATION_AUDIT") {
        setFeedback({ kind: "error", message: cause instanceof Error ? cause.message : "棚卸し結果を確認できませんでした。" });
      }
    } finally {
      if (requestId === auditRequestRef.current) {
        auditingRef.current = false;
        setAuditing(false);
      }
    }
  }, []);
  const confirmLocationMove = useCallback(async () => {
    if (modeRef.current !== "LOCATION_MOVE" || !destinationRef.current || !selectedRef.current.length ||
        movingRef.current || scanBusyRef.current || queueRef.current.length > 0) return;
    movingRef.current = true;
    setMoving(true);
    const currentGeneration = generationRef.current;
    const currentDestinationId = destinationRef.current.storageLocationId;
    const repairIds = selectedRef.current.map(item => item.repairId);
    try {
      const response = await fetch("/api/storage-locations/move", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ storageLocationId: currentDestinationId, repairIds }),
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error("認証が必要です。再ログインしてください。");
        if (response.status === 409) throw new Error("保管場所の状態が変わりました。確認して再実行してください。");
        throw new Error("保管場所の移動に失敗しました。");
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || Array.isArray(result) ||
          !Array.isArray((result as { moved?: unknown }).moved) ||
          !Array.isArray((result as { unchangedRepairIds?: unknown }).unchangedRepairIds)) {
        throw new Error("移動結果の応答形式が不正です。");
      }
      if (currentGeneration === generationRef.current && currentDestinationId === destinationRef.current?.storageLocationId) {
        selectedRef.current = [];
        setSelected([]);
        setFeedback({ kind: "success", message: `移動しました: ${(result as { moved: unknown[] }).moved.length}件、変更なし: ${(result as { unchangedRepairIds: unknown[] }).unchangedRepairIds.length}件。` });
      }
    } catch (cause) {
      if (currentGeneration === generationRef.current) {
        setFeedback({ kind: "error", message: cause instanceof Error ? cause.message : "保管場所の移動に失敗しました。" });
      }
    } finally {
      movingRef.current = false;
      setMoving(false);
    }
  }, []);
  const confirmShipment = useCallback(async () => {
    if (modeRef.current !== "SHIPMENT_SELECT" || selectedRef.current.length === 0 ||
        shipmentConfirmationBlockedRef.current || creatingShipmentRef.current ||
        scanBusyRef.current || queueRef.current.length > 0) return;
    creatingShipmentRef.current = true;
    setCreatingShipment(true);
    const currentGeneration = generationRef.current;
    const repairIds = selectedRef.current.map(item => item.repairId);
    try {
      const shipmentId = await createSelectedShipment(repairIds);
      if (currentGeneration === generationRef.current && modeRef.current === "SHIPMENT_SELECT") {
        shipmentConfirmationBlockedRef.current = false;
        setShipmentConfirmationBlocked(false);
        selectedRef.current = [];
        setSelected([]);
        setFeedback({ kind: "success", message: `発送 ID ${shipmentId} を作成しました。` });
      }
    } catch (cause) {
      if (currentGeneration === generationRef.current && modeRef.current === "SHIPMENT_SELECT") {
        if (cause instanceof ShipmentResultUncertainError) {
          shipmentConfirmationBlockedRef.current = true;
          setShipmentConfirmationBlocked(true);
        }
        setFeedback({ kind: "error", message: cause instanceof Error ? cause.message : "発送を作成できませんでした。" });
      }
    } finally {
      creatingShipmentRef.current = false;
      setCreatingShipment(false);
    }
  }, []);
  const confirmTimer = useCallback(async () => {
    if (!candidate || timer.loading || !timer.ready || timer.busy) return;
    if (timerDecision(timer.active, candidate.repairId) === "ALREADY_ACTIVE") {
      setCandidate(null);
      setFeedback({ kind: "info", message: `${candidate.inquiryNumber} は既に計測中です。` });
      return;
    }
    await timer.start({ activityType: "REPAIR", repairId: candidate.repairId, label: candidate.inquiryNumber });
    // WorkTimerProvider reports start errors and updates active only after a successful response.
  }, [candidate, timer]);

  useEffect(() => {
    if (candidate && timerDecision(timer.active, candidate.repairId) === "ALREADY_ACTIVE") {
      setCandidate(null);
      setFeedback({ kind: "success", message: `${candidate.inquiryNumber} の計測を開始しました。` });
    }
  }, [candidate, timer.active]);

  return <ScanSessionContext.Provider value={{ mode, selected, candidate, feedback, scanning, queuedCount,
    destination, moving, auditResult, auditing, creatingShipment, shipmentConfirmationBlocked,
    packingShipmentId, packingTarget, packingMatched, packingMismatches, packingLoading, packingRechecking, packingConfirmed,
    setMode, setPackingShipmentId, loadPackingShipment, confirmPacking, scan, remove, clear, confirmTimer,
    confirmLocationMove, confirmLocationAudit, confirmShipment, resetLocationDestination }}>{children}</ScanSessionContext.Provider>;
}

export function useScanSession() {
  const value = useContext(ScanSessionContext);
  if (!value) throw new Error("ScanSessionProvider is required.");
  return value;
}
