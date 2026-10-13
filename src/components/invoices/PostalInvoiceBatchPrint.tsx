"use client";

import { useEffect, useState } from "react";
import {
  fetchInvoicePdfForPrint, orderedSelectedPostalIds, printPostalInvoiceBatch,
  submitInvoicePdfToFixedPrinter, type PostalInvoiceTarget, type PostalPrintResult,
} from "@/lib/postal-invoice-print";

async function loadTargets(): Promise<PostalInvoiceTarget[]> {
  const response = await fetch("/api/invoices/postal-print-targets", { cache: "no-store" });
  if (!response.ok) throw new Error("郵送請求書の候補を取得できませんでした。画面を更新してください。");
  return response.json();
}

export function PostalInvoiceBatchPrint() {
  const [targets, setTargets] = useState<PostalInvoiceTarget[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<PostalPrintResult | null>(null);
  const [loadError, setLoadError] = useState("");

  async function refreshTargets() {
    setLoading(true);
    setLoadError("");
    try {
      const latest = await loadTargets();
      setTargets(latest);
      const available = new Set(latest.map(target => target.id));
      setSelected(previous => new Set([...previous].filter(id => available.has(id))));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "郵送請求書の候補を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refreshTargets(); }, []);

  async function printSelected() {
    const ids = orderedSelectedPostalIds(targets, selected);
    if (!ids.length || printing) return;
    if (!window.confirm(`${ids.length}件の郵送請求書PDFをNEC MultiWriter 5750Cへ順番に投入します。紙の出力はプリンタで確認してください。続けますか？`)) return;
    setPrinting(true);
    setProgress(0);
    setResult(null);
    const outcome = await printPostalInvoiceBatch(ids, {
      isStillEligible: async id => (await loadTargets()).some(target => target.id === id),
      fetchPdf: fetchInvoicePdfForPrint,
      submitPdf: submitInvoicePdfToFixedPrinter,
    }, setProgress);
    setResult(outcome);
    setSelected(new Set(outcome.remainingIds));
    setPrinting(false);
  }

  const selectedCount = orderedSelectedPostalIds(targets, selected).length;
  return <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold text-gray-700">郵送請求書の一括印刷</h2>
        <p className="mt-1 text-xs text-gray-500">印刷対象 {targets.length}件。印刷ジョブの投入のみ行い、郵送済みにはしません。</p>
      </div>
      <button type="button" onClick={() => void refreshTargets()} disabled={loading || printing}
        className="text-xs text-blue-600 hover:underline disabled:opacity-50">候補を更新</button>
    </div>
    {loadError ? <p role="alert" className="mt-3 text-sm text-red-600">{loadError}</p> : null}
    {loading ? <p className="mt-3 text-sm text-gray-500">候補を確認中...</p> : targets.length > 0 ? <>
      <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" disabled={printing} checked={selectedCount === targets.length}
          onChange={event => setSelected(event.target.checked ? new Set(targets.map(target => target.id)) : new Set())} />
        全選択
      </label>
      <div className="mt-2 max-h-52 space-y-1 overflow-auto">
        {targets.map(target => <label key={target.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
          <input type="checkbox" disabled={printing} checked={selected.has(target.id)} onChange={() => setSelected(previous => {
            const next = new Set(previous);
            next.has(target.id) ? next.delete(target.id) : next.add(target.id);
            return next;
          })} />
          <span className="font-mono text-blue-700">{target.invoiceNumber}</span>
          <span className="truncate text-gray-600">{target.customerName}</span>
        </label>)}
      </div>
      <button type="button" onClick={() => void printSelected()} disabled={!selectedCount || printing || Boolean(loadError)}
        className="mt-3 rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
        {printing ? `順次投入中 (${progress}/${selectedCount})` : `選択した${selectedCount}件を5750Cへ印刷`}
      </button>
    </> : <p className="mt-3 text-sm text-gray-500">印刷できる郵送請求書はありません。</p>}
    {result ? <p role={result.error ? "alert" : "status"} className={`mt-3 text-sm ${result.error ? "text-red-700" : "text-green-800"}`}>
      印刷ジョブ投入成功 {result.submittedIds.length}件、残り {result.remainingIds.length}件。
      {result.error ? ` ${result.error} 自動再試行は行いません。` : " 紙の出力はプリンタで確認してください。"}
    </p> : null}
  </section>;
}
