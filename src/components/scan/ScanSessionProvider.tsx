"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWorkTimer } from "@/components/work-time/WorkTimerProvider";
import {
  addSelection, combineScanResults, enqueueQueuedScan, MAX_QUEUED_SCANS,
  nextQueuedScan, scanCandidates, shouldDebounceScan, timerDecision,
  type ScanDebounceState, type ScanMode, type ScanResult, type SelectedRepair,
} from "@/lib/scan-session-domain";
import { advanceWedgeBuffer, EMPTY_WEDGE_BUFFER } from "@/lib/scan-wedge";
import type { PhysicalTagIdentifier } from "@/lib/physical-tag-resolver";

type Feedback = { kind: "success" | "error" | "info"; message: string } | null;
type ScanSessionContextValue = {
  mode: ScanMode;
  selected: SelectedRepair[];
  candidate: SelectedRepair | null;
  feedback: Feedback;
  scanning: boolean;
  queuedCount: number;
  setMode: (mode: ScanMode) => void;
  scan: (raw: string) => void;
  remove: (repairId: number) => void;
  clear: () => void;
  confirmTimer: () => Promise<void>;
};

const ScanSessionContext = createContext<ScanSessionContextValue | null>(null);
type PendingScan = { candidates: PhysicalTagIdentifier[]; mode: ScanMode; generation: number };

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

export function ScanSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const timer = useWorkTimer();
  const [mode, setModeState] = useState<ScanMode>("OPEN_REPAIR");
  const [selected, setSelected] = useState<SelectedRepair[]>([]);
  const [candidate, setCandidate] = useState<SelectedRepair | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [scanning, setScanning] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const modeRef = useRef<ScanMode>(mode);
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
    setModeState(next);
    setSelected([]);
    setCandidate(null);
    setFeedback({ kind: "info", message: "モードを切り替えました。選択をクリアしました。" });
    wedgeRef.current = EMPTY_WEDGE_BUFFER;
    debounceRef.current = null;
  }, []);

  const processScan = useCallback(async ({ candidates, mode: scanMode, generation }: PendingScan) => {
    try {
      const result = combineScanResults(await Promise.all(candidates.map(resolveCandidate)));
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
    const value = raw.trim();
    if (!value) {
      setFeedback({ kind: "error", message: "読み取り値を入力してください。" });
      return;
    }
    const now = performance.now();
    if (shouldDebounceScan(debounceRef.current, value, now)) return;
    const candidates = scanCandidates(value);
    const queued = enqueueQueuedScan(queueRef.current,
      { candidates, mode: modeRef.current, generation: generationRef.current });
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
    setMode, scan, remove, clear, confirmTimer }}>{children}</ScanSessionContext.Provider>;
}

export function useScanSession() {
  const value = useContext(ScanSessionContext);
  if (!value) throw new Error("ScanSessionProvider is required.");
  return value;
}
