"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { ProcurementLeadTimeFeedbackRow } from "@/lib/procurement-lead-time-feedback";

type SupplierRow = { id: number; name: string; manualProcessingLeadDays: number | null };
type ShippingMethodRow = { id: number; name: string; carrierName: string | null;
  manualTransitLeadDays: number | null; isActive: boolean; notes: string | null };
type Data = { suppliers: SupplierRow[]; shippingMethods: ShippingMethodRow[] };
type ShippingDraft = { id: number | null; name: string; carrierName: string; manualTransitLeadDays: string;
  isActive: boolean; notes: string };
const emptyDraft = (): ShippingDraft => ({ id: null, name: "", carrierName: "", manualTransitLeadDays: "", isActive: true, notes: "" });
const inputClass = "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm";
const buttonClass = "rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50";

const formatDays = (value: number) => `${Number(value.toFixed(1))}日`;
const formatDelta = (value: number | null) => value === null ? "" :
  `（設定比 ${value > 0 ? "+" : ""}${formatDays(value)}）`;

export function ProcurementLeadTimeFeedbackTable({ rows }: { rows: readonly ProcurementLeadTimeFeedbackRow[] }) {
  return <div className="space-y-3 border-t pt-5">
    <h3 className="font-semibold">調達リードタイム実績（総日数）</h3>
    <p className="text-sm text-zinc-600">発注日時から入荷日時までの東京時間の暦日差です。観測できるのは調達の総リードタイムだけで、この実績から仕入先の処理日数と配送方法の輸送日数を個別に分解・推定することはできません。設定値との比較は現在の設定に基づき、当時の設定を復元したものではありません。</p>
    <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b bg-zinc-50">{["仕入先", "配送方法", "件数", "現在設定合計", "中央値", "平均", "P80", "最小〜最大"].map(label => <th key={label} className="whitespace-nowrap p-2">{label}</th>)}</tr></thead><tbody>
      {rows.map(row => <tr key={`${row.supplierId ?? "unknown"}:${row.shippingMethodId ?? "unknown"}`} className="border-b">
        <td className="p-2">{row.supplierName ?? "不明（仕入先なし）"}</td>
        <td className="p-2">{row.shippingMethodName ?? "不明（配送方法なし）"}</td>
        <td className="p-2">{row.sampleCount}</td>
        <td className="p-2">{row.configuredTotalDays === null ? "未設定" : formatDays(row.configuredTotalDays)}</td>
        <td className="whitespace-nowrap p-2">{formatDays(row.medianDays)}{formatDelta(row.medianDeltaDays)}</td>
        <td className="whitespace-nowrap p-2">{formatDays(row.meanDays)}{formatDelta(row.meanDeltaDays)}</td>
        <td className="whitespace-nowrap p-2">{formatDays(row.p80Days)}{formatDelta(row.p80DeltaDays)}</td>
        <td className="whitespace-nowrap p-2">{formatDays(row.minDays)}〜{formatDays(row.maxDays)}</td>
      </tr>)}
      {rows.length === 0 && <tr><td colSpan={8} className="p-3 text-zinc-500">入荷日時まで記録された発注実績はありません。</td></tr>}
    </tbody></table></div>
  </div>;
}

async function api(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "通信に失敗しました。");
  return data;
}

function days(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(number)) throw new Error("日数は0以上の整数で入力してください。");
  return number;
}

