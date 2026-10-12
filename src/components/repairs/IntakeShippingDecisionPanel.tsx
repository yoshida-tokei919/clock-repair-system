"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Decision = { choice: "SHIP_COMPLETED" | "WAIT_ALL" | null; requestedAt: string; respondedAt: string | null; requestOutbox: { status: string; confirmedAt: string | null } };
type State = { eligible: boolean; decision: Decision | null };

export function IntakeShippingDecisionPanel({ repairId }: { repairId: number }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/repairs/${repairId}/shipping-decision`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "状態を読み込めませんでした。");
      setState(data);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "状態を読み込めませんでした。"); }
  }, [repairId]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function request() {
    if (inFlight.current || !state?.eligible || state.decision) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/repairs/${repairId}/shipping-decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "依頼を作成できませんでした。");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "結果を確認できませんでした。状態を更新してください。"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (state && !state.eligible && !state.decision) return null;
  return <section className="space-y-2 rounded border p-4" aria-label="受付単位の発送確認">
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">受付単位の発送確認</h3><button type="button" className="text-sm text-blue-700 underline" onClick={() => void refresh()} disabled={busy}>状態を更新</button></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {state?.decision ? <div className="text-sm"><p>LINE依頼: {state.decision.requestOutbox.status === "CONFIRMED" ? "送信確認済み" : state.decision.requestOutbox.status === "CANCELLED" ? "取消済み" : "送信待ち・確認中"}</p><p>お客様の回答: {state.decision.choice === "SHIP_COMPLETED" ? "完成分を先に発送" : state.decision.choice === "WAIT_ALL" ? "全件完成まで待つ" : "未回答"}</p></div> : state?.eligible ? <>
      <p className="text-sm">完成分を先に発送するか、全件完成まで待つかをお客様へ共有ページで確認します。</p>
      <button type="button" className="rounded bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void request()}>{busy ? "登録中…" : "確認してLINE送信待ちに追加"}</button>
      <p className="text-xs text-zinc-600">この操作は送信依頼の登録です。実際の送信完了は LINE の確認状態で判断します。</p>
    </> : <p className="text-sm text-zinc-600">状態を確認しています…</p>}
  </section>;
}
