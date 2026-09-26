"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { WORK_TIME_ACTIVITY_TYPES, type WorkTimeActivityType } from "@/lib/work-time-session-domain";

export type WorkTimerStartInput = {
  activityType: WorkTimeActivityType;
  repairId?: number;
  inquiryId?: number;
  orderRequestId?: number;
  repairLineItemId?: number;
  label?: string;
};

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

export function WorkTimerProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const busyRef = useRef(false);
  const refreshingRef = useRef(false);

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
    } catch (cause) {
      setReady(false);
      setError(cause instanceof Error ? cause.message : "タイマーを取得できませんでした。");
    } finally {
      refreshingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const session = activeSession(body.session);
      if (!session) throw new Error("タイマーの応答形式が不正です。");
      setActive(session);
    } catch (cause) {
      setReady(false);
      setError(cause instanceof Error ? cause.message : "タイマーを開始できませんでした。");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [loading, ready]);

  const stop = useCallback(async () => {
    if (busyRef.current || loading || !ready) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const body = await request("/api/work-time-sessions/stop", { method: "POST" });
      if (typeof body.stopped !== "boolean" || (body.stopped && (!body.session || typeof body.session !== "object")) ||
          (!body.stopped && body.session !== null)) throw new Error("タイマーの応答形式が不正です。");
      setActive(null);
    } catch (cause) {
      setReady(false);
      setError(cause instanceof Error ? cause.message : "タイマーを停止できませんでした。");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [loading, ready]);

  const elapsedSeconds = active && now !== null
    ? Math.max(0, Math.floor((now - Date.parse(active.startedAt)) / 1000)) : null;

  return (
    <WorkTimerContext.Provider value={{ active, loading, ready, busy, error, elapsedSeconds, refresh, start, stop }}>
      {children}
    </WorkTimerContext.Provider>
  );
}

export function useWorkTimer() {
  const value = useContext(WorkTimerContext);
  if (!value) throw new Error("WorkTimerProvider is required.");
  return value;
}
