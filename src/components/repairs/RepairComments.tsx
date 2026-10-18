"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Comment = { id: number; body: string; senderType: string; createdAt: string; readAt: string | null };

export function RepairComments({ repairId, focusMessageId }: { repairId: number; focusMessageId?: number }) {
  const [messages, setMessages] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [visibleTick, setVisibleTick] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const markingRef = useRef(new Set<number>());
  const focusedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/repairs/${repairId}/comments`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "コメントを読み込めませんでした。");
      setMessages(data.messages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "コメントを読み込めませんでした。");
    } finally { setLoading(false); }
  }, [repairId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setVisibleTick((value) => value + 1); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!loading && focusMessageId && !focusedRef.current) {
      const target = document.getElementById(`message-${focusMessageId}`);
      if (target) { target.scrollIntoView({ block: "center" }); focusedRef.current = true; }
    }
  }, [focusMessageId, loading, messages]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || loading || document.visibilityState !== "visible") return;
    const observer = new IntersectionObserver((entries) => {
      const ids = entries.filter((entry) => entry.isIntersecting).map((entry) => Number((entry.target as HTMLElement).dataset.commentId))
        .filter((id) => Number.isSafeInteger(id) && !markingRef.current.has(id));
      if (!ids.length) return;
      ids.forEach((id) => markingRef.current.add(id));
      void fetch(`/api/repairs/${repairId}/messages/read`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageIds: ids }),
      }).then((response) => {
        if (!response.ok) throw new Error("既読にできませんでした。");
        setMessages((current) => current.map((message) => ids.includes(message.id) ? { ...message, readAt: new Date().toISOString() } : message));
      }).catch(() => ids.forEach((id) => markingRef.current.delete(id)));
      entries.forEach((entry) => { if (entry.isIntersecting) observer.unobserve(entry.target); });
    }, { threshold: 0.5 });
    root.querySelectorAll<HTMLElement>("[data-comment-id]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [messages, loading, repairId, visibleTick]);

  async function save() {
    const text = body.trim();
    if (!text || text.length > 500 || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/repairs/${repairId}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "コメントを保存できませんでした。");
      setBody("");
      setNotice("コメントを保存しました。お客様へのLINE通知は未実装です。");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "コメントを保存できませんでした。"); }
    finally { setBusy(false); }
  }

  return <section className="space-y-3 p-4" aria-label="修理コメント">
    <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">修理コメント</h2><Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>更新</Button></div>
    <p className="text-sm text-amber-800">返信は共有ページに保存されます。お客様へのLINE通知はまだ実装されていません。</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <div ref={scrollRef} className="max-h-[36rem] space-y-3 overflow-y-auto rounded border bg-zinc-50 p-3">
      {loading && <p className="text-sm text-zinc-500">読み込み中…</p>}
      {!loading && messages.length === 0 && <p className="text-sm text-zinc-500">コメントはまだありません。</p>}
      {messages.map((message) => <div id={`message-${message.id}`} key={message.id} data-comment-id={message.senderType === "partner" && !message.readAt ? message.id : undefined} className={`flex ${message.senderType === "shop" ? "justify-end" : "justify-start"} ${message.id === focusMessageId ? "ring-2 ring-blue-500" : ""}`}>
        <div className={`max-w-[85%] rounded-lg border p-3 text-sm ${message.senderType === "shop" ? "border-blue-200 bg-blue-50" : "bg-white"}`}>
          <div className="mb-1 text-xs text-zinc-600">{message.senderType === "shop" ? "店舗" : "取引先・お客様"}</div>
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
          <div className="mt-2 text-right text-xs text-zinc-500">{new Date(message.createdAt).toLocaleString("ja-JP")}</div>
        </div>
      </div>)}
    </div>
    <div className="space-y-2"><label htmlFor={`repair-comment-${repairId}`} className="text-sm font-medium">返信を保存</label>
      <Textarea id={`repair-comment-${repairId}`} value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} className="min-h-24" />
      <div className="flex items-center justify-between"><span className="text-xs text-zinc-500">{body.length} / 500</span><Button type="button" onClick={() => void save()} disabled={busy || !body.trim()}>{busy ? "保存中…" : "コメントを保存"}</Button></div>
    </div>
  </section>;
}
