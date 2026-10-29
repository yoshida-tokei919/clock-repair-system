"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Repair, Customer, Brand, Model, Watch } from "@prisma/client";
import { RepairListStatusSelect } from "@/components/repairs/RepairListStatusSelect";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { repairCommentsUrl } from "@/lib/repair-comments";
import { useToast } from "@/components/ui/use-toast";
import { ClickToCopy } from "@/components/ui/click-to-copy";
import { generateBulkDocument, previewBulkInvoiceAllocations } from "@/actions/document-actions";
import { cn } from "@/lib/utils";
import { useAutoRefreshOnReturn } from "@/hooks/use-auto-refresh-on-return";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IssuedDateDialog } from "@/components/documents/IssuedDateDialog";
import { formatIssuedDate } from "@/lib/document-issued-date";
import { DeliveryIssueDialog } from "@/components/documents/DeliveryIssueDialog";
import type { DeliveryShippingInput } from "@/lib/delivery-shipping";
import type { CustomerDefaultShipping } from "@/lib/customer-default-shipping";
import type { RepairTagReleasePreview } from "@/lib/repair-tag-release";

type RepairWithRelations = Repair & {
    photo: string | null;
    customer: Customer;
    watch: Watch & {
        brand: Brand;
        model: Model;
    };
    customerMessages?: {
        id: number;
        body: string;
        createdAt: Date;
    }[];
};

interface RepairsTableClientProps {
    repairs: RepairWithRelations[];
}

const photoProxyPattern = /^\/api\/repair-photos\/([1-9]\d*)$/;

function RepairThumbnail({ photo, signedUrl, batchReady }: { photo: string | null; signedUrl?: string; batchReady: boolean }) {
    const [failedSignedUrl, setFailedSignedUrl] = useState<string | null>(null);
    if (!photo) return <div className="h-14 w-14 rounded border bg-slate-100" aria-label="写真なし" />;

    const isProxy = photoProxyPattern.test(photo);
    if (isProxy && !batchReady) return <div className="h-14 w-14 rounded border bg-slate-100" aria-label="写真を読み込み中" />;

    const useSignedUrl = isProxy && signedUrl && signedUrl !== failedSignedUrl;
    return <img
        src={useSignedUrl ? signedUrl : photo}
        alt="修理写真"
        loading="lazy"
        decoding="async"
        className="h-14 w-14 rounded border object-cover"
        onError={useSignedUrl ? () => setFailedSignedUrl(signedUrl) : undefined}
    />;
}

