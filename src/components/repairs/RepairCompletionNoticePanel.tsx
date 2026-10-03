"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  buildRepairCompletionNoticeText, canPrepareRepairCompletionNotice, completionNoticeStatusLabels,
  COMPLETION_NOTICE_INTRO_LIMIT, COMPLETION_NOTICE_TEXT_LIMIT, defaultRepairCompletionNoticeText,
  type CompletionNoticeState, type CompletionNoticeStatus,
} from "@/lib/repair-completion-notice-message";

type Notice = { id: number; status: CompletionNoticeStatus; approvedAt: string; confirmedAt: string | null };
type Payload = Omit<CompletionNoticeState, "notice"> & { ok: true; notice: Notice | null };
const displayTime = (value: string) => new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "Asia/Tokyo",
}).format(new Date(value));

export function RepairCompletionNoticePanel({ repairId }: { repairId: number }) {
  const [state, setState] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(defaultRepairCompletionNoticeText);
  const [reviewedText, setReviewedText] = useState<string | null>(null);
  const [reviewedDraft, setReviewedDraft] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hold, setHold] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const postInFlight = useRef(false);

  const refresh = useCallback(async (reconcileHold = false) => {
    setLoading(true);
    setState(null);
    try {
      const response = await fetch(`/api/repairs/${repairId}/completion-notice`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.error || "作業完了連絡の状態を読み込めませんでした。");
      setState(data as Payload);
      if (reconcileHold && !data.notice && data.eligible && data.hasVerifiedLineDestination) setHold(false);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "作業完了連絡の状態を読み込めませんでした。");
    } finally { setLoading(false); }
  }, [repairId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function prepareReview() {
    if (preparing || loading || hold || !canPrepareRepairCompletionNotice(state, draft)) return;
    setPreparing(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/repairs/${repairId}/delivery-preference-link`, { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true || typeof data.url !== "string") {
        throw new Error(data?.error || "配達希望回答URLを準備できませんでした。");
      }
      const finalText = buildRepairCompletionNoticeText(draft, data.url);
      if (finalText.length > COMPLETION_NOTICE_TEXT_LIMIT) throw new Error("送信文面が長すぎます。冒頭文を短くしてください。");
      setReviewedDraft(draft);
      setReviewedText(finalText);
    } catch (cause) {
      setReviewedDraft(null);
      setReviewedText(null);
      setError(cause instanceof Error ? cause.message : "送信内容を準備できませんでした。");
    } finally { setPreparing(false); }
  }

  async function submit() {
    if (postInFlight.current || loading || hold || reviewedText === null || reviewedDraft === null ||
        reviewedDraft !== draft || !canPrepareRepairCompletionNotice(state, reviewedDraft)) return;
    postInFlight.current = true;
    setSubmitting(true);
    setHold(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/repairs/${repairId}/completion-notice`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, introText: reviewedDraft, reviewedText }),
      });
      const data = await response.json().catch(() => null);
      setReviewedText(null);
      setReviewedDraft(null);
      if (response.status === 409) {
        await refresh(true);
        setError(data?.error || "状態が変わりました。最新の状態を確認し、必要なら内容を再確認してください。");
        return;
      }
      if (!response.ok || data?.ok !== true) throw new Error(data?.error || "送信待ちを作成できませんでした。状態を更新して確認してください。");
      await refresh();
      setFeedback("作業完了連絡を送信待ちに追加しました。実際の送信確認はまだ完了していません。");
    } catch (cause) {
      setReviewedText(null);
      setReviewedDraft(null);
      setError(cause instanceof Error ? cause.message : "結果を確認できませんでした。状態を更新して確認してください。");
    } finally {
      postInFlight.current = false;
      setSubmitting(false);
    }
  }

  const canPrepare = !loading && !hold && !preparing && canPrepareRepairCompletionNotice(state, draft);

  return <section className="space-y-3 rounded border p-4" aria-label="作業完了のLINE連絡">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">作業完了のLINE連絡</h3>
      <Button type="button" size="sm" variant="outline" onClick={() => void refresh(true)} disabled={loading || submitting}>状態を更新</Button>
    </div>
    {loading && <p className="text-sm text-zinc-600">作業完了連絡の状態を確認しています…</p>}
    {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {feedback && <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{feedback}</p>}
    {state?.notice ? <div className="space-y-1 text-sm">
      <p>作業完了連絡: <strong>{completionNoticeStatusLabels[state.notice.status]}</strong></p>
      <p>送信待ち登録: {displayTime(state.notice.approvedAt)}</p>
      {state.notice.status === "CONFIRMED" && state.notice.confirmedAt && <p>送信確認: {displayTime(state.notice.confirmedAt)}</p>}
      {state.notice.status === "POST_UNCONFIRMED" && <p className="text-amber-800">送信結果を確認中です。再送操作はできません。</p>}
      {state.notice.status !== "CONFIRMED" && <p className="text-zinc-600">送信済みは確認されていません。</p>}
    </div> : state && !state.hasVerifiedLineDestination ?
      <p className="text-sm text-amber-800">確認済みのLINE送信先がありません。作業完了連絡は作成できません。</p> :
      state && !state.eligible ?
        <p className="text-sm text-amber-800">この修理は現在、作業完了のLINE連絡の対象ではありません。</p> :
        state && <div className="space-y-2">
          <label htmlFor={`completion-notice-${repairId}`} className="text-sm font-medium">お客様へ送る冒頭文を確認・編集</label>
          <Textarea id={`completion-notice-${repairId}`} value={draft} maxLength={COMPLETION_NOTICE_INTRO_LIMIT}
            onChange={(event) => { setDraft(event.target.value); setReviewedText(null); setReviewedDraft(null); }}
            disabled={preparing || submitting || hold} className="min-h-24" />
          <p className="text-xs text-zinc-600">配達希望の回答URLと「希望がない場合も『希望なし』を選択してください」という案内は、送信文面へ自動で追加されます。</p>
          <p className="text-right text-xs text-zinc-600">{draft.length} / {COMPLETION_NOTICE_INTRO_LIMIT}</p>
          {hold ? <p className="text-sm text-amber-800">送信結果を確認してください。状態が確認できるまで再操作はできません。</p> :
            reviewedText === null ?
              <div className="flex justify-end"><Button type="button" disabled={!canPrepare} onClick={() => void prepareReview()}>{preparing ? "準備中…" : "送信内容を確認"}</Button></div> :
              <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3 text-sm">
                <p className="font-medium">この内容でLINE送信待ちに追加します</p>
                <p className="whitespace-pre-wrap break-words">{reviewedText}</p>
                <p className="text-xs text-zinc-600">追加後も実際の送信確認まで送信待ちとして扱います。</p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled={submitting} onClick={() => { setReviewedText(null); setReviewedDraft(null); }}>編集に戻る</Button>
                  <Button type="button" disabled={submitting || !canPrepare} onClick={() => void submit()}>{submitting ? "追加中…" : "この内容で送信待ちに追加"}</Button>
                </div>
              </div>}
        </div>}
  </section>;
}