export default function ProcurementSettingsEditor() {
  const [data, setData] = useState<Data | null>(null);
  const [feedback, setFeedback] = useState<ProcurementLeadTimeFeedbackRow[] | null>(null);
  const [feedbackError, setFeedbackError] = useState(false);
  const [supplierDays, setSupplierDays] = useState<Record<number, string>>({});
  const [draft, setDraft] = useState<ShippingDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const reload = useCallback(async () => {
    const [next, nextFeedback] = await Promise.all([
      api("/api/settings/procurement") as Promise<Data>,
      (api("/api/settings/procurement/feedback") as Promise<ProcurementLeadTimeFeedbackRow[]>).catch(() => null),
    ]);
    setData(next);
    setFeedback(nextFeedback);
    setFeedbackError(nextFeedback === null);
    setSupplierDays(Object.fromEntries(next.suppliers.map(row => [row.id, row.manualProcessingLeadDays === null ? "" : String(row.manualProcessingLeadDays)])));
  }, []);
  useEffect(() => { reload().catch(err => setError(err.message)); }, [reload]);

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); await reload(); setMessage(success); }
    catch (err) { setError(err instanceof Error ? err.message : "処理に失敗しました。"); }
    finally { setBusy(false); }
  }

  function edit(row: ShippingMethodRow) {
    setDraft({ id: row.id, name: row.name, carrierName: row.carrierName ?? "",
      manualTransitLeadDays: row.manualTransitLeadDays === null ? "" : String(row.manualTransitLeadDays),
      isActive: row.isActive, notes: row.notes ?? "" });
    document.getElementById("shipping-method-editor")?.scrollIntoView({ behavior: "smooth" });
  }

  async function saveShippingMethod() {
    await run(async () => {
      const body = { name: draft.name, carrierName: draft.carrierName.trim() || null,
        manualTransitLeadDays: days(draft.manualTransitLeadDays), isActive: draft.isActive, notes: draft.notes.trim() || null };
      await api(draft.id === null ? "/api/settings/procurement/shipping-methods" : `/api/settings/procurement/shipping-methods/${draft.id}`,
        draft.id === null ? "POST" : "PUT", body);
      setDraft(emptyDraft());
    }, draft.id === null ? "配送方法を追加しました。" : "配送方法を更新しました。");
  }

  return <section className="space-y-5 rounded border bg-white p-5 shadow-sm">
    <h2 className="text-lg font-semibold">調達リードタイム設定</h2>
    <p className="text-sm text-zinc-600">仕入先の処理日数と配送方法の輸送日数を別々に登録します。空欄は未設定、0は明示的な0日です。現在の発注や予定日はこの画面の変更では再計算されません。</p>
    {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    {!data ? <p className="text-sm">{error ? "調達設定を表示できません。" : "調達設定を読み込み中です。"}</p> : <>
      <div className="space-y-3">
        <h3 className="font-semibold">仕入先の処理日数</h3>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b bg-zinc-50"><th className="p-2">仕入先</th><th className="p-2">手動処理日数</th><th className="p-2">操作</th></tr></thead><tbody>
          {data.suppliers.map(row => <tr key={row.id} className="border-b"><td className="p-2">{row.name}</td><td className="p-2"><input aria-label={`${row.name}の手動処理日数`} className={`${inputClass} max-w-40`} type="number" min="0" step="1" value={supplierDays[row.id] ?? ""} onChange={event => setSupplierDays(current => ({ ...current, [row.id]: event.target.value }))} placeholder="未設定" /></td><td className="p-2"><button className={buttonClass} disabled={busy} onClick={() => run(() => api(`/api/settings/procurement/suppliers/${row.id}`, "PUT", { manualProcessingLeadDays: days(supplierDays[row.id] ?? "") }), `${row.name}の処理日数を保存しました。`)}>保存</button></td></tr>)}
          {data.suppliers.length === 0 && <tr><td colSpan={3} className="p-3 text-zinc-500">仕入先がありません。</td></tr>}
        </tbody></table></div>
      </div>
      <div className="space-y-3 border-t pt-5">
        <h3 className="font-semibold">調達配送方法</h3>
        <p className="text-sm text-zinc-600">無効にした方法も一覧に残ります。配送会社名とメモは任意です。</p>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b bg-zinc-50">{["方法名", "配送会社", "手動輸送日数", "状態", "メモ", "操作"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>
          {data.shippingMethods.map(row => <tr key={row.id} className="border-b"><td className="p-2">{row.name}</td><td className="p-2">{row.carrierName ?? "—"}</td><td className="p-2">{row.manualTransitLeadDays === null ? "未設定" : `${row.manualTransitLeadDays}日`}</td><td className="p-2">{row.isActive ? "有効" : "無効"}</td><td className="p-2">{row.notes ?? "—"}</td><td className="p-2"><button className="text-blue-700 underline" disabled={busy} onClick={() => edit(row)}>編集</button></td></tr>)}
          {data.shippingMethods.length === 0 && <tr><td colSpan={6} className="p-3 text-zinc-500">配送方法はまだありません。</td></tr>}
        </tbody></table></div>
        <div id="shipping-method-editor" className="space-y-3 border-t pt-4"><h4 className="font-semibold">{draft.id === null ? "配送方法を追加" : `配送方法 #${draft.id} を編集`}</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm"><span className="mb-1 block font-medium">方法名</span><input className={inputClass} value={draft.name} onChange={e => setDraft(current => ({ ...current, name: e.target.value }))} /></label>
            <label className="text-sm"><span className="mb-1 block font-medium">配送会社名（任意）</span><input className={inputClass} value={draft.carrierName} onChange={e => setDraft(current => ({ ...current, carrierName: e.target.value }))} /></label>
            <label className="text-sm"><span className="mb-1 block font-medium">手動輸送日数（空欄可）</span><input className={inputClass} type="number" min="0" step="1" value={draft.manualTransitLeadDays} placeholder="未設定" onChange={e => setDraft(current => ({ ...current, manualTransitLeadDays: e.target.value }))} /></label>
            <label className="text-sm"><span className="mb-1 block font-medium">状態</span><select className={inputClass} value={draft.isActive ? "active" : "inactive"} onChange={e => setDraft(current => ({ ...current, isActive: e.target.value === "active" }))}><option value="active">有効</option><option value="inactive">無効</option></select></label>
            <label className="text-sm md:col-span-2"><span className="mb-1 block font-medium">メモ（任意）</span><input className={inputClass} value={draft.notes} onChange={e => setDraft(current => ({ ...current, notes: e.target.value }))} /></label>
          </div>
          <div className="flex gap-3"><button className={buttonClass} disabled={busy} onClick={saveShippingMethod}>{draft.id === null ? "追加" : "更新"}</button>{draft.id !== null && <button className="rounded border px-3 py-1.5 text-sm" disabled={busy} onClick={() => setDraft(emptyDraft())}>編集を解除</button>}</div>
        </div>
      </div>
      {feedback && <ProcurementLeadTimeFeedbackTable rows={feedback} />}
      {feedbackError && <p role="alert" className="border-t pt-5 text-sm text-red-700">調達リードタイム実績を読み込めませんでした。</p>}
    </>}
  </section>;
}
