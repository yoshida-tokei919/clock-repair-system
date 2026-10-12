"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { canApplyCommunicationAiDraft } from "@/lib/communication-ai-draft";

type Destination = { lineUserId: number; label: string; verifiedAt: Date; sendAvailable: boolean };
type AiDraft = { id: number; text: string; stale: boolean; createdAt: string };

export function CustomerLineReply({ customerId, destinations, aiDraft }: { customerId: number; destinations: Destination[]; aiDraft: AiDraft | null }) {
  const router = useRouter();
  const available = destinations.filter((destination) => destination.sendAvailable);
  const [lineUserId, setLineUserId] = useState<number | null>(available.length === 1 ? available[0].lineUserId : null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [applyingDraft, setApplyingDraft] = useState(false);
  const [draftStale, setDraftStale] = useState(false);
  useEffect(() => { setDraftStale(false); }, [aiDraft?.id]);

  async function applyDraft() {
    if (!aiDraft || aiDraft.stale || draftStale || busy || applyingDraft || available.length !== 1) return;
    setApplyingDraft(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/customers/${customerId}/communications/line`, { cache: "no-store" });
      if (!response.ok) throw new Error("AI返信案の最新状態を確認できませんでした。もう一度お試しください。");
      const fresh = await response.json();
      if (!canApplyCommunicationAiDraft(
        { id: aiDraft.id, replyDraft: aiDraft.text, stale: aiDraft.stale },
        fresh.aiBrief, fresh.replyDraftAllowed,
      )) {
        setDraftStale(true);
        setError("AI返信案は新着LINE、関連付け、または送信先の変更により古くなりました。再生成してください。");
        return;
      }
      setText(aiDraft.text);
      setRequestKey(null);
      setNotice("AI返信案を返信欄へ反映しました。内容を確認してから送信待ちに登録してください。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI返信案の最新状態を確認できませんでした。");
    } finally {
      setApplyingDraft(false);
    }
  }

  async function submit() {
    if (busy || lineUserId === null || !text.trim() || text.length > 5000) return;
    const key = requestKey ?? crypto.randomUUID();
    setRequestKey(key);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/customers/${customerId}/communications/line`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId, text, idempotencyKey: key }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || "LINE送信待ちを作成できませんでした。");
        return;
      }
      setText("");
      setRequestKey(null);
      setNotice(payload.item?.status === "CONFIRMED" ? "送信済みです。履歴を確認してください。" : "送信待ちに登録しました。実際の送信完了は履歴で確認できます。");
      router.refresh();
    } catch {
      setError("結果を確認できませんでした。同じ内容で再試行できます。");
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-3 rounded-lg border bg-white p-4">
    <h2 className="font-semibold">LINE返信</h2>
    {aiDraft && <div className={`rounded border p-3 text-sm ${aiDraft.stale || draftStale ? "border-amber-300 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">AI返信案</span>
        <span className="text-xs text-zinc-600">{new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(aiDraft.createdAt))}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-zinc-900">{aiDraft.text}</p>
      {aiDraft.stale || draftStale ? <p className="mt-2 text-xs font-medium text-amber-900">新着LINEまたは関連付け変更後の古い案です。再生成するまで返信欄へ反映できません。</p> : <button
        type="button"
        className="mt-3 rounded border border-blue-300 bg-white px-3 py-1.5 text-xs text-blue-800 disabled:opacity-50"
        disabled={busy || applyingDraft || available.length !== 1}
        onClick={() => void applyDraft()}
      >{applyingDraft ? "確認中…" : "返信欄に反映"}</button>}
      {!aiDraft.stale && !draftStale && available.length !== 1 && <p className="mt-2 text-xs font-medium text-amber-900">送信可能な宛先が1件だけの場合に返信案を反映できます。</p>}
    </div>}
    {available.length === 0 ? <p className="text-sm text-amber-800">確認済みの送信先、または送信履歴を保存する既存の問い合わせがありません。LINE返信はできません。</p> : <>
      <label className="block text-sm">送信先
        <select className="mt-1 block w-full rounded border p-2" value={lineUserId ?? ""} disabled={busy}
          onChange={(event) => { setLineUserId(event.target.value ? Number(event.target.value) : null); setRequestKey(null); }}>
          <option value="">送信先を選択してください</option>
          {destinations.map((destination) => <option key={destination.lineUserId} value={destination.lineUserId} disabled={!destination.sendAvailable}>
            {destination.label}（#{destination.lineUserId}）{destination.sendAvailable ? "" : "・既存問い合わせなし"}
          </option>)}
        </select>
      </label>
      <textarea className="w-full rounded border p-2 text-sm" rows={4} maxLength={5000} value={text} disabled={busy}
        onChange={(event) => { setText(event.target.value); setRequestKey(null); }} placeholder="顧客へ送るLINE本文" />
      <button className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy || lineUserId === null || !text.trim()}
        onClick={submit}>{busy ? "登録中…" : "LINE送信待ちに登録"}</button>
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
  </section>;
}
