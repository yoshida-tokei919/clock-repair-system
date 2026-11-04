"use client";

import { useEffect, useState } from "react";
import { percentInputToBps } from "@/lib/b2b-invoice-discount";

export default function B2BInvoiceDiscountSettingsPage() {
  const [rate, setRate] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch("/api/settings/b2b-invoice-discount").then(async response => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setRate(String(data.standardRateBps / 100));
  }).catch(error => setMessage(error instanceof Error ? error.message : "設定を取得できません")); }, []);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const bps = percentInputToBps(rate);
      const response = await fetch("/api/settings/b2b-invoice-discount", { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ standardRateBps: bps }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRate(String(data.standardRateBps / 100)); setMessage("保存しました");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存できません"); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-xl p-8 space-y-5">
    <h1 className="text-2xl font-bold">B2B請求書の標準割引率</h1>
    <p className="text-sm text-slate-600">標準割引率の初期値は3%です。2026年9月以前の納品には2%の履歴があります。発行時に対象納品日を確認し、請求書ごとに変更してください。既発行の金額は変わりません。</p>
    <label className="block text-sm">標準割引率（%）
      <input className="mt-1 block w-full rounded border p-2" type="number" min="0" max="100" step="0.01"
        value={rate} onChange={event => setRate(event.target.value)} />
    </label>
    <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy || rate === ""} onClick={() => void save()}>保存</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </main>;
}
