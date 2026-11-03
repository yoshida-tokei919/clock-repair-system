"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConsolidatedInvoiceActions({ id, pdfReady, canGenerate, canQueue, canConfirmPayment, shareToken }: {
  id: number; pdfReady: boolean; canGenerate: boolean; canQueue: boolean; canConfirmPayment: boolean; shareToken: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(path: string, body?: object) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/invoices/consolidated/${id}/${path}`, { method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "操作に失敗しました。");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作に失敗しました。"); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    {canGenerate && <button disabled={busy} onClick={() => void act("pdf/generate")} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">PDF生成</button>}
    {pdfReady && <>
      <a className="rounded border px-3 py-2 text-blue-700" href={`/api/invoices/consolidated/${id}/pdf`} target="_blank" rel="noreferrer">PDFを開く・保存</a>
      {shareToken && <a className="rounded border px-3 py-2 text-blue-700" href={`/customer/consolidated-invoices/${shareToken}`} target="_blank" rel="noreferrer">共有ページ</a>}
    </>}
    {canQueue && <button disabled={busy} onClick={() => void act("line")} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">LINE送信待ちに登録</button>}
    {canConfirmPayment && <button disabled={busy} onClick={() => {
      if (window.confirm("銀行で全額の入金を確認しましたか？元請求書すべてに入金を登録します。")) void act("payments/manual", { confirmed: true });
    }} className="rounded bg-green-700 px-3 py-2 text-white disabled:opacity-50">銀行全額入金を確認・登録</button>}
    {error && <span role="alert" className="text-red-700">{error}</span>}
  </div>;
}
