"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Candidate = { id: number; invoiceNumber: string; grossTotalAmount: number; sourceCustomerName: string;
  companyId: number; companyName: string; billingCustomerId: number };
type Bundle = { id: number; createdAt: string; companyName: string; billingName: string;
  publication: { status: string; publicToken: string } | null; pdfReady: boolean;
  paidAmount: number; outstandingBalance: number; paymentStatus: string;
  deliveryMethod: string; deliveryStatus: string; operationalSafe: boolean; canConfirmPayment: boolean;
  billingCompanyName: string | null; billingZipCode: string | null; billingPrefecture: string | null;
  billingCity: string | null; billingStreet: string | null; billingBuilding: string | null;
  billingAddress: string | null; grossTotalAmount: number;
  sources: { id: number; invoiceId: number; invoiceNumber: string; sourceCustomerName: string;
    sourceCompanyName: string | null; grossTotalAmount: number; paidAmount: number; outstandingBalance: number;
    deliveryNotes: { id: number; deliveryNoteId: number | null; slipNumber: string | null;
      repairCount: number; subtotalAmount: number | null }[] }[] };

export function ConsolidatedInvoicePanel() {
  const [eligible, setEligible] = useState<Candidate[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [selected, setSelected] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/invoices/consolidated");
    if (!response.ok) throw new Error("集約請求の取得に失敗しました。");
    const data = await response.json();
    setEligible(data.eligible); setBundles(data.bundles);
  }, []);
  useEffect(() => { load().catch(error => setError(error.message)); }, [load]);
  const companies = [...new Map(eligible.map(row => [row.companyId, row])).values()];
  const candidates = eligible.filter(row => row.companyId === companyId);
  const chosen = candidates.filter(row => selected.includes(row.id));
  const billingCustomerId = candidates[0]?.billingCustomerId;

  async function create() {
    if (!companyId || !billingCustomerId || selected.length < 2) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/invoices/consolidated", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, billingCustomerId, invoiceIds: selected }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "集約請求を作成できませんでした。");
      setSelected([]); setExpanded(result.id); await load();
    } catch (error) { setError(error instanceof Error ? error.message : "集約請求を作成できませんでした。"); }
    finally { setSaving(false); }
  }

  async function generatePdf(id: number) {
    setGeneratingId(id); setError("");
    try {
      const response = await fetch(`/api/invoices/consolidated/${id}/pdf/generate`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "PDFを生成できませんでした。");
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "PDFを生成できませんでした。"); }
    finally { setGeneratingId(null); }
  }

  async function queueLine(id: number) {
    setActionId(id); setError("");
    try {
      const response = await fetch(`/api/invoices/consolidated/${id}/line`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "LINE送信待ちを作成できませんでした。");
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "LINE送信待ちを作成できませんでした。"); }
    finally { setActionId(null); }
  }

  async function confirmPayment(id: number) {
    if (!window.confirm("銀行口座で集約請求の全額入金を実際に確認しましたか？元請求書すべてへ一括登録します。")) return;
    setActionId(id); setError("");
    try {
      const response = await fetch(`/api/invoices/consolidated/${id}/payments/manual`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "入金を登録できませんでした。");
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "入金を登録できませんでした。"); }
    finally { setActionId(null); }
  }

  return <section className="mt-8 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <h2 className="text-lg font-semibold text-gray-700">既存B2B請求書の集約</h2>
    <p className="text-sm text-gray-500 mt-1">同じ会社の請求書を明示的に選択します。元請求書と店舗はそのまま残ります。</p>
    <div className="mt-4">
      <label className="text-sm text-gray-600" htmlFor="consolidation-company">会社</label>
      <select id="consolidation-company" className="ml-3 border rounded px-2 py-1" value={companyId}
        onChange={event => { setCompanyId(event.target.value ? Number(event.target.value) : ""); setSelected([]); }}>
        <option value="">会社を選択</option>
        {companies.map(row => <option key={row.companyId} value={row.companyId}>{row.companyName}</option>)}
      </select>
    </div>
    {companyId && <div className="mt-3 space-y-2">
      {candidates.map(row => <label key={row.id} className="flex gap-3 items-center text-sm border rounded p-2">
        <input type="checkbox" checked={selected.includes(row.id)} onChange={() => setSelected(previous =>
          previous.includes(row.id) ? previous.filter(id => id !== row.id) : [...previous, row.id])} />
        <span>{row.sourceCustomerName} / {row.invoiceNumber}</span>
        <span className="ml-auto">¥{row.grossTotalAmount.toLocaleString()}</span>
      </label>)}
      <div className="flex items-center justify-between pt-2">
        <span>選択合計（税込） ¥{chosen.reduce((sum, row) => sum + row.grossTotalAmount, 0).toLocaleString()}</span>
        <button className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-40" disabled={saving || selected.length < 2} onClick={create}>
          {saving ? "作成中..." : "集約請求を作成"}
        </button>
      </div>
    </div>}
    {error && <p role="alert" className="text-red-600 text-sm mt-3">{error}</p>}
    <h3 className="font-semibold mt-7 mb-2">作成済み集約請求</h3>
    {bundles.length === 0 && <p className="text-sm text-gray-500">まだありません。</p>}
    {bundles.map(bundle => <div key={bundle.id} className="border rounded mb-2 p-3 text-sm">
      <button className="w-full text-left flex justify-between" onClick={() => setExpanded(expanded === bundle.id ? null : bundle.id)}>
        <span>#{bundle.id} {bundle.companyName} / {new Date(bundle.createdAt).toLocaleDateString("ja-JP")}</span>
        <strong>¥{bundle.grossTotalAmount.toLocaleString()}</strong>
      </button>
      {expanded === bundle.id && <div className="mt-3 border-t pt-3 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          {bundle.pdfReady ? <>
            <a className="text-blue-700 underline" href={`/api/invoices/consolidated/${bundle.id}/pdf`} target="_blank" rel="noopener noreferrer">PDFを開く・保存</a>
            <a className="text-blue-700 underline" href={`/customer/consolidated-invoices/${bundle.publication?.publicToken}`} target="_blank" rel="noopener noreferrer">顧客共有ページを開く</a>
          </> : <button className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-40" disabled={generatingId !== null || bundle.publication !== null} onClick={() => generatePdf(bundle.id)}>
            {generatingId === bundle.id ? "PDF生成中..." : "PDF生成"}
          </button>}
        </div>
        <p>入金: {bundle.paymentStatus === "PAID" ? "全額入金済み" : bundle.paymentStatus === "PARTIAL" ? "一部入金（個別確認）" : "未入金"} / 入金済 ¥{bundle.paidAmount.toLocaleString()} / 未収 ¥{bundle.outstandingBalance.toLocaleString()}</p>
        <p>案内: {bundle.deliveryStatus === "CONFIRMED" ? "LINE 履歴確認済み（過去の送信記録）" : bundle.deliveryStatus === "NO_NEW_DELIVERY" ? bundle.paymentStatus === "PARTIAL" ? "一部入金のため新規案内不可（個別確認）" : bundle.paymentStatus === "PAID" ? "入金済みのため新規案内なし" : "入金・前受金などの履歴を要確認（新規案内不可）" : bundle.deliveryMethod === "BLOCKED" ? "要確認（元請求書の状態または送信履歴）" : bundle.deliveryMethod === "POSTAL" ? "POSTAL（郵送対象）" : bundle.deliveryStatus === "APPROVED" ? "LINE 送信待ち" : bundle.deliveryStatus === "POST_UNCONFIRMED" ? "LINE 送信結果未確定" : bundle.deliveryStatus === "CANCELLED" ? "LINE 送信待ち取消済み" : `LINE ${bundle.deliveryStatus}`}</p>
        {!bundle.operationalSafe && <p role="alert" className="text-sm font-semibold text-red-700">この集約請求は現在の元請求書・送信状態と一致しません。請求書としての有効性を確認してください。共有URLの案内は保留してください。</p>}
        <div className="flex flex-wrap gap-2">
          {bundle.pdfReady && bundle.deliveryStatus === "READY" && <button className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-40" disabled={actionId !== null} onClick={() => queueLine(bundle.id)}>{actionId === bundle.id ? "処理中..." : "LINE通常トーク送信待ちに登録"}</button>}
          {bundle.canConfirmPayment && <button className="rounded bg-green-700 px-3 py-2 text-white disabled:opacity-40" disabled={actionId !== null} onClick={() => confirmPayment(bundle.id)}>{actionId === bundle.id ? "処理中..." : "銀行全額入金を確認・登録"}</button>}
        </div>
        <p>請求先（作成時）: {bundle.billingCompanyName || bundle.billingName} {bundle.billingName}<br />
          〒{bundle.billingZipCode || "—"} {bundle.billingAddress || [bundle.billingPrefecture, bundle.billingCity, bundle.billingStreet, bundle.billingBuilding].filter(Boolean).join("")}</p>
        {bundle.sources.map(source => <div key={source.id} className="bg-gray-50 rounded p-2">
          <p>{source.sourceCompanyName || source.sourceCustomerName} / <Link className="text-blue-700 underline" href={`/documents/invoice/${source.invoiceId}`}>{source.invoiceNumber}</Link> / 税込 ¥{source.grossTotalAmount.toLocaleString()} / 入金済 ¥{source.paidAmount.toLocaleString()} / 未収 ¥{source.outstandingBalance.toLocaleString()}</p>
          {source.deliveryNotes.length === 0 && <p className="text-gray-500">納品書スナップショットなし</p>}
          {source.deliveryNotes.map(note => <p key={note.id} className="pl-3 text-gray-600">
            納品書 {note.slipNumber || (note.deliveryNoteId ? `#${note.deliveryNoteId}` : "未紐付け")} / 修理 {note.repairCount}件
            {note.subtotalAmount !== null ? ` / 税抜小計 ¥${note.subtotalAmount.toLocaleString()}` : " / 金額未確定"}
          </p>)}
        </div>)}
        <p className="text-xs text-gray-500">納品書行に税込金額・税額は配賦していません。LINEのAPPROVEDは送信待ちであり、送信済みではありません。</p>
      </div>}
    </div>)}
  </section>;
}
