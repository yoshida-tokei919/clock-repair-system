"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Candidate = { id: number; invoiceNumber: string; grossTotalAmount: number; sourceCustomerName: string;
  companyId: number; companyName: string; billingCustomerId: number };
type Bundle = { id: number; createdAt: string; companyName: string; billingName: string;
  billingCompanyName: string | null; billingZipCode: string | null; billingPrefecture: string | null;
  billingCity: string | null; billingStreet: string | null; billingBuilding: string | null;
  billingAddress: string | null; grossTotalAmount: number;
  sources: { id: number; invoiceId: number; invoiceNumber: string; sourceCustomerName: string;
    sourceCompanyName: string | null; grossTotalAmount: number;
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
        <p>請求先（作成時）: {bundle.billingCompanyName || bundle.billingName} {bundle.billingName}<br />
          〒{bundle.billingZipCode || "—"} {bundle.billingAddress || [bundle.billingPrefecture, bundle.billingCity, bundle.billingStreet, bundle.billingBuilding].filter(Boolean).join("")}</p>
        {bundle.sources.map(source => <div key={source.id} className="bg-gray-50 rounded p-2">
          <p>{source.sourceCompanyName || source.sourceCustomerName} / <Link className="text-blue-700 underline" href={`/documents/invoice/${source.invoiceId}`}>{source.invoiceNumber}</Link> / 税込 ¥{source.grossTotalAmount.toLocaleString()}</p>
          {source.deliveryNotes.length === 0 && <p className="text-gray-500">納品書スナップショットなし</p>}
          {source.deliveryNotes.map(note => <p key={note.id} className="pl-3 text-gray-600">
            納品書 {note.slipNumber || (note.deliveryNoteId ? `#${note.deliveryNoteId}` : "未紐付け")} / 修理 {note.repairCount}件
            {note.subtotalAmount !== null ? ` / 税抜小計 ¥${note.subtotalAmount.toLocaleString()}` : " / 金額未確定"}
          </p>)}
        </div>)}
        <p className="text-xs text-gray-500">納品書行に税込金額・税額は配賦していません。PDF発行・送付・入金処理は未対応です。</p>
      </div>}
    </div>)}
  </section>;
}
