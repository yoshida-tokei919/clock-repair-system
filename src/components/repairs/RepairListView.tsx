"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Repair, Customer } from "@prisma/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ClickToCopy } from "@/components/ui/click-to-copy";
import { RepairListStatusSelect } from "@/components/repairs/RepairListStatusSelect";
import { Settings2 } from "lucide-react";
import styles from "./RepairListView.module.css";

export type ListRepair = Repair & {
    photo: string | null;
    customer: Pick<Customer, "id" | "name" | "type" | "defaultShippingCarrierCode" | "defaultShippingServiceCode" | "defaultShippingSize" | "defaultShippingFee">;
    watch: {
        serialNumber: string | null;
        modelNameInput: string | null;
        brand: { name: string };
        model: { name: string } | null;
        reference: { name: string } | null;
        caseReference: { name: string } | null;
    };
    estimate: { totalAmount: number; items: { id: number; itemName: string; quantity: number; unitPrice: number; b2cDisplayNameSnapshot: string | null }[] } | null;
    repairLineItems: { id: number; itemNameSnapshot: string; estimateDisplayNameSnapshot: string | null; b2bDisplayNameSnapshot: string | null; b2cDisplayNameSnapshot: string | null; amount: number }[];
    logs: { changedAt: Date }[];
    deliveryNote: { id: number; slipNumber: string } | null;
    invoice: { id: number; invoiceNumber: string } | null;
    estimateDocument: { id: number; estimateNumber: string } | null;
    warranty: { id: number; warrantyNumber: string } | null;
    customerMessages?: { id: number; body: string; createdAt: Date }[];
};

type OptionalColumn = "photo" | "watch" | "work" | "customer" | "dates" | "documents" | "status";
type WatchField = "modelRef" | "caseRef" | "serial";
type Preferences = { columns: Record<OptionalColumn, boolean>; watchFields: Record<WatchField, boolean> };
const defaults: Preferences = {
    columns: { photo: true, watch: true, work: true, customer: true, dates: true, documents: true, status: true },
    watchFields: { modelRef: true, caseRef: true, serial: true },
};
const columnLabels: Record<OptionalColumn, string> = { photo: "写真", watch: "時計", work: "見積・修理", customer: "お客様", dates: "日付", documents: "帳票", status: "ステータス" };
const columnWidths: Record<OptionalColumn, string> = { photo: "112px", watch: "minmax(130px, 1.3fr)", work: "minmax(170px, 1.7fr)", customer: "minmax(100px, 1fr)", dates: "minmax(95px, .9fr)", documents: "minmax(70px, .75fr)", status: "minmax(90px, .9fr)" };
const columnOrder: OptionalColumn[] = ["photo", "watch", "work", "customer", "dates", "documents", "status"];
const date = (value: Date | string | null | undefined) => value ? new Date(value).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "-";
const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;
const proxyPattern = /^\/api\/repair-photos\/([1-9]\d*)$/;

function Thumbnail({ photo, signedUrl, batchReady }: { photo: string | null; signedUrl?: string; batchReady: boolean }) {
    const [failedSignedUrl, setFailedSignedUrl] = useState<string | null>(null);
    if (!photo || (proxyPattern.test(photo) && !batchReady)) return <div className={`${styles.photo} rounded border bg-slate-100`} aria-label={photo ? "写真を読み込み中" : "写真なし"} />;
    const useSignedUrl = proxyPattern.test(photo) && signedUrl && signedUrl !== failedSignedUrl;
    return <img src={useSignedUrl ? signedUrl : photo} alt="修理写真" loading="lazy" decoding="async" className={`${styles.photo} rounded border`} onError={useSignedUrl ? () => setFailedSignedUrl(signedUrl) : undefined} />;
}

function Lines({ repair }: { repair: ListRepair }) {
    const [expanded, setExpanded] = useState(false);
    const isBusiness = repair.customer.type === "business";
    const estimateLines = repair.estimate?.items.map(item => ({ id: `e${item.id}`, name: !isBusiness && item.b2cDisplayNameSnapshot || item.itemName, amount: item.quantity * item.unitPrice })) ?? [];
    const workLines = repair.repairLineItems.map(item => ({ id: `r${item.id}`, name: (isBusiness ? item.b2bDisplayNameSnapshot : item.b2cDisplayNameSnapshot) || item.estimateDisplayNameSnapshot || item.itemNameSnapshot, amount: item.amount }));
    const all = [...estimateLines.map(line => ({ ...line, kind: "見積" })), ...workLines.map(line => ({ ...line, kind: "修理" }))];
    const shown = expanded ? all : all.slice(0, 2);
    return <div className="space-y-1 text-xs">
        {shown.map(line => <div key={line.id} className="flex min-w-0 justify-between gap-2"><span className="min-w-0 break-words">{line.kind}: {line.name}</span><span className="shrink-0">{yen(line.amount)}</span></div>)}
        {all.length > 2 && <button type="button" className="text-blue-700 underline" onClick={event => { event.stopPropagation(); setExpanded(!expanded); }}>{expanded ? "閉じる" : `ほか${all.length - 2}件`}</button>}
        {repair.estimate && <div className="font-semibold">見積合計: {yen(repair.estimate.totalAmount)}</div>}
        {workLines.length > 0 && <div className="font-semibold">修理小計: {yen(workLines.reduce((sum, line) => sum + line.amount, 0))}</div>}
        {all.length === 0 && <span className="text-slate-500">-</span>}
    </div>;
}

