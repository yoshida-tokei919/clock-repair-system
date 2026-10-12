"use client";

import { useState } from "react";

type Choice = "SHIP_COMPLETED" | "WAIT_ALL";
type SnapshotRepair = { inquiryNumber: string; completedAtRequest: boolean };
export function ShippingDecisionForm({ token, initialChoice, repairs }: { token: string; initialChoice: Choice | null; repairs: SnapshotRepair[] }) {
  const [choice, setChoice] = useState<Choice | null>(initialChoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(next: Choice) {
    if (busy || choice) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/customer/intake-shipping/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice: next }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "回答を保存できませんでした。");
      setChoice(data.decision.choice);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "回答を保存できませんでした。"); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm" aria-label="発送についてのご希望">
    <h2 className="text-lg font-bold">発送についてのご希望</h2>
    <p className="mt-2 text-sm">この発送確認を依頼した時点の対象時計です。現在の修理状況は下の各時計をご確認ください。</p>
    <ul className="mt-3 space-y-2 text-sm">{repairs.map(repair => <li key={repair.inquiryNumber} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"><span>お問合番号 {repair.inquiryNumber}</span><strong className={repair.completedAtRequest ? "text-emerald-700" : "text-slate-600"}>{repair.completedAtRequest ? "今回先に発送できる時計" : "依頼時は未完成"}</strong></li>)}</ul>
    {choice ? <p role="status" className="mt-2 text-sm">ご回答: {choice === "SHIP_COMPLETED" ? "完成した時計を先に発送する" : "すべての時計が完成するまで待つ"}</p> : <>
      <p className="mt-2 text-sm leading-6">一部の時計の修理が完了しました。発送方法を一度だけお選びください。配達日時のご希望は次のご案内でお伺いします。</p>
      <div className="mt-4 grid gap-2"><button type="button" disabled={busy} onClick={() => void submit("SHIP_COMPLETED")} className="rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">完成した時計を先に発送する</button><button type="button" disabled={busy} onClick={() => void submit("WAIT_ALL")} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold disabled:opacity-50">すべての時計が完成するまで待つ</button></div>
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
