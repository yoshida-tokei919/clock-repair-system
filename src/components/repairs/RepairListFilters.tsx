"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FILTER_KEYS, REPAIR_STATUSES, type RepairListFilters, repairListUrl, normalizeRepairListParams } from "@/lib/repair-list-filters";

type Option = { id: number; name: string };
type SavedView = { name: string; filters: RepairListFilters };
const STORAGE_KEY = "repair-list-saved-views-v1";
const labels: Record<string, string> = { q: "検索", type: "顧客区分", customer: "顧客", brand: "ブランド", status: "ステータス", delivery: "納品状態", partEntries: "記録済み部品行", orderRequest: "発注依頼", receptionFrom: "受付日から", receptionTo: "受付日まで", approvalFrom: "承認日から", approvalTo: "承認日まで", pendingFrom: "承認待ち履歴から", pendingTo: "承認待ち履歴まで", deliveredFrom: "実納品日から", deliveredTo: "実納品日まで", amountMin: "見積額下限", amountMax: "見積額上限" };
const partEntryLabels: Record<string, string> = { with: "あり", without: "なし" };
const orderRequestLabels: Record<string, string> = { pending: "未発注の依頼あり", ordered: "注文済みの依頼あり", received: "入荷済みの依頼あり", partial: "未発注と注文済み・入荷済みが混在", noRequest: "依頼記録なし" };

