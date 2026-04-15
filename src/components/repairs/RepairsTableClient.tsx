"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Repair, Customer, Brand, Model, Watch } from "@prisma/client";
import { RepairListStatusSelect } from "@/components/repairs/RepairListStatusSelect";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Truck, Receipt, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { ClickToCopy } from "@/components/ui/click-to-copy";
import { generateBulkDocument } from "@/actions/document-actions";
import { cn } from "@/lib/utils";

type RepairWithRelations = Repair & {
    customer: Customer;
    watch: Watch & {
        brand: Brand;
        model: Model;
    };
};

interface RepairsTableClientProps {
    repairs: RepairWithRelations[];
}

export function RepairsTableClient({ repairs }: RepairsTableClientProps) {
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const router = useRouter();
    const { toast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);

    const toggleSelectAll = () => {
        if (selectedIds.length === repairs.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(repairs.map(r => r.id));
        }
    };

    const toggleSelect = (id: number) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleBulkAction = async (type: 'delivery' | 'invoice' | 'estimate' | 'warranty') => {
        if (selectedIds.length === 0) return;
        setIsGenerating(true);
        try {
            const result = await generateBulkDocument(selectedIds, type);
            if (result.success) {
                toast({
                    title: "作成完了",
                    description: `${result.count}件のドキュメントを作成しました。`,
                });
                // Redirect to the first created document, or a list? 
                // For now, if single doc created, go to it.
                if (result.documentId) {
                    if (type === 'delivery') router.push(`/documents/delivery/${result.documentId}`);
                    if (type === 'invoice') router.push(`/documents/invoice/${result.documentId}`);
                    if (type === 'estimate') router.push(`/documents/estimate/${result.documentId}`);
                    if (type === 'warranty') router.push(`/documents/warranty/${result.documentId}`);
                } else {
                    router.refresh(); // Refresh to show updated status/links
                }
            } else {
                toast({
                    title: "エラー",
                    description: result.error,
                    variant: "destructive"
                });
            }
        } catch (e) {
            console.error(e);
            toast({ title: "エラー", description: "予期せぬエラーが発生しました", variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Bulk Actions Toolbar */}
            {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-md animate-in fade-in slide-in-from-top-2">
                    <span className="font-bold text-blue-700">{selectedIds.length}件選択中</span>
                    <div className="h-4 w-px bg-blue-300 mx-2" />
                    <Button size="sm" variant="outline" onClick={() => handleBulkAction('estimate')} disabled={isGenerating}>
                        <FileText className="mr-2 h-4 w-4" />
                        見積書作成
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleBulkAction('delivery')} disabled={isGenerating}>
                        <Truck className="mr-2 h-4 w-4" />
                        納品書作成
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleBulkAction('invoice')} disabled={isGenerating}>
                        <Receipt className="mr-2 h-4 w-4" />
                        請求書作成
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleBulkAction('warranty')} disabled={isGenerating}>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        保証書作成
                    </Button>
                </div>
            )}

            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b text-slate-500 font-medium">
                        <tr>
                            <th className="px-4 py-3 w-[50px]">
                                <Checkbox
                                    checked={repairs.length > 0 && selectedIds.length === repairs.length}
                                    onCheckedChange={toggleSelectAll}
                                />
                            </th>
                            <th className="px-4 py-3">管理番号</th>
                            <th className="px-4 py-3">ステータス</th>
                            <th className="px-4 py-3">お客様名</th>
                            <th className="px-4 py-3">時計</th>
                            <th className="px-4 py-3">日付</th>
                            <th className="px-4 py-3 text-right">アクション</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {repairs.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                                    該当する修理案件は見つかりませんでした。
                                </td>
                            </tr>
                        ) : (
                            repairs.map(repair => (
                                <tr
                                    key={repair.id}
                                    className={cn(
                                        "transition-colors cursor-pointer",
                                        selectedIds.includes(repair.id) ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                                    )}
                                    onClick={() => router.push(`/repairs/${repair.id}`)}
                                >
                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                            checked={selectedIds.includes(repair.id)}
                                            onCheckedChange={() => toggleSelect(repair.id)}
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
                                        <div className="text-xs text-slate-400">{repair.customer.type === 'business' ? '業者' : '一般'}</div>
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
                                        <div className="text-xs text-slate-400">受: {repair.receptionDate.toLocaleDateString("ja-JP")}</div>
                                        {repair.approvalDate && (
                                            <div className="text-sm font-bold text-blue-600">承: {repair.approvalDate.toLocaleDateString("ja-JP")}</div>
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
        </div>
    );
}
