"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Classification = { scope: "WATCHES" | "COMMON" | "UNASSIGNED"; source: "AI" | "MANUAL"; confidence: string | null; confirmedAt: string | null; watchIds: number[] } | null;
type Message = { id: number; direction: "INBOUND" | "OUTBOUND"; messageType: "TEXT" | "IMAGE" | "FILE" | "OTHER"; body: string | null; receivedAt: string | null; sentAt: string | null; createdAt: string; status: string; classification: Classification; relatedRepairIds: number[]; relatedToCurrentRepair: boolean; files: { id: number; mimeType: string | null; width: number | null; height: number | null; uploadStatus: string }[] };
type Pending = { id: number; text: string; status: "APPROVED" | "CLAIMED" | "PRE_SEND_FAILED" | "POST_UNCONFIRMED"; approvedAt: string; createdAt: string; relatedRepairIds: number[]; relatedToCurrentRepair: boolean };
type Payload = { available: boolean; sourceInquiryId: number | null; promotedAt: string | null; sendAvailable: boolean; mappingVerifiedAt: string | null; messages: Message[]; pendingOutboxes: Pending[]; siblingRepairs: { repairId: number; position: number; label: string | null; inquiryNumber: string | null }[]; watchOptions: { id: number; position: number; label: string | null }[]; hasEarlierMessages: boolean; unassignedCount: number };
type Item = { kind: "message"; id: number; at: string; relatedToCurrentRepair: boolean; message: Message } | { kind: "outbox"; id: number; at: string; relatedToCurrentRepair: boolean; outbox: Pending };