export function RepairsTableClient({ repairs }: RepairsTableClientProps) {
    const [photoBatch, setPhotoBatch] = useState<{ repairs: RepairWithRelations[]; urls: Record<string, string> } | null>(null);
    const photoIds = useMemo(() => [...new Set(repairs.flatMap((repair) => {
        const match = repair.photo?.match(photoProxyPattern);
        const id = match ? Number(match[1]) : NaN;
        return Number.isSafeInteger(id) ? [id] : [];
    }))], [repairs]);

    useEffect(() => {
        if (photoIds.length === 0) return;
        const controller = new AbortController();
        let active = true;
        void (async () => {
            try {
                const response = await fetch("/api/repair-photos/signed-urls", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: photoIds }),
                    cache: "no-store",
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error("Photo URL batch failed");
                const result: unknown = await response.json();
                if (!result || typeof result !== "object" || !("urls" in result) ||
                    !result.urls || typeof result.urls !== "object" || Array.isArray(result.urls)) {
                    throw new Error("Invalid photo URL batch");
                }
                const urls = result.urls as Record<string, unknown>;
                const validUrls = Object.fromEntries(photoIds.flatMap((id) =>
                    typeof urls[id] === "string" ? [[id, urls[id]]] : []));
                if (active) setPhotoBatch({ repairs, urls: validUrls });
            } catch {
                if (active) setPhotoBatch({ repairs, urls: {} });
            }
        })();
        return () => { active = false; controller.abort(); };
    }, [repairs, photoIds]);

    const [invoicePreview, setInvoicePreview] = useState<Awaited<ReturnType<typeof previewBulkInvoiceAllocations>> | null>(null);
    const [requestedAllocations, setRequestedAllocations] = useState<Record<number, Record<number, number>>>({});
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [tagPreview, setTagPreview] = useState<RepairTagReleasePreview | null>(null);
    const [tagBusy, setTagBusy] = useState(false);
    const tagLocked = useRef(false);
    const tagSubmitting = useRef(false);
    const tagSelectedIds = useRef<number[]>([]);
    const deliveryCustomerDefault = useMemo<CustomerDefaultShipping | null>(() => {
        const selectedCustomers = repairs.filter(repair => selectedIds.includes(repair.id)).map(repair => repair.customer);
        const customer = selectedCustomers.length > 0 && selectedCustomers.every(row => row.id === selectedCustomers[0].id)
            ? selectedCustomers[0] : null;
        return customer?.type === "business" ? {
            defaultShippingCarrierCode: customer.defaultShippingCarrierCode,
            defaultShippingServiceCode: customer.defaultShippingServiceCode,
            defaultShippingSize: customer.defaultShippingSize, defaultShippingFee: customer.defaultShippingFee,
        } : null;
    }, [repairs, selectedIds]);
    const [activeMessage, setActiveMessage] = useState<{
        id: number;
        repairId: number;
        inquiryNumber: string;
        body: string;
        createdAt: Date;
    } | null>(null);
    const router = useRouter();
    const { toast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    const [issueType, setIssueType] = useState<"delivery" | "estimate" | "warranty" | null>(null);
    const [invoiceIssueDate, setInvoiceIssueDate] = useState("");
    const [invoiceDateEdited, setInvoiceDateEdited] = useState(false);
    useAutoRefreshOnReturn();

    const toggleSelectAll = (checked: boolean | "indeterminate") => {
        if (tagLocked.current) return;
        setSelectedIds(checked === true ? repairs.map((r) => r.id) : []);
    };

    const setRepairSelected = (id: number, checked: boolean | "indeterminate") => {
        if (tagLocked.current) return;
        setSelectedIds((prev) => {
            if (checked === true) {
                return prev.includes(id) ? prev : [...prev, id];
            }
            return prev.filter((selectedId) => selectedId !== id);
        });
    };

    const toggleRepairSelected = (id: number) => {
        if (tagLocked.current) return;
        setSelectedIds((prev) =>
            prev.includes(id)
                ? prev.filter((selectedId) => selectedId !== id)
                : [...prev, id]
        );
    };

    const closeTagPreview = () => {
        if (tagBusy) return;
        setTagPreview(null);
        tagSelectedIds.current = [];
        tagLocked.current = false;
    };

    const tagRequest = async (method: "POST" | "PUT", body: unknown) => {
        const response = await fetch("/api/repairs/physical-tag-release", {
            method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "NFCタグ割当の解除に失敗しました。");
        return result;
    };

    const openTagPreview = async () => {
        if (tagLocked.current || selectedIds.length === 0) return;
        tagLocked.current = true;
        tagSelectedIds.current = [...selectedIds];
        setTagBusy(true);
        try {
            setTagPreview(await tagRequest("POST", { repairIds: tagSelectedIds.current }));
        } catch (error) {
            tagLocked.current = false;
            tagSelectedIds.current = [];
            toast({ title: "NFCタグの確認に失敗しました", description: error instanceof Error ? error.message : "再読み込みしてください", variant: "destructive" });
        } finally { setTagBusy(false); }
    };

    const confirmTagRelease = async () => {
        if (!tagPreview?.releasable || tagSubmitting.current) return;
        tagSubmitting.current = true;
        setTagBusy(true);
        try {
            const result = await tagRequest("PUT", { confirmed: true, repairIds: tagSelectedIds.current,
                snapshot: tagPreview.rows.map(row => ({ repairId: row.repairId, assignmentId: row.assignmentId, physicalTagId: row.physicalTagId })) });
            toast({ title: "NFCタグ割当を解除しました", description: `${result.releasedCount}件解除、未割当${result.skippedCount}件をスキップしました。` });
            setTagPreview(null);
            setSelectedIds([]);
            tagSelectedIds.current = [];
            tagLocked.current = false;
            router.refresh();
        } catch (error) {
            toast({ title: "NFCタグ割当の解除に失敗しました", description: error instanceof Error ? error.message : "再確認してください", variant: "destructive" });
            setTagPreview(null);
            tagSelectedIds.current = [];
            tagLocked.current = false;
        } finally { tagSubmitting.current = false; setTagBusy(false); }
    };

    const handleBulkAction = async (type: "delivery" | "estimate" | "invoice" | "warranty", issueDate?: string, allocations?: Record<number, { paymentId: number; allocatedAmount: number }[]>, shipping?: DeliveryShippingInput) => {
        if (selectedIds.length === 0) return;
        setIsGenerating(true);
        try {
            const result = await generateBulkDocument(selectedIds, type, allocations, issueDate, shipping);
            if (result.success) {
                setIssueType(null);
                setInvoicePreview(null);
                toast({
                    title: "作成完了",
                    description: `${result.count}件のドキュメントを作成しました。`,
                });
                if (result.count === 1 && result.documentId) {
                    if (type === "delivery") router.push(`/documents/delivery/${result.documentId}`);
                    if (type === "estimate") router.push(`/documents/estimate/${result.documentId}`);
                    if (type === "invoice") router.push(`/documents/invoice/${result.documentId}`);
                    if (type === "warranty") router.push(`/documents/warranty/${result.documentId}`);
                } else {
                    router.refresh();
                }
            } else {
                toast({
                    title: "エラー",
                    description: result.error,
                    variant: "destructive",
                });
            }
        } catch (e) {
            console.error(e);
            toast({
                title: "エラー",
                description: "予期せぬエラーが発生しました",
                variant: "destructive",
            });
        } finally {
            setIsGenerating(false);
        }
    };

    const openInvoicePreview = async () => {
        setIsGenerating(true);
        try {
            const preview = await previewBulkInvoiceAllocations(selectedIds);
            setInvoicePreview(preview);
            setInvoiceIssueDate(formatIssuedDate(new Date()));
            setInvoiceDateEdited(false);
            setRequestedAllocations(Object.fromEntries(preview.map(group => [group.customerId,
                Object.fromEntries(group.suggested.map(row => [row.paymentId, row.allocatedAmount]))])));
        } catch (error) {
            toast({ title: "請求書の確認に失敗しました", description: error instanceof Error ? error.message : "再読み込みしてください", variant: "destructive" });
        } finally { setIsGenerating(false); }
    };

    const confirmInvoice = async () => {
        if (!invoicePreview) return;
        const allocations = Object.fromEntries(invoicePreview.map(group => [group.customerId,
            group.payments.map(payment => ({ paymentId: payment.id, allocatedAmount: requestedAllocations[group.customerId]?.[payment.id] ?? 0 }))
                .filter(row => row.allocatedAmount > 0)]));
        await handleBulkAction("invoice", invoiceDateEdited ? invoiceIssueDate : undefined, allocations);
    };

    const handleMarkRead = async () => {
        if (!activeMessage) return;

        const res = await fetch(`/api/repairs/${activeMessage.repairId}/messages/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageIds: [activeMessage.id] }) });
        if (!res.ok) {
            toast({
                title: "エラー",
                description: "既読にできませんでした",
                variant: "destructive",
            });
            return;
        }

        setActiveMessage(null);
        router.refresh();
    };

    return (
        <div className="space-y-4">
            {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-md animate-in fade-in slide-in-from-top-2">
                    <span className="font-bold text-blue-700">{selectedIds.length}件選択中</span>
                    <div className="h-4 w-px bg-blue-300 mx-2" />
                    <Button size="sm" variant="outline" onClick={() => setIssueType("estimate")} disabled={isGenerating || tagLocked.current}>
                        <FileText className="mr-2 h-4 w-4" />
                        見積書作成
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIssueType("delivery")} disabled={isGenerating || tagLocked.current}>
                        <Truck className="mr-2 h-4 w-4" />
                        納品書作成
                    </Button>
                    <Button size="sm" variant="outline" onClick={openInvoicePreview} disabled={isGenerating || tagLocked.current}>
                        <FileText className="mr-2 h-4 w-4" />
                        請求書作成
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIssueType("warranty")} disabled={isGenerating || tagLocked.current}>
                        <FileText className="mr-2 h-4 w-4" />保証書作成
                    </Button>
                    <Button size="sm" variant="outline" onClick={openTagPreview} disabled={isGenerating || tagLocked.current}>
                        NFCタグ割当解除
                    </Button>
                </div>
            )}

            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b text-slate-500 font-medium">
                        <tr>
                            <th
                                className="px-4 py-3 w-[50px]"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelectAll(!(repairs.length > 0 && selectedIds.length === repairs.length));
                                }}
                            >
                                <Checkbox
                                    checked={repairs.length > 0 && selectedIds.length === repairs.length}
                                    disabled={tagLocked.current}
                                    onCheckedChange={toggleSelectAll}
                                    className="cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </th>
                            <th className="px-2 py-3">写真</th>
                            <th className="px-4 py-3">管理番号</th>
                            <th className="px-4 py-3">ステータス</th>
                            <th className="px-4 py-3">お客様名</th>
                            <th className="px-4 py-3">コメント</th>
                            <th className="px-4 py-3">時計</th>
                            <th className="px-4 py-3">日付</th>
                            <th className="px-4 py-3 text-right">アクション</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {repairs.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                                    該当する修理案件は見つかりませんでした。
                                </td>
                            </tr>
                        ) : (
                            repairs.map((repair) => (
                                <tr
                                    key={repair.id}
                                    className={cn(
                                        "transition-colors cursor-pointer",
                                        selectedIds.includes(repair.id) ? "bg-blue-50/50" : "hover:bg-slate-50"
                                    )}
                                    onClick={() => router.push(`/repairs/${repair.id}`)}
                                >
                                    <td
                                        className="px-4 py-3"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleRepairSelected(repair.id);
                                        }}
                                    >
                                        <Checkbox
                                            checked={selectedIds.includes(repair.id)}
                                            disabled={tagLocked.current}
                                            onCheckedChange={(checked) => setRepairSelected(repair.id, checked)}
                                            className="cursor-pointer"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </td>
                                    <td className="px-2 py-3">
                                        <RepairThumbnail
                                            photo={repair.photo}
                                            signedUrl={photoBatch?.repairs === repairs ? photoBatch.urls[repair.photo?.match(photoProxyPattern)?.[1] ?? ""] : undefined}
                                            batchReady={photoBatch?.repairs === repairs}
                                        />
                                    </td>
                                    <td className="px-4 py-3 font-mono font-bold text-slate-700">
                                        <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                                            <ClickToCopy text={repair.inquiryNumber}>
                                                <span>{repair.inquiryNumber}</span>
                                            </ClickToCopy>
                                            {repair.partnerRef && repair.partnerRef !== "-" && (
                                                <ClickToCopy text={repair.partnerRef}>
                                                    <div className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1 rounded border border-blue-100 w-fit italic cursor-copy">
                                                        {repair.partnerRef}
                                                    </div>
                                                </ClickToCopy>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        <RepairListStatusSelect id={repair.id} currentStatus={repair.status} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-900">{repair.customer.name}</div>
                                        {(repair as any).endUserName && (
                                            <div className="text-xs text-slate-500 font-bold">{(repair as any).endUserName} 様</div>
                                        )}
                                        <div className="text-xs text-slate-400">{repair.customer.type === "business" ? "業者" : "一般"}</div>
                                    </td>
                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        {(() => {
                                            const latestMessage = repair.customerMessages?.[0];
                                            if (!latestMessage) {
                                                return <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-200" aria-label="未読コメントなし" />;
                                            }

                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setActiveMessage({
                                                            id: latestMessage.id,
                                                            repairId: repair.id,
                                                            inquiryNumber: repair.inquiryNumber,
                                                            body: latestMessage.body,
                                                            createdAt: latestMessage.createdAt,
                                                        })
                                                    }
                                                    className="inline-flex h-3 w-3 rounded-full bg-blue-500 ring-4 ring-blue-100"
                                                    aria-label="未読コメントあり"
                                                />
                                            );
                                        })()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-bold text-slate-800">
                                            {repair.watch.brand?.name || "不明"}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {repair.watch.model?.name || "不明"} / {repair.watch.serialNumber || "-"}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        <div className="text-xs text-slate-400">受: {repair.receptionDate?.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) || "-"}</div>
                                        {repair.approvalDate && (
                                            <div className="text-sm font-bold text-blue-600">承: {repair.approvalDate.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</div>
                                        )}
                                        <div className="flex gap-1 mt-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                            {(repair as any).estimateDocument && (
                                                <Link href={`/documents/estimate/${(repair as any).estimateDocument.id}`} className="text-[10px] bg-green-100 text-green-700 px-1 rounded border border-green-200 hover:underline">
                                                    {(repair as any).estimateDocument.estimateNumber}
                                                </Link>
                                            )}
                                            {(repair as any).deliveryNote && (
                                                <Link href={`/documents/delivery/${(repair as any).deliveryNote.id}`} className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded border border-blue-200 hover:underline">
                                                    {(repair as any).deliveryNote.slipNumber}
                                                </Link>
                                            )}
                                            {(repair as any).invoice && (
                                                <Link href={`/documents/invoice/${(repair as any).invoice.id}`} className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded border border-purple-200 hover:underline">
                                                    {(repair as any).invoice.invoiceNumber}
                                                </Link>
                                            )}
                                            {(repair as any).warranty && (
                                                <Link href={`/documents/warranty/${(repair as any).warranty.id}`} className="text-[10px] bg-teal-100 text-teal-700 px-1 rounded border border-teal-200 hover:underline">
                                                    {(repair as any).warranty.warrantyNumber}
                                                </Link>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                        <Link href={`/repairs/${repair.id}`}>
                                            <Button size="sm" variant="outline">詳細</Button>
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <Dialog open={tagPreview !== null} onOpenChange={open => !open && closeTagPreview()}>
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                    <DialogHeader><DialogTitle>NFCタグ割当解除の確認</DialogTitle></DialogHeader>
                    <p className="text-sm">解除対象 {tagPreview?.eligibleCount ?? 0}件 / 未割当スキップ {tagPreview?.skippedCount ?? 0}件</p>
                    {tagPreview?.rows.some(row => row.status === "INVALID_ASSIGNMENT") &&
                        <p className="text-sm text-red-700">無効なタグ割当があります。解除できません。</p>}
                    <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
                        {tagPreview?.rows.map(row => <li key={row.repairId} className="rounded border p-2">
                            {row.inquiryNumber} / {row.shortCode ?? "タグなし"} / {row.status === "READY" ? "解除対象" : row.status === "NO_ACTIVE_ASSIGNMENT" ? "未割当・スキップ" : "確認が必要"}
                        </li>)}
                    </ul>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeTagPreview} disabled={tagBusy}>戻る</Button>
                        <Button onClick={confirmTagRelease} disabled={tagBusy || !tagPreview?.releasable}>確認して解除</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={invoicePreview !== null} onOpenChange={(open) => !open && !isGenerating && setInvoicePreview(null)}>
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                    <DialogHeader><DialogTitle>請求書と前受金の充当を確認</DialogTitle></DialogHeader>
                    <label className="text-sm">発行日（日本時間）<input type="date" className="ml-2 rounded border px-2 py-1" value={invoiceIssueDate} onChange={event => { setInvoiceIssueDate(event.target.value); setInvoiceDateEdited(true); }} /></label>
                    <div className="space-y-5 text-sm">
                        {invoicePreview?.map(group => {
                            const applied = group.payments.reduce((sum, payment) => sum + (requestedAllocations[group.customerId]?.[payment.id] ?? 0), 0);
                            return <section key={group.customerId} className="space-y-2 rounded border p-3">
                                <h3 className="font-semibold">{group.customerName}（{group.isB2C ? "一般" : "業者"}）</h3>
                                <p>修理: {group.repairs.map(repair => repair.inquiryNumber).join("、")}</p>
                                <p>請求総額（修理税込・送料込）: ¥{group.gross.toLocaleString()}</p>
                                {group.isB2C && <>
                                    <p>受領済み前受金: ¥{group.receivedPrepaymentAmount.toLocaleString()}</p>
                                    <p>利用可能前受金: ¥{group.availablePrepaymentAmount.toLocaleString()}</p>
                                    {group.payments.length === 0 && <p>利用可能な前受金はありません。</p>}
                                    {group.payments.map(payment => <label key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 p-2">
                                        <span>前受金 #{payment.id} / 修理 #{payment.repairId} / {payment.purpose} / 入金 ¥{payment.receivedAmount.toLocaleString()} / 利用可能 ¥{payment.availableAmount.toLocaleString()} / {payment.paidAt ? new Date(payment.paidAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "入金日未設定"}</span>
                                        <input type="number" min={0} max={Math.min(payment.availableAmount, group.gross)} step={1}
                                            className="w-28 rounded border p-1 text-right" aria-label={`前受金 ${payment.id} の充当額`}
                                            value={requestedAllocations[group.customerId]?.[payment.id] ?? 0}
                                            onChange={event => setRequestedAllocations(previous => ({ ...previous, [group.customerId]: {
                                                ...previous[group.customerId], [payment.id]: Number(event.target.value),
                                            } }))} />
                                    </label>)}
                                    <p>今回充当: ¥{applied.toLocaleString()}</p>
                                    <p>今回請求額: ¥{(group.gross - applied).toLocaleString()}</p>
                                    {(applied > group.gross || group.payments.some(payment => {
                                        const amount = requestedAllocations[group.customerId]?.[payment.id] ?? 0;
                                        return !Number.isSafeInteger(amount) || amount < 0 || amount > payment.availableAmount;
                                    })) && <p className="text-red-700">充当額を利用可能額と請求総額の範囲にしてください。</p>}
                                </>}
                            </section>;
                        })}
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setInvoicePreview(null)} disabled={isGenerating}>戻る</Button>
                        <Button onClick={confirmInvoice} disabled={isGenerating || !invoiceIssueDate || invoicePreview?.some(group => {
                            const amounts = group.payments.map(payment => requestedAllocations[group.customerId]?.[payment.id] ?? 0);
                            return amounts.some((amount, index) => !Number.isSafeInteger(amount) || amount < 0 || amount > group.payments[index].availableAmount)
                                || amounts.reduce((sum, amount) => sum + amount, 0) > group.gross;
                        })}>この内容で請求書を作成</Button></DialogFooter>
                </DialogContent>
            </Dialog>
            <IssuedDateDialog open={issueType === "estimate" || issueType === "warranty"} title={`${issueType === "estimate" ? "見積書" : "保証書"}の発行を確認`} busy={isGenerating}
                onClose={() => setIssueType(null)} onConfirm={date => { if (issueType) void handleBulkAction(issueType, date); }} />
            <DeliveryIssueDialog open={issueType === "delivery"} busy={isGenerating} customerType={deliveryCustomerDefault ? "business" : null} customerDefault={deliveryCustomerDefault} onClose={() => setIssueType(null)} onConfirm={(date, shipping) => void handleBulkAction("delivery", date, undefined, shipping)} />
            <Dialog open={!!activeMessage} onOpenChange={(open) => !open && setActiveMessage(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>お客様コメント</DialogTitle>
                    </DialogHeader>
                    {activeMessage && (
                        <div className="space-y-3">
                            <div className="text-xs text-slate-500">
                                {activeMessage.inquiryNumber} / {activeMessage.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                            </div>
                            <div className="whitespace-pre-wrap rounded border bg-slate-50 p-3 text-sm">
                                {activeMessage.body}
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        {activeMessage && (
                            <Link href={repairCommentsUrl(activeMessage.repairId, activeMessage.id)}>
                                <Button variant="outline">詳細を開く</Button>
                            </Link>
                        )}
                        <Button onClick={handleMarkRead}>既読にする</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