export function RepairListFilters({ filters, customers, brands, count }: { filters: RepairListFilters; customers: Option[]; brands: Option[]; count: number }) {
    const router = useRouter();
    const [views, setViews] = useState<SavedView[]>([]);
    const [viewName, setViewName] = useState("");
    const [selectedView, setSelectedView] = useState("");
    const [validationError, setValidationError] = useState("");
    useEffect(() => {
        try {
            const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            if (Array.isArray(parsed)) setViews(parsed.filter(v => typeof v?.name === "string" && v.name.length <= 40 && v.filters && typeof v.filters === "object").slice(0, 20));
        } catch { setViews([]); }
    }, []);
    const persist = (next: SavedView[]) => { setViews(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); };
    const save = () => {
        const name = viewName.trim().slice(0, 40);
        if (!name) return;
        persist([...views.filter(v => v.name !== name), { name, filters: { ...filters, page: 1 } }].slice(-20));
        setSelectedView(name);
        setViewName("");
    };
    const remove = () => { if (selectedView) { persist(views.filter(v => v.name !== selectedView)); setSelectedView(""); } };
    const navigate = (next: RepairListFilters) => router.push(repairListUrl(next));
    const chips = FILTER_KEYS.flatMap(key => filters[key]
        ? (["customer", "brand", "status"].includes(key) ? filters[key].split(",") : [filters[key]]).map(value => ({ key, value }))
        : []);
    const chipLabel = (key: string, value: string) => {
        if (key === "customer") return customers.find(v => String(v.id) === value)?.name ?? value;
        if (key === "brand") return brands.find(v => String(v.id) === value)?.name ?? value;
        if (key === "type") return value === "business" ? "B2B" : "B2C";
        if (key === "delivery") return value === "delivered" ? "納品済み" : "未納品";
        if (key === "partEntries") return partEntryLabels[value] ?? value;
        if (key === "orderRequest") return orderRequestLabels[value] ?? value;
        return value;
    };
    const multi = (key: "customer" | "brand" | "status", title: string, options: { value: string; label: string }[]) => (
        <fieldset className="min-w-0 rounded border p-2">
            <legend className="px-1 text-sm font-medium">{title}</legend>
            <div className="max-h-36 overflow-y-auto space-y-1">
                {options.map(option => <label key={option.value} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={key} value={option.value} defaultChecked={filters[key].split(",").includes(option.value)} />
                    <span className="truncate" title={option.label}>{option.label}</span>
                </label>)}
            </div>
        </fieldset>
    );
    const day = (key: keyof RepairListFilters, title: string) => <label className="min-w-0 text-sm">{title}<input type="date" name={key} defaultValue={String(filters[key])} className="mt-1 block h-9 w-full rounded border px-2" /></label>;
    return <div className="min-w-0 rounded-md border bg-white p-3 shadow-sm space-y-3">
        <form key={repairListUrl(filters, filters.page)} onSubmit={event => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const raw: Record<string, string> = {};
            for (const key of FILTER_KEYS) raw[key] = ["customer", "brand", "status"].includes(key) ? data.getAll(key).map(String).join(",") : String(data.get(key) ?? "");
            for (const prefix of ["reception", "approval", "pending", "delivered"]) {
                if (raw[`${prefix}From`] && raw[`${prefix}To`] && raw[`${prefix}From`] > raw[`${prefix}To`]) {
                    setValidationError("日付の終了日は開始日以降にしてください。"); return;
                }
            }
            if (raw.amountMin && raw.amountMax && Number(raw.amountMin) > Number(raw.amountMax)) {
                setValidationError("見積額の上限は下限以上にしてください。"); return;
            }
            setValidationError("");
            navigate(normalizeRepairListParams(raw));
        }} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="repair-list-q">修理案件を検索</label>
                <input id="repair-list-q" name="q" defaultValue={filters.q} maxLength={100} placeholder="管理番号・顧客・時計・Ref・Calなど" className="h-10 min-w-0 flex-1 rounded border px-3 text-sm sm:max-w-md" />
                <button type="submit" className="h-10 rounded border px-4 text-sm">検索・適用</button>
            </div>
            <details className="min-w-0" open={chips.length > (filters.q ? 1 : 0)}>
                <summary className="cursor-pointer text-sm font-medium">詳細条件</summary>
                <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-sm">顧客区分<select name="type" defaultValue={filters.type} className="mt-1 block h-9 w-full rounded border px-2"><option value="">すべて</option><option value="business">B2B</option><option value="individual">B2C</option></select></label>
                    <label className="text-sm">納品状態<select name="delivery" defaultValue={filters.delivery} className="mt-1 block h-9 w-full rounded border px-2"><option value="">すべて</option><option value="undelivered">未納品（現在の状態が「納品済み」以外）</option><option value="delivered">納品済み（現在の状態）</option></select></label>
                    <label className="min-w-0 text-sm">記録済み部品行<select name="partEntries" defaultValue={filters.partEntries} className="mt-1 block h-9 w-full min-w-0 rounded border px-2"><option value="">すべて</option><option value="with">あり</option><option value="without">なし</option></select></label>
                    <label className="min-w-0 text-sm">発注依頼<select name="orderRequest" defaultValue={filters.orderRequest} className="mt-1 block h-9 w-full min-w-0 rounded border px-2"><option value="">すべて</option>{Object.entries(orderRequestLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    {multi("customer", "顧客（複数選択可）", customers.map(v => ({ value: String(v.id), label: v.name })))}
                    {multi("brand", "ブランド（複数選択可）", brands.map(v => ({ value: String(v.id), label: v.name })))}
                    {multi("status", "ステータス（複数選択可）", REPAIR_STATUSES.map(v => ({ value: v, label: v })))}
                    {day("receptionFrom", "受付日 開始")}{day("receptionTo", "受付日 終了")}
                    {day("approvalFrom", "承認日 開始")}{day("approvalTo", "承認日 終了")}
                    {day("pendingFrom", "承認待ち履歴日 開始")}{day("pendingTo", "承認待ち履歴日 終了")}
                    {day("deliveredFrom", "実納品日 開始")}{day("deliveredTo", "実納品日 終了")}
                    <label className="text-sm">見積額 下限<input name="amountMin" type="number" min="0" max="999999999" defaultValue={filters.amountMin} className="mt-1 block h-9 w-full rounded border px-2" /></label>
                    <label className="text-sm">見積額 上限<input name="amountMax" type="number" min="0" max="999999999" defaultValue={filters.amountMax} className="mt-1 block h-9 w-full rounded border px-2" /></label>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">異なる条件はすべて一致、同じ項目の複数選択はいずれか一致。日付は東京時間の開始日・終了日を含みます。</p>
                <p className="text-xs text-muted-foreground">部品行は修理明細または見積明細の記録で判定します。発注依頼は案件に紐づく依頼の状態で判定し、「依頼記録なし」は未発注を意味しません（在庫使用・旧データなど）。見積明細の発注状態とは照合していません。</p>
            </details>
            {validationError && <p role="alert" className="text-sm text-red-700">{validationError}</p>}
        </form>
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite"><span>{count}件</span>
            {chips.map(({ key, value }) => <button key={`${key}:${value}`} type="button" className="max-w-full rounded-full border bg-slate-50 px-2 py-1 text-left break-all" aria-label={`${labels[key]} ${chipLabel(key, value)}を解除`} onClick={() => navigate({ ...filters, [key]: ["customer", "brand", "status"].includes(key) ? filters[key].split(",").filter(v => v !== value).join(",") : "", page: 1 })}>{labels[key]}: {chipLabel(key, value)} ×</button>)}
            {chips.length > 0 && <button type="button" className="underline" onClick={() => router.push("/repairs")}>すべて解除</button>}
        </div>
        <div className="flex flex-wrap items-end gap-2 text-sm">
            <label>保存した検索<select value={selectedView} onChange={event => { const name = event.target.value; setSelectedView(name); const view = views.find(v => v.name === name); if (view) navigate(normalizeRepairListParams({ ...view.filters, page: "1" })); }} className="ml-2 h-9 max-w-52 rounded border px-2"><option value="">選択</option>{views.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}</select></label>
            <button type="button" disabled={!selectedView} onClick={remove} className="h-9 rounded border px-2 disabled:opacity-40">削除</button>
            <label>現在の条件を保存<input value={viewName} maxLength={40} onChange={event => setViewName(event.target.value)} placeholder="検索名" className="ml-2 h-9 max-w-48 rounded border px-2" /></label>
            <button type="button" disabled={!viewName.trim()} onClick={save} className="h-9 rounded border px-2 disabled:opacity-40">保存</button>
        </div>
    </div>;
}
