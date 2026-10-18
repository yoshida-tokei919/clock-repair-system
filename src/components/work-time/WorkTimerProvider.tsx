"use client";

import React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { WORK_TIME_ACTIVITY_TYPES, type WorkTimeActivityType } from "@/lib/work-time-session-domain";
import { cardKey, matchesCard, parseCards, type TimerCard, type TimerCardInput } from "@/lib/work-timer-cards";

export type WorkTimerStartInput = TimerCardInput;

type ActiveSession = {
  id: number;
  activityType: WorkTimeActivityType;
  repairId: number | null;
  inquiryId: number | null;
  orderRequestId: number | null;
  workLabelSnapshot: string | null;
  startedAt: string;
};

type WorkTimerContextValue = {
  active: ActiveSession | null;
  loading: boolean;
  ready: boolean;
  busy: boolean;
  error: string | null;
  elapsedSeconds: number | null;
  cards: TimerCard[];
  totals: Record<string, number>;
  totalsReady: boolean;
  addCard: (input: WorkTimerStartInput, title?: string) => void;
  removeCard: (key: string) => void;
  renameCard: (key: string, title: string) => void;
  moveCard: (key: string, direction: -1 | 1) => void;
  refresh: () => Promise<void>;
  start: (input: WorkTimerStartInput) => Promise<void>;
  stop: () => Promise<void>;
};

const WorkTimerContext = createContext<WorkTimerContextValue | null>(null);

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function activeSession(value: unknown): ActiveSession | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("タイマーの応答形式が不正です。");
  const session = value as Record<string, unknown>;
  if (!isId(session.id) || !WORK_TIME_ACTIVITY_TYPES.includes(session.activityType as WorkTimeActivityType) ||
      typeof session.startedAt !== "string" || !Number.isFinite(Date.parse(session.startedAt)) ||
      session.endedAt !== null || session.invalidatedAt !== null ||
      (session.workLabelSnapshot !== null && typeof session.workLabelSnapshot !== "string") ||
      ![session.repairId, session.inquiryId, session.orderRequestId].every(id => id === null || isId(id))) {
    throw new Error("タイマーの応答形式が不正です。");
  }
  return session as ActiveSession;
}

async function request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store", ...init });
  } catch {
    throw new Error("タイマーに接続できませんでした。通信状態を確認してください。");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? `タイマー操作に失敗しました: ${body.error}` : `タイマー操作に失敗しました (${response.status})。`;
    throw new Error(message);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("タイマーの応答形式が不正です。");
  return body as Record<string, unknown>;
}