export function RepairListView({ repairs, selectedIds, tagLocked, toggleSelectAll, setRepairSelected, toggleRepairSelected, openMessage }: {
    repairs: ListRepair[];
    selectedIds: number[];
    tagLocked: boolean;
    toggleSelectAll: (checked: boolean) => void;
    setRepairSelected: (id: number, checked: boolean | "indeterminate") => void;
    toggleRepairSelected: (id: number) => void;
    openMessage: (repair: ListRepair) => void;
}) {
    const router = useRouter();
    const [prefs, setPrefs] = useState<Preferences>(defaults);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [photoBatch, setPhotoBatch] = useState<{ repairs: ListRepair[]; urls: Record<string, string> } | null>(null);
    const photoIds = useMemo(() => [...new Set(repairs.flatMap(repair => {
        const id = Number(repair.photo?.match(proxyPattern)?.[1]);
        return Number.isSafeInteger(id) && id > 0 ? [id] : [];
    }))], [repairs]);

    useEffect(() => {
        try {
            const stored = JSON.parse(localStorage.getItem("repairs-list-columns-v1") ?? "null");
            if (stored && typeof stored === "object") setPrefs({ columns: { ...defaults.columns, ...stored.columns }, watchFields: { ...defaults.watchFields, ...stored.watchFields } });
        } catch { /* Invalid preferences use defaults. */ }
    }, []);
    const save = (next: Preferences) => {
        setPrefs(next);
        try { localStorage.setItem("repairs-list-columns-v1", JSON.stringify(next)); } catch { /* Keep the current session setting. */ }
    };
    useEffect(() => {
        if (!photoIds.length) return;
        const controller = new AbortController();
        let active = true;
        void (async () => {
            try {
                const response = await fetch("/api/repair-photos/signed-urls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: photoIds }), cache: "no-store", signal: controller.signal });
                if (!response.ok) throw new Error("Photo URL batch failed");
                const result: unknown = await response.json();
                if (!result || typeof result !== "object" || !("urls" in result) || !result.urls || typeof result.urls !== "object" || Array.isArray(result.urls)) throw new Error("Invalid photo URL batch");
                const urls = result.urls as Record<string, unknown>;
                if (active) setPhotoBatch({ repairs, urls: Object.fromEntries(photoIds.flatMap(id => typeof urls[id] === "string" ? [[id, urls[id]]] : [])) });
            } catch { if (active) setPhotoBatch({ repairs, urls: {} }); }
        })();
        return () => { active = false; controller.abort(); };
    }, [repairs, photoIds]);

    const visible = columnOrder.filter(column => prefs.columns[column]);
    const layout = { "--repair-columns": ["34px", "minmax(100px, .9fr)", ...visible.map(column => columnWidths[column])].join(" ") } as CSSProperties;
    const cell = (extra = "") => `${styles.cell} ${styles.wide} ${extra}`;
    return <div className="space-y-2">
        <div className="relative flex justify-end"><Button type="button" size="sm" variant="outline" onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen}><Settings2 className="mr-1 h-4 w-4" />表示項目</Button>
            {settingsOpen && <div className="absolute right-0 top-10 z-20 w-56 rounded border bg-white p-3 shadow-lg" onClick={event => event.stopPropagation()}>
                <p className="mb-2 text-xs text-slate-500">選択・管理番号は常に表示</p>
                {columnOrder.map(column => <label key={column} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={prefs.columns[column]} onChange={event => save({ ...prefs, columns: { ...prefs.columns, [column]: event.target.checked } })} />{columnLabels[column]}</label>)}
                <div className="mt-2 border-t pt-2 text-xs font-semibold">時計欄の内訳</div>
                {([ ["modelRef", "モデルRef"], ["caseRef", "ケースRef"], ["serial", "シリアル"] ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={prefs.watchFields[key]} onChange={event => save({ ...prefs, watchFields: { ...prefs.watchFields, [key]: event.target.checked } })} />{label}</label>)}
                <button type="button" className="mt-2 text-sm text-blue-700 underline" onClick={() => save(defaults)}>初期表示に戻す</button>
            </div>}
        </div>
        <div className={`${styles.list} overflow-hidden rounded-md border bg-white shadow-sm`} style={layout}>
            <div className={`${styles.header} border-b bg-slate-50 text-xs font-medium text-slate-600`} style={layout}>
                <div><Checkbox checked={repairs.length > 0 && selectedIds.length === repairs.length} disabled={tagLocked} onCheckedChange={checked => toggleSelectAll(checked === true)} aria-label="全件選択" /></div><div>管理番号</div>
                {visible.map(column => <div key={column}>{columnLabels[column]}</div>)}
            </div>
            {repairs.length === 0 && <div className="p-8 text-center text-slate-500">該当する修理案件は見つかりませんでした。</div>}
            {repairs.map(repair => <div key={repair.id} className={`${styles.row} cursor-pointer ${selectedIds.includes(repair.id) ? "bg-blue-50/50" : "hover:bg-slate-50"}`} style={layout} onClick={() => router.push(`/repairs/${repair.id}`)}>
                <div className={styles.cell} onClick={event => { event.stopPropagation(); toggleRepairSelected(repair.id); }}><Checkbox checked={selectedIds.includes(repair.id)} disabled={tagLocked} onCheckedChange={checked => setRepairSelected(repair.id, checked)} onClick={event => event.stopPropagation()} aria-label={`${repair.inquiryNumber}を選択`} /></div>
                <div className={`${styles.cell} font-mono font-semibold text-slate-800`} onClick={event => event.stopPropagation()}><ClickToCopy text={repair.inquiryNumber}><span className="cursor-copy">{repair.inquiryNumber}</span></ClickToCopy>{repair.partnerRef && repair.partnerRef !== "-" && <div className="mt-1 text-xs text-blue-700"><ClickToCopy text={repair.partnerRef}><span className="cursor-copy">{repair.partnerRef}</span></ClickToCopy></div>}{repair.customerMessages?.[0] && <button type="button" onClick={() => openMessage(repair)} className="mt-2 block rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800" aria-label={`${repair.inquiryNumber}の未読コメントを開く`}>未読</button>}</div>
                {prefs.columns.photo && <div className={styles.cell}><Link href={`/repairs/${repair.id}`} aria-label={`${repair.inquiryNumber}の詳細を開く`} onClick={event => event.stopPropagation()} className="inline-block"><Thumbnail photo={repair.photo} signedUrl={photoBatch?.repairs === repairs ? photoBatch.urls[repair.photo?.match(proxyPattern)?.[1] ?? ""] : undefined} batchReady={photoBatch?.repairs === repairs} /></Link></div>}
                {prefs.columns.watch && <div className={cell("space-y-0.5 text-sm font-medium text-slate-800")}><div>{repair.watch.brand?.name || "不明"}</div><div>{repair.watch.model?.name || repair.watch.modelNameInput || "不明"}</div>{prefs.watchFields.modelRef && <div>モデルRef: {repair.watch.reference?.name || "-"}</div>}{prefs.watchFields.caseRef && <div>ケースRef: {repair.watch.caseReference?.name || "-"}</div>}{prefs.watchFields.serial && <div>シリアル: {repair.watch.serialNumber || "-"}</div>}</div>}
                {prefs.columns.work && <div className={cell()} onClick={event => event.stopPropagation()}><Lines repair={repair} /></div>}
                {prefs.columns.customer && <div className={cell("text-sm")}><div className="font-medium">{repair.customer.name}</div>{repair.endUserName && <div>{repair.endUserName} 様</div>}<div className="text-xs text-slate-500">{repair.customer.type === "business" ? "業者" : "一般"}</div></div>}
                {prefs.columns.dates && <div className={cell("space-y-1 text-xs text-slate-700")}><div>受付: {date(repair.receptionDate)}</div><div>承認待ち: {date(repair.logs[0]?.changedAt)}</div><div>承認: {date(repair.approvalDate)}</div></div>}
                {prefs.columns.documents && <div className={cell("flex flex-wrap gap-1 text-xs")} onClick={event => event.stopPropagation()}>{repair.estimateDocument && <Link className="text-green-700 underline" href={`/documents/estimate/${repair.estimateDocument.id}`}>{repair.estimateDocument.estimateNumber}</Link>}{repair.deliveryNote && <Link className="text-blue-700 underline" href={`/documents/delivery/${repair.deliveryNote.id}`}>{repair.deliveryNote.slipNumber}</Link>}{repair.invoice && <Link className="text-purple-700 underline" href={`/documents/invoice/${repair.invoice.id}`}>{repair.invoice.invoiceNumber}</Link>}{repair.warranty && <Link className="text-teal-700 underline" href={`/documents/warranty/${repair.warranty.id}`}>{repair.warranty.warrantyNumber}</Link>}</div>}
                {prefs.columns.status && <div className={cell()} onClick={event => event.stopPropagation()}><RepairListStatusSelect id={repair.id} currentStatus={repair.status} /></div>}
            </div>)}
        </div>
    </div>;
}
