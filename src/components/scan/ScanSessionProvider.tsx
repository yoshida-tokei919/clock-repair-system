"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWorkTimer } from "@/components/work-time/WorkTimerProvider";
import {
  addSelection, combineLocationScanResults, combineScanResults, enqueueQueuedScan, locationScanCandidates, MAX_LOCATION_MOVE_REPAIRS, MAX_QUEUED_SCANS,
  nextQueuedScan, scanCandidates, scanPhase, shouldDebounceScan, timerDecision,
  type LocationScanResult, type ScanDebounceState, type ScanMode, type ScanResult, type SelectedRepair,
} from "@/lib/scan-session-domain";
import { advanceWedgeBuffer, EMPTY_WEDGE_BUFFER } from "@/lib/scan-wedge";
import type { SelectedStorageLocation } from "@/lib/storage-location-resolver";

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
  setMode: (mode: ScanMode) => void;
  scan: (raw: string) => void;
  remove: (repairId: number) => void;
  clear: () => void;
  confirmTimer: () => Promise<void>;
  confirmLocationMove: () => Promise<void>;
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
  const modeRef = useRef<ScanMode>(mode);
  const destinationRef = useRef<SelectedStorageLocation | null>(null);
  const movingRef = useRef(false);
  const selectedRef = useRef<SelectedRepair[]>([]);
  const scanBusyRef = useRef(false);
  const queueRef = useRef<PendingScan[]>([]);
  const generationRef = useRef(0);
  const wedgeRef = useRef(EMPTY_WEDGE_BUFFER);
  const debounceRef = useRef<ScanDebounceState>(null);

  const setMode = useCallback((next: ScanMode) => {
    if (next === modeRef.current) return;
    modeRef.current = next;
    generationRef.current += 1;
    queueRef.current = [];
    setQueuedCount(0);
    selectedRef.current = [];
    destinationRef.current = null;
    setDestination(null);
    setModeState(next);
    setSelected([]);
    setCandidate(null);
    setFeedback({ kind: "info", message: "モードを切り替えました。選択をクリアしました。" });
    wedgeRef.current = EMPTY_WEDGE_BUFFER;
    debounceRef.current = null;
  }, []);

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
          setFeedback({ kind: "success", message: `移動先「${nextDestination.name}」を選択しました。時計のタグを読み取ってください。` });
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
        } else {
          const next = addSelection(scanMode, selectedRef.current, repair);
          if (next.outcome === "DUPLICATE") {
            setFeedback({ kind: "info", message: `${repair.inquiryNumber} は選択済みです（重複）。` });
          } else if (next.outcome === "LIMIT_REACHED") {
            setFeedback({ kind: "error", message: `一度に移動できるのは${MAX_LOCATION_MOVE_REPAIRS}件までです。先に選択済みの案件を移動してください。` });
          } else if (next.outcome === "MIXED_CUSTOMER") {
            setFeedback({ kind: "error", message: `${repair.inquiryNumber} は別顧客のため追加できません。` });
          } else {
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
    if (movingRef.current) {
      setFeedback({ kind: "info", message: "移動処理中です。完了後に読み取ってください。" });
      return;
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
    selectedRef.current = selectedRef.current.filter(item => item.repairId !== repairId);
    setSelected(selectedRef.current);
    setFeedback({ kind: "info", message: "選択から外しました。" });
  }, []);
  const clear = useCallback(() => {
    selectedRef.current = [];
    setSelected([]);
    setFeedback({ kind: "info", message: "選択をクリアしました。" });
  }, []);
  const resetLocationDestination = useCallback(() => {
    generationRef.current += 1;
    queueRef.current = [];
    setQueuedCount(0);
    destinationRef.current = null;
    setDestination(null);
    selectedRef.current = [];
    setSelected([]);
    setCandidate(null);
    wedgeRef.current = EMPTY_WEDGE_BUFFER;
    debounceRef.current = null;
    setFeedback({ kind: "info", message: "移動先と選択をクリアしました。" });
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
    destination, moving, setMode, scan, remove, clear, confirmTimer, confirmLocationMove, resetLocationDestination }}>{children}</ScanSessionContext.Provider>;
}

export function useScanSession() {
  const value = useContext(ScanSessionContext);
  if (!value) throw new Error("ScanSessionProvider is required.");
  return value;
}
