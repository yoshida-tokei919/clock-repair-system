"use client";

import { useState } from "react";
import { percentInputToBps } from "@/lib/b2b-invoice-discount";

export default function B2BDiscountSettings({ standardRateBps, onSaved }: {
  standardRateBps: number | null; onSaved: (rate: number) => void;
}) {
  const [rate, setRate] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const bps = percentInputToBps(rate ?? String((standardRateBps ?? 0) / 100));
      if (bps === "" || !Number.isInteger(bps) || bps < 0 || bps > 10000) throw new Error("割引率は0〜100%の0.01%単位で入力してください");
      const response = await fetch("/api/settings/b2b-invoice-discount", { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ standardRateBps: bps }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存できません");
      setRate(String(data.standardRateBps / 100)); onSaved(data.standardRateBps); setMessage("保存しました");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存できません"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4 pt-4">
    <p className="text-sm text-slate-600">標準割引率の初期値は3%です。2026年9月以前の納品には2%の履歴があります。発行時に対象納品日を確認し、請求書ごとに変更してください。既発行の金額は変わりません。</p>
    <label className="block text-sm">標準割引率（%）
      <input className="mt-1 block w-full rounded border p-2" type="number" min="0" max="100" step="0.01"
        value={rate ?? (standardRateBps === null ? "" : String(standardRateBps / 100))} onChange={event => setRate(event.target.value)} />
    </label>
    <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={busy || standardRateBps === null || rate === ""} onClick={() => void save()}>保存</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
