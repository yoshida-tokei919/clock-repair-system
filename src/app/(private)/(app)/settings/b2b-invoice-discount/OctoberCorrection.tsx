"use client";

import { useEffect, useState } from "react";

type Preview = {
  fingerprint: string;
  batch: { id: number; status: string } | null;
  invoices: { oldNumber: string; expectedNewNumber: string; old: readonly number[]; corrected: readonly number[] }[];
};

export default function OctoberCorrection() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh() {
    const response = await fetch("/api/invoices/october-2026-correction", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "状態を取得できません");
    setPreview(data);
  }
  useEffect(() => { void refresh().catch(error => setMessage(error instanceof Error ? error.message : "状態を取得できません")); }, []);
  async function run(action: "stage" | "resume" | "activate") {
    if (!preview || busy) return;
    setBusy(true); setMessage(action === "stage" ? "PDFを準備しています…" : action === "resume" ? "準備を再開しています…" : "有効化しています…");
    try {
      const response = await fetch("/api/invoices/october-2026-correction", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, fingerprint: preview.fingerprint, confirm: true,
          ...(action === "stage" ? {} : { batchId: preview.batch?.id }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作結果を確認できません");
      setConfirmation("");
      await refresh();
      setMessage(action === "activate" ? "有効化しました" : "準備が完了しました。内容を確認してから有効化してください");
    } catch (error) {
      setPreview(null);
      setMessage(`${error instanceof Error ? error.message : "操作結果を確認できません"}。操作を停止しました。管理者が状態を確認してください。`);
    } finally { setBusy(false); }
  }
  const status = preview?.batch?.status;
  const action = !preview || status === "activated" ? null : !status ? "stage" : status === "preparing" ? "resume" : status === "ready" ? "activate" : null;
  const phrase = action === "stage" ? "2026年10月請求書を準備" : action === "activate" ? "2026年10月請求書を有効化" : "";
  const yen = (amount: number) => `${amount.toLocaleString("ja-JP")}円`;
  return <section className="space-y-4 rounded border p-5">
    <h2 className="text-lg font-bold">2026年10月の発行済み請求書訂正</h2>
    <p className="text-sm">6件の合計：{yen(283036)} → {yen(274662)}（{yen(8374)}減額）。集約請求：{yen(82428)} → {yen(79995)}。</p>
    {preview && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">旧 → 新</th><th className="text-right">旧金額</th><th className="text-right">新金額</th></tr></thead><tbody>
      {preview.invoices.map(row => <tr key={row.oldNumber}><td>{row.oldNumber} → {row.expectedNewNumber}</td><td className="text-right">{yen(row.old[3])}</td><td className="text-right">{yen(row.corrected[3])}</td></tr>)}
    </tbody></table></div>}
    <p>状態：{busy ? "処理中" : status === "activated" ? "有効化済み（閲覧のみ）" : status === "ready" ? "準備完了・有効化待ち" : status === "preparing" ? "準備途中" : preview ? "未開始" : "確認不可"}</p>
    {action === "resume" && <button className="rounded bg-slate-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void run("resume")}>PDF準備を再開</button>}
    {(action === "stage" || action === "activate") && <div className="space-y-2"><label className="block text-sm">実行するには「{phrase}」と入力
      <input className="mt-1 block w-full rounded border p-2" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} />
    </label><button className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy || confirmation !== phrase} onClick={() => void run(action)}>{action === "stage" ? "訂正PDFを準備" : "訂正を有効化"}</button></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