export function WorkTimerProvider({ children, adminEmail }: { children: ReactNode; adminEmail: string }) {
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [cards, setCards] = useState<TimerCard[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [totalsReady, setTotalsReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const busyRef = useRef(false);
  const refreshingRef = useRef(false);
  const totalsGeneration = useRef(0);
  const cardsRef = useRef(cards);
  const hydratedRef = useRef(hydrated);
  const storageKey = `work-timer-cards:${adminEmail}`;
  useEffect(() => { cardsRef.current = cards; hydratedRef.current = hydrated; }, [cards, hydrated]);

  useEffect(() => {
    try { setCards(parseCards(JSON.parse(localStorage.getItem(storageKey) || "[]"))); } catch { setCards([]); }
    setHydrated(true);
  }, [storageKey]);
  useEffect(() => {
    if (hydrated) {
      try { localStorage.setItem(storageKey, JSON.stringify(cards)); } catch { /* storage unavailable: retain cards for this page */ }
    }
  }, [cards, hydrated, storageKey]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      try { setCards(parseCards(JSON.parse(event.newValue || "[]"))); } catch { setCards([]); }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  const addCard = useCallback((input: WorkTimerStartInput, title?: string) => {
    const key = cardKey(input);
    setCards(current => current.some(card => card.key === key)
      ? current.map(card => card.key === key ? { ...card, input, needsReselection: false } : card)
      : current.length >= 30 ? current : [...current, { key, input, title: (title || input.label || input.activityType).slice(0, 100) }]);
  }, []);
  const removeCard = useCallback((key: string) => setCards(current => current.filter(card => card.key !== key)), []);
  const renameCard = useCallback((key: string, title: string) => {
    const normalized = title.trim().slice(0, 100);
    if (!normalized) return;
    setCards(current => current.map(card => card.key === key ? { ...card, title: normalized } : card));
  }, []);
  const moveCard = useCallback((key: string, direction: -1 | 1) => setCards(current => {
    const index = current.findIndex(card => card.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const copy = [...current];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    return copy;
  }), []);

  const refreshTotals = useCallback(async (items: TimerCard[]) => {
    const generation = ++totalsGeneration.current;
    setTotalsReady(false);
    try {
      const body = await request("/api/work-time-sessions/totals", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(items),
      });
      if (!body.totals || typeof body.totals !== "object" || Array.isArray(body.totals) ||
          Object.values(body.totals).some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0))
        throw new Error("タイマーの集計形式が不正です。");
      if (generation === totalsGeneration.current) { setTotals(body.totals as Record<string, number>); setTotalsReady(true); }
    } catch (cause) {
      if (generation === totalsGeneration.current) {
        setTotalsReady(false);
        setError(cause instanceof Error ? cause.message : "実績時間を取得できませんでした。");
      }
    }
  }, []);
  useEffect(() => { if (hydrated) void refreshTotals(cards); }, [cards, hydrated, refreshTotals]);

  const refresh = useCallback(async () => {
    if (busyRef.current || refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading(true);
    setReady(false);
    setError(null);
    try {
      const body = await request("/api/work-time-sessions/active");
      setActive(activeSession(body.session));
      setReady(true);
      if (hydratedRef.current) await refreshTotals(cardsRef.current);
    } catch (cause) {
      setReady(false);
      setError(cause instanceof Error ? cause.message : "タイマーを取得できませんでした。");
    } finally {
      refreshingRef.current = false;
      setLoading(false);
    }
  }, [refreshTotals]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    const onVisibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); };
  }, [refresh]);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);

  const start = useCallback(async (input: WorkTimerStartInput) => {
    if (busyRef.current || loading || !ready) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const body = await request("/api/work-time-sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-expected-active-session": active ? String(active.id) : "none" },
        body: JSON.stringify(input),
      });
      const session = activeSession(body.session);
      if (!session) throw new Error("タイマーの応答形式が不正です。");
      setActive(session);
      addCard({ ...input, label: session.workLabelSnapshot ?? undefined });
      void refreshTotals(cards);
    } catch (cause) {
      setReady(false);
      setError(cause instanceof Error ? cause.message : "タイマーを開始できませんでした。");
      if (input.repairLineItemId && cause instanceof Error && /repairLineItemId/.test(cause.message)) {
        const key = cardKey(input);
        setCards(current => current.map(card => card.key === key ? { ...card, needsReselection: true } : card));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [loading, ready, addCard, cards, refreshTotals, active]);

  const stop = useCallback(async () => {
    if (busyRef.current || loading || !ready) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const body = await request("/api/work-time-sessions/stop", { method: "POST", headers: active ? { "x-expected-active-session": String(active.id) } : undefined });
      if (typeof body.stopped !== "boolean" || (body.stopped && (!body.session || typeof body.session !== "object")) ||
          (!body.stopped && body.session !== null)) throw new Error("タイマーの応答形式が不正です。");
      setActive(null);
      void refreshTotals(cards);
    } catch (cause) {
      setReady(false);
      setError(cause instanceof Error ? cause.message : "タイマーを停止できませんでした。");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [loading, ready, cards, refreshTotals, active]);

  const elapsedSeconds = active && now !== null
    ? Math.max(0, Math.floor((now - Date.parse(active.startedAt)) / 1000)) : null;

  return (
    <WorkTimerContext.Provider value={{ active, loading, ready, busy, error, elapsedSeconds, cards, totals, totalsReady, addCard, removeCard, renameCard, moveCard, refresh, start, stop }}>
      {children}
    </WorkTimerContext.Provider>
  );
}

export function useWorkTimer() {
  const value = useContext(WorkTimerContext);
  if (!value) throw new Error("WorkTimerProvider is required.");
  return value;
}