const statusLabels: Record<Pending["status"], string> = { APPROVED: "送信待ち", CLAIMED: "送信処理中", PRE_SEND_FAILED: "送信前エラー", POST_UNCONFIRMED: "送信確認中" };
const displayTime = (value: string) => new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export function RepairLineConversation({ repairId }: { repairId: number }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFull, setShowFull] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const intentRef = useRef<{ text: string; idempotencyKey: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/repairs/${repairId}/line`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "LINE履歴を読み込めませんでした。");
      setPayload(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "LINE履歴を読み込めませんでした。"); }
    finally { setLoading(false); }
  }, [repairId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const timeline: Item[] = payload ? [
    ...payload.messages.map((message) => ({ kind: "message" as const, id: message.id, at: message.receivedAt ?? message.sentAt ?? message.createdAt, relatedToCurrentRepair: message.relatedToCurrentRepair, message })),
    ...payload.pendingOutboxes.map((outbox) => ({ kind: "outbox" as const, id: outbox.id, at: outbox.approvedAt, relatedToCurrentRepair: outbox.relatedToCurrentRepair, outbox })),
  ].filter((item) => showFull || item.relatedToCurrentRepair).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime() || a.id - b.id) : [];

  async function send() {
    if (!payload?.sendAvailable || !replyText.trim() || replyText.length > 5000 || sending) return;
    let intent = intentRef.current;
    if (!intent || intent.text !== replyText) intent = intentRef.current = { text: replyText, idempotencyKey: crypto.randomUUID() };
    setSending(true); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/repairs/${repairId}/line`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(intent) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "LINE送信待ちを作成できませんでした。");
      setReplyText(""); intentRef.current = null;
      setNotice("LINE送信待ちに追加しました。実際の送信確認はまだ完了していません。");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "LINE送信待ちを作成できませんでした。"); }
    finally { setSending(false); }
  }

  const repairLabel = (id: number) => {
    const option = payload?.siblingRepairs.find((repair) => repair.repairId === id);
    return option ? `時計${option.position}${option.label ? `・${option.label}` : ""}${option.inquiryNumber ? ` (${option.inquiryNumber})` : ""}` : `Repair #${id}`;
  };

  return <section className="space-y-4 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold">LINE</h2><p className="text-sm text-zinc-600">元のInquiryに保存されたLINEのやり取りです。送信待ちは送信済みの証明ではありません。</p></div>
      <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>更新</Button>
    </div>
    {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading && !payload && <p className="text-sm text-zinc-500">LINE履歴を読み込んでいます…</p>}
    {payload && !payload.available && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">このRepairに紐付く元のInquiryがないため、LINEのやり取りを表示できません。</p>}
    {payload?.available && <>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setShowFull((value) => !value)}>{showFull ? "この修理に関連するLINEのみ表示" : "このお客様とのLINE全体を見る"}</Button>
        <span className="text-xs text-zinc-600">全体表示の対象は元のInquiryのみです。別のInquiryの履歴は含みません。</span>
        <Link className="text-xs text-blue-700 underline" href={`/inquiries/${payload.sourceInquiryId}/review`}>元のInquiryを開く</Link>
      </div>
      {payload.unassignedCount > 0 && <p className="text-xs text-amber-800">直近の表示対象に未特定・未分類のLINEが {payload.unassignedCount} 件あります。修理別表示では省かれます。</p>}
      {payload.hasEarlierMessages && <p className="text-xs text-zinc-500">元のInquiryの直近200件を表示しています。</p>}
      <div className="max-h-[36rem] space-y-3 overflow-y-auto rounded border bg-zinc-50 p-3">
        {timeline.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">表示するLINEはありません。</p>}
        {timeline.map((item, index) => {
          const after = payload.promotedAt !== null && new Date(item.at).getTime() >= new Date(payload.promotedAt).getTime();
          const previous = index > 0 && payload.promotedAt !== null && new Date(timeline[index - 1].at).getTime() >= new Date(payload.promotedAt).getTime();
          const links = item.kind === "message" ? item.message.relatedRepairIds : item.outbox.relatedRepairIds;
          const classification = item.kind === "message" ? item.message.classification : null;
          const outgoing = item.kind === "outbox" || item.message.direction === "OUTBOUND";
          return <div key={`${item.kind}-${item.id}`}>
            {(index === 0 || (after && !previous)) && <div className="border-b py-2 text-center text-xs font-semibold text-zinc-600">{after ? "受付後" : "受付前"}</div>}
            <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-lg border p-3 text-sm ${item.kind === "outbox" ? "border-blue-200 bg-blue-50" : outgoing ? "border-emerald-200 bg-emerald-50" : "bg-white"}`}>
              <div className="mb-1 flex flex-wrap gap-1 text-xs">
                {classification?.scope === "COMMON" && <span className="rounded bg-indigo-100 px-1">共通</span>}
                {(!classification || classification.scope === "UNASSIGNED") && item.kind === "message" && <span className="rounded bg-zinc-200 px-1">未特定</span>}
                {links.map((id) => <span key={id} className="rounded bg-blue-100 px-1">{repairLabel(id)}</span>)}
                {classification?.source && <span className="rounded bg-zinc-200 px-1">{classification.source === "MANUAL" ? "手動確定" : "AI"}</span>}
              </div>
              <p className="whitespace-pre-wrap break-words">{item.kind === "outbox" ? item.outbox.text : item.message.body}</p>
              {item.kind === "message" && item.message.direction === "INBOUND" && item.message.messageType === "IMAGE" && <div className="space-y-2">{item.message.files.filter((file) => file.uploadStatus === "STORED").map((file) => <img key={file.id} src={`/api/inquiries/${payload.sourceInquiryId}/line/files/${file.id}`} alt="LINE受信画像" className="max-h-80 max-w-full rounded object-contain" loading="lazy" />)}</div>}
              {item.kind === "message" && item.message.messageType === "FILE" && <p className="text-zinc-500">ファイルメッセージ</p>}
              {item.kind === "message" && item.message.messageType === "OTHER" && <p className="text-zinc-500">その他のLINEメッセージ</p>}
              <div className="mt-2 text-right text-xs text-zinc-500">{item.kind === "outbox" ? statusLabels[item.outbox.status] : outgoing ? "送信済み" : "受信"} · {displayTime(item.at)}</div>
              {item.kind === "message" && <ClassificationEditor key={`${item.id}-${classification?.confirmedAt ?? "none"}`} inquiryId={payload.sourceInquiryId!} message={item.message} watchOptions={payload.watchOptions} onSaved={refresh} />}
            </div></div>
          </div>;
        })}
      </div>
      {!payload.sendAvailable && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">LINE送信先の確認がまだ完了していません。</p>}
      <div className="space-y-2 border-t pt-4"><label htmlFor="repair-line-reply" className="text-sm font-medium">お客様へのLINE返信</label>
        <Textarea id="repair-line-reply" value={replyText} onChange={(event) => { setReplyText(event.target.value); if (intentRef.current?.text !== event.target.value) intentRef.current = null; }} maxLength={5000} disabled={!payload.sendAvailable || sending} placeholder="お客様へ送る内容を入力" className="min-h-28" />
        <div className="flex flex-wrap justify-between gap-2 text-xs"><p className="text-amber-700">ここに入力した内容はお客様へのLINE送信用です。内部メモではありません。</p><span>{replyText.length} / 5000</span></div>
        <div className="flex justify-end"><Button type="button" onClick={() => void send()} disabled={!payload.sendAvailable || sending || !replyText.trim() || replyText.length > 5000}>{sending ? "追加中…" : "LINE送信待ちに追加"}</Button></div>
      </div>
    </>}
  </section>;
}

function ClassificationEditor({ inquiryId, message, watchOptions, onSaved }: { inquiryId: number; message: Message; watchOptions: Payload["watchOptions"]; onSaved: () => Promise<void> }) {
  const [scope, setScope] = useState<"WATCHES" | "COMMON" | "UNASSIGNED">(message.classification?.scope ?? "UNASSIGNED");
  const [watchIds, setWatchIds] = useState<number[]>(message.classification?.watchIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (scope === "WATCHES" && watchIds.length === 0) { setError("時計を1件以上選択してください。"); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/inquiries/${inquiryId}/line`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: message.id, scope, watchIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "関連付けを保存できませんでした。");
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "関連付けを保存できませんでした。"); }
    finally { setSaving(false); }
  }
  return <details className="mt-2 border-t pt-2"><summary className="cursor-pointer text-xs text-blue-700">関連を変更</summary><div className="mt-2 space-y-2 text-xs">
    <div className="flex gap-2"><Button type="button" size="sm" variant={scope === "UNASSIGNED" ? "default" : "outline"} onClick={() => { setScope("UNASSIGNED"); setWatchIds([]); }}>未特定</Button><Button type="button" size="sm" variant={scope === "COMMON" ? "default" : "outline"} onClick={() => { setScope("COMMON"); setWatchIds([]); }}>共通</Button></div>
    <p>時計に関連</p><div className="grid gap-1 sm:grid-cols-2">{watchOptions.map((watch) => <label key={watch.id} className="flex gap-2 rounded border p-2"><input type="checkbox" checked={watchIds.includes(watch.id)} onChange={() => { setScope("WATCHES"); setWatchIds((current) => current.includes(watch.id) ? current.filter((id) => id !== watch.id) : [...current, watch.id]); }} />時計{watch.position}{watch.label ? `・${watch.label}` : ""}</label>)}</div>
    {error && <p className="text-red-700">{error}</p>}<Button type="button" size="sm" disabled={saving || (scope === "WATCHES" && watchIds.length === 0)} onClick={() => void save()}>{saving ? "保存中…" : "この関連を確定"}</Button>
  </div></details>;
}
