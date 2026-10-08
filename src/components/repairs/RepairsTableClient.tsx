"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Repair, Customer, Brand, Model, Watch } from "@prisma/client";
import { RepairListStatusSelect } from "@/components/repairs/RepairListStatusSelect";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { ClickToCopy } from "@/components/ui/click-to-copy";
import { generateBulkDocument, previewBulkInvoiceAllocations } from "@/actions/document-actions";
import { cn } from "@/lib/utils";
import { useAutoRefreshOnReturn } from "@/hooks/use-auto-refresh-on-return";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type RepairWithRelations = Repair & {
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

export function RepairsTableClient({ repairs }: RepairsTableClientProps) {
    const [invoicePreview, setInvoicePreview] = useState<Awaited<ReturnType<typeof previewBulkInvoiceAllocations>> | null>(null);
    const [requestedAllocations, setRequestedAllocations] = useState<Record<number, Record<number, number>>>({});
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [readRepairIds, setReadRepairIds] = useState<number[]>([]);
    const [activeMessage, setActiveMessage] = useState<{
        repairId: number;
        inquiryNumber: string;
        body: string;
        createdAt: Date;
    } | null>(null);
    const router = useRouter();
    const { toast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    useAutoRefreshOnReturn();

    const toggleSelectAll = (checked: boolean | "indeterminate") => {
        setSelectedIds(checked === true ? repairs.map((r) => r.id) : []);
    };

    const setRepairSelected = (id: number, checked: boolean | "indeterminate") => {
        setSelectedIds((prev) => {
            if (checked === true) {
                return prev.includes(id) ? prev : [...prev, id];
            }
            return prev.filter((selectedId) => selectedId !== id);
        });
    };

    const toggleRepairSelected = (id: number) => {
        setSelectedIds((prev) =>
            prev.includes(id)
                ? prev.filter((selectedId) => selectedId !== id)
                : [...prev, id]
        );
    };

    const handleBulkAction = async (type: "delivery" | "estimate" | "invoice", allocations?: Record<number, { paymentId: number; allocatedAmount: number }[]>) => {
        if (selectedIds.length === 0) return;
        setIsGenerating(true);
        try {
            const result = await generateBulkDocument(selectedIds, type, allocations);
            if (result.success) {
                setInvoicePreview(null);
                toast({
                    title: "作成完了",
                    description: `${result.count}件のドキュメントを作成しました。`,
                });
                if (result.count === 1 && result.documentId) {
                    if (type === "delivery") router.push(`/documents/delivery/${result.documentId}`);
                    if (type === "estimate") router.push(`/documents/estimate/${result.documentId}`);
                    if (type === "invoice") router.push(`/documents/invoice/${result.documentId}`);
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
        await handleBulkAction("invoice", allocations);
    };

    const handleMarkRead = async () => {
        if (!activeMessage) return;

        const res = await fetch(`/api/repairs/${activeMessage.repairId}/messages/read`, { method: "POST" });
        if (!res.ok) {
            toast({
                title: "エラー",
                description: "既読にできませんでした",
                variant: "destructive",
            });
            return;
        }

        setReadRepairIds((prev) => [...prev, activeMessage.repairId]);
        setActiveMessage(null);
        router.refresh();
    };

    return (
        <div className="space-y-4">
            {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-md animate-in fade-in slide-in-from-top-2">
                    <span className="font-bold text-blue-700">{selectedIds.length}件選択中</span>
                    <div className="h-4 w-px bg-blue-300 mx-2" />
                    <Button size="sm" variant="outline" onClick={() => handleBulkAction("estimate")} disabled={isGenerating}>
                        <FileText className="mr-2 h-4 w-4" />
                        見積書作成
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleBulkAction("delivery")} disabled={isGenerating}>
                        <Truck className="mr-2 h-4 w-4" />
                        納品書作成
                    </Button>
                    <Button size="sm" variant="outline" onClick={openInvoicePreview} disabled={isGenerating}>
                        <FileText className="mr-2 h-4 w-4" />
                        請求書作成
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
                                    onCheckedChange={toggleSelectAll}
                                    className="cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </th>
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
                                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
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
                                            onCheckedChange={(checked) => setRepairSelected(repair.id, checked)}
                                            className="cursor-pointer"
                                            onClick={(e) => e.stopPropagation()}
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
                                            const isRead = readRepairIds.includes(repair.id);
                                            if (!latestMessage || isRead) {
                                                return <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-200" aria-label="未読コメントなし" />;
                                            }

                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setActiveMessage({
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
            <Dialog open={invoicePreview !== null} onOpenChange={(open) => !open && !isGenerating && setInvoicePreview(null)}>
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                    <DialogHeader><DialogTitle>請求書と前受金の充当を確認</DialogTitle></DialogHeader>
                    <div className="space-y-5 text-sm">
                        {invoicePreview?.map(group => {
                            const applied = group.payments.reduce((sum, payment) => sum + (requestedAllocations[group.customerId]?.[payment.id] ?? 0), 0);
                            return <section key={group.customerId} className="space-y-2 rounded border p-3">
                                <h3 className="font-semibold">{group.customerName}（{group.isB2C ? "一般" : "業者"}）</h3>
                                <p>修理: {group.repairs.map(repair => repair.inquiryNumber).join("、")}</p>
                                <p>修理総額（税込）: ¥{group.gross.toLocaleString()}</p>
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
                        <Button onClick={confirmInvoice} disabled={isGenerating || invoicePreview?.some(group => {
                            const amounts = group.payments.map(payment => requestedAllocations[group.customerId]?.[payment.id] ?? 0);
                            return amounts.some((amount, index) => !Number.isSafeInteger(amount) || amount < 0 || amount > group.payments[index].availableAmount)
                                || amounts.reduce((sum, amount) => sum + amount, 0) > group.gross;
                        })}>この内容で請求書を作成</Button></DialogFooter>
                </DialogContent>
            </Dialog>
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
                            <Link href={`/repairs/${activeMessage.repairId}`}>
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
