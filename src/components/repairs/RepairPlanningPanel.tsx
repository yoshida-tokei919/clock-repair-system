"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkTimer } from "@/components/work-time/WorkTimerProvider";
import type { PartsReadiness } from "@/lib/repair-parts-readiness";

type PlanningState = {
  blocked: boolean;
  blockReason: string | null;
  blockReasonNote: string | null;
  remainingWorkMinutes: number | null;
  resumeEligibleDate: string | null;
  reviewDate: string | null;
};
type ResponseBody = { planningState: PlanningState; partsReadiness: PartsReadiness };
const reasons = [
  ["ADDITIONAL_PART_POSSIBLE", "追加部品の可能性"],
  ["REPAIR_METHOD_REVIEW", "修理方法の検討"],
  ["WAITING_CUSTOMER", "お客様確認待ち"],
  ["WAITING_OUTSOURCE", "外注待ち"],
  ["WAITING_PARTS", "部品待ち"],
  ["OTHER", "その他"],
] as const;

function initialReason(state: PlanningState): string {
  return state.blockReason ?? reasons[0][0];
}

function readinessLabel(readiness: PartsReadiness): string {
  switch (readiness.state) {
    case "LEGACY_UNKNOWN": return "旧案件のため部品準備状況は判定できません";
    case "NOT_REQUIRED": return "対象部品なし";
    case "READY": return "必要部品は確保済み";
    case "WAITING": return `部品待ち / 準備見込み ${readiness.partsReadyDate!.replaceAll("-", "/")}`;
    case "WAITING_UNKNOWN": return "部品待ち / 準備日未定";
  }
}

export function RepairPlanningPanel({ repairId }: { repairId: number }) {
  const { refresh: refreshTimer } = useWorkTimer();
  const [data, setData] = useState<ResponseBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState<string>(reasons[0][0]);
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState("");
  const [resumeDate, setResumeDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  const syncDraft = useCallback((state: PlanningState) => {
    setReason(initialReason(state));
    setNote(state.blockReasonNote ?? "");
    setMinutes(state.remainingWorkMinutes === null ? "" : String(state.remainingWorkMinutes));
    setResumeDate(state.resumeEligibleDate ?? "");
    setReviewDate(state.reviewDate ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/repairs/${repairId}/planning`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "計画を取得できませんでした。");
      const loaded = body as ResponseBody;
      setData(loaded);
      syncDraft(loaded.planningState);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "計画を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, [repairId, syncDraft]);

  useEffect(() => { void load(); }, [load]);

  async function submit(action: "block" | "resume") {
    if (busy || loading) return;
    const wasBlocked = data?.planningState.blocked ?? false;
    if (action === "block" && minutes !== "" &&
        (!/^\d+$/.test(minutes) || !Number.isSafeInteger(Number(minutes)) || Number(minutes) > 2147483647)) {
      setError("残作業時間は0以上の整数分で入力してください。");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = action === "resume" ? { action } : {
        action, blockReason: reason, blockReasonNote: note || null,
        remainingWorkMinutes: minutes === "" ? null : Number(minutes),
        resumeEligibleDate: resumeDate || null, reviewDate: reviewDate || null,
      };
      const response = await fetch(`/api/repairs/${repairId}/planning`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存できませんでした。");
      setData(current => current ? { ...current, planningState: result.planningState } : current);
      syncDraft(result.planningState as PlanningState);
      if (result.timerStopped) await refreshTimer();
      setMessage(action === "resume" ? "作業を再開可能にしました。" : wasBlocked ? "中断内容を更新しました。" : "作業を中断しました。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const disabled = loading || busy;

  return <section aria-labelledby="repair-planning-heading" className="mx-auto mt-4 max-w-7xl rounded-lg border border-zinc-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="repair-planning-heading" className="text-lg font-semibold text-zinc-900">部品準備・作業中断</h2>
      <button type="button" onClick={() => void load()} disabled={loading || busy} className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50">再読込</button>
    </div>
    {loading && <p className="mt-3 text-sm text-zinc-600">読込中…</p>}
    {data && <>
      <div className="mt-3 text-sm text-zinc-700">
        <p className="font-medium">{readinessLabel(data.partsReadiness)}</p>
        <p>必要部品 {data.partsReadiness.requiredPartCount} 種 / 不足 {data.partsReadiness.shortagePartCount} 種</p>
        <p>必要数量 {data.partsReadiness.requiredQuantity} / 確保数量 {data.partsReadiness.allocatedQuantity}</p>
        {data.partsReadiness.state === "LEGACY_UNKNOWN" && <p className="text-amber-700">引当台帳のない旧案件です。部品準備日は手動で確認してください。</p>}
      </div>
      <div className="mt-4 border-t border-zinc-200 pt-4 text-sm">
        <p className="font-medium text-zinc-900">作業状態: {data.planningState.blocked ? "中断中" : "中断なし"}</p>
        {data.planningState.blocked && <>
          <p className="mt-1 text-zinc-700">理由: {reasons.find(([value]) => value === data.planningState.blockReason)?.[1] ?? data.planningState.blockReason}</p>
          {data.planningState.blockReasonNote && <p className="text-zinc-700">メモ: {data.planningState.blockReasonNote}</p>}
          <p className="text-zinc-700">残作業時間: {data.planningState.remainingWorkMinutes === null ? "未設定" : `${data.planningState.remainingWorkMinutes}分`}</p>
          <p className="text-zinc-700">再開可能日: {data.planningState.resumeEligibleDate ?? "未設定"} / 再確認日: {data.planningState.reviewDate ?? "未設定"}</p>
        </>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-zinc-700">中断理由
              <select value={reason} onChange={event => {
                const nextReason = event.target.value;
                setReason(nextReason);
                if (nextReason === "WAITING_PARTS" && !resumeDate && data.partsReadiness.partsReadyDate)
                  setResumeDate(data.partsReadiness.partsReadyDate);
              }} disabled={disabled} className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50">
                {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block text-zinc-700">理由メモ（任意）<input value={note} onChange={event => setNote(event.target.value)} disabled={disabled} className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50" /></label>
            <label className="block text-zinc-700">残作業時間・分（任意）<input type="number" min="0" step="1" value={minutes} onChange={event => setMinutes(event.target.value)} disabled={disabled} className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50" /></label>
            <label className="block text-zinc-700">再開可能日（任意）<input type="date" value={resumeDate} onChange={event => setResumeDate(event.target.value)} disabled={disabled} className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50" /></label>
            <label className="block text-zinc-700">再確認日（任意）<input type="date" value={reviewDate} onChange={event => setReviewDate(event.target.value)} disabled={disabled} className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 disabled:opacity-50" /></label>
          </div>
          {reason === "WAITING_PARTS" && <p className="mt-2 text-zinc-600">部品準備見込み日を再開可能日の入力候補にします。必要に応じて変更できます。</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void submit("block")} disabled={disabled} className="rounded bg-amber-700 px-4 py-2 font-medium text-white disabled:opacity-50">{busy ? "処理中…" : data.planningState.blocked ? "中断内容を更新" : "作業を中断"}</button>
            {data.planningState.blocked && <button type="button" onClick={() => void submit("resume")} disabled={disabled} className="rounded bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50">{busy ? "処理中…" : "中断を解除"}</button>}
          </div>
      </div>
    </>}
    {message && <p role="status" className="mt-3 text-sm text-green-700">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
