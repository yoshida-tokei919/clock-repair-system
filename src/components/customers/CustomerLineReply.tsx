"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Destination = { lineUserId: number; label: string; verifiedAt: Date; sendAvailable: boolean };

export function CustomerLineReply({ customerId, destinations }: { customerId: number; destinations: Destination[] }) {
  const router = useRouter();
  const available = destinations.filter((destination) => destination.sendAvailable);
  const [lineUserId, setLineUserId] = useState<number | null>(destinations.length === 1 && available.length === 1 ? available[0].lineUserId : null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestKey, setRequestKey] = useState<string | null>(null);

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
