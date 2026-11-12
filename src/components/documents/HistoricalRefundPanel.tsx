"use client";

import { useRef, useState } from "react";

type RepairOption = { id: number; inquiryNumber: string; refund?: { amount: number; status: string; method: string; taxStatus: string; originalSaleGrossAmount: number } };

export function unsettledHistoricalRefundAmount(amount: number, status: string): number {
  return status === "PLANNED" || status === "AWAITING_OFFSET" ? amount : 0;
}

const statusLabels: Record<string, string> = {
  PLANNED: "返金予定", AWAITING_OFFSET: "請求相殺待ち", OFFSET_SETTLED: "請求相殺済み",
  BANK_SETTLED: "銀行返金済み", CANCELLED: "取消済み",
};

export function HistoricalRefundPanel({ noteId, repairs }: { noteId: number; repairs: RepairOption[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [repairId, setRepairId] = useState(repairs.find(repair => !repair.refund)?.id ?? 0);
  const operationKey = useRef(crypto.randomUUID());
  const available = repairs.some(repair => !repair.refund);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = {
      repairId, originalSaleReference: String(form.get("originalSaleReference") ?? ""),
      originalSaleSource: String(form.get("originalSaleSource") ?? ""),
      originalSaleDate: String(form.get("originalSaleDate") ?? "") || null,
      originalSaleGrossAmount: Number(form.get("originalSaleGrossAmount")), amount: Number(form.get("amount")),
      reason: String(form.get("reason") ?? ""), method: String(form.get("method") ?? ""),
      internalNotes: String(form.get("internalNotes") ?? ""), idempotencyKey: operationKey.current,
    };
    try {
      const response = await fetch(`/api/delivery-notes/${noteId}/historical-refunds`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "登録に失敗しました");
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登録に失敗しました"); setBusy(false); }
  }

  return <section className="border-t p-4 text-sm">
    <h2 className="font-semibold">過去修理の返金予定</h2>
    <p className="text-gray-600">売上・請求額には反映しません。相殺または銀行返金の完了は別途確認が必要です。登録後の訂正・取消は後続Taskで扱います。</p>
    {repairs.filter(repair => repair.refund).map(repair => <p key={repair.id} className="mt-1">
      {repair.inquiryNumber}: 返金登録額 ¥{repair.refund!.amount.toLocaleString()} / 未精算返金額 ¥{unsettledHistoricalRefundAmount(repair.refund!.amount, repair.refund!.status).toLocaleString()} / 元売上税込額 ¥{repair.refund!.originalSaleGrossAmount.toLocaleString()} / 方法: {repair.refund!.method === "OFFSET" ? "請求相殺" : "銀行返金"} / 状態: {statusLabels[repair.refund!.status] ?? "状態不明"} / 税務{repair.refund!.taxStatus === "PENDING" ? "確認待ち" : "確認済み"}
    </p>)}
    {available && <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
      <label>対象案件<select className="ml-1 border p-1" value={repairId} onChange={event => setRepairId(Number(event.target.value))}>{repairs.filter(repair => !repair.refund).map(repair => <option key={repair.id} value={repair.id}>{repair.inquiryNumber}</option>)}</select></label>
      <label>元売上参照<input className="ml-1 w-32 border p-1" name="originalSaleReference" required maxLength={500} /></label>
      <input type="hidden" name="originalSaleSource" value="LEGACY" />
      <span>記録元: 旧システム</span>
      <label>元売上日<input className="ml-1 border p-1" type="date" name="originalSaleDate" /></label>
      <label>元売上税込額<input className="ml-1 w-24 border p-1" type="number" name="originalSaleGrossAmount" min="1" step="1" required /></label>
      <label>返金税込額<input className="ml-1 w-24 border p-1" type="number" name="amount" min="1" step="1" required /></label>
      <label>理由<input className="ml-1 w-40 border p-1" name="reason" required maxLength={500} /></label>
      <label>予定方法<select className="ml-1 border p-1" name="method"><option value="OFFSET">後日請求相殺</option><option value="BANK">銀行返金</option></select></label>
      <label>内部メモ<input className="ml-1 w-40 border p-1" name="internalNotes" maxLength={2000} /></label>
      <button className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50" disabled={busy || !repairId}>返金予定を登録</button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </form>}
  </section>;
}
