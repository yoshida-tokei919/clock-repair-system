import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepairTimeline } from "@/components/repair-timeline";
import { PhotoGallery } from "@/components/photo-gallery";
import { ArrowLeft, Printer, FileText, Edit, Clock, Calendar, ShieldCheck, MapPin, Package, Settings, ChevronRight } from "lucide-react";

import { StatusUpdateForm } from "@/components/repairs/StatusUpdateForm";
import { getStatusBadge } from "@/components/status-badge";
import { TagPrintButton } from "@/components/repairs/TagPrintButton";
import { PartOrderStatusSelect } from "@/components/repairs/PartOrderStatusSelect";
import { ClickToCopy } from "@/components/ui/click-to-copy";
import { LineButton } from "@/components/line/LineButton";

export const dynamic = "force-dynamic";
import { PublishCaseButton } from "@/components/repairs/PublishCaseButton";

export default async function RepairDetailPage({ params }: { params: { id: string } }) {
    const repair = await prisma.repair.findUnique({
        where: { id: parseInt(params.id) },
        include: {
            customer: {
                select: { name: true, type: true, rank: true, phone: true, lineId: true, address: true }
            },
            watch: {
                include: {
                    brand:     { select: { name: true, nameEn: true, nameJp: true } },
                    model:     { select: { name: true, nameJp: true } },
                    caliber:   { select: { name: true } },
                    reference: { select: { name: true } }
                }
            },
            logs: {
                orderBy: { changedAt: 'desc' },
                select: { id: true, status: true, changedAt: true }
            },
            estimate: {
                include: {
                    items: {
                        select: { id: true, itemName: true, unitPrice: true, type: true, orderStatus: true }
                    }
                }
            },
            photos: { select: { storageKey: true } }
        }
    });

    if (!repair) {
        notFound();
    }

    // Adapt DB data to UI format
    const mockRepair = {
        id: String(repair.id),
        inquiryNumber: repair.inquiryNumber,
        partnerRef: repair.partnerRef || "-",
        endUserName: repair.endUserName || null,
        status: repair.status,
        receptionDate: repair.receptionDate ? repair.receptionDate.toLocaleDateString("ja-JP") : "-",
        customer: {
            name: repair.customer?.name || "名前不明",
            type: repair.customer ? (repair.customer.rank > 3 ? "重要客" : (repair.customer.type === 'business' ? "業者" : "一般客")) : "-",
            phone: repair.customer?.phone || repair.customer?.lineId || "-",
            address: repair.customer?.address || "-",
        },
        watch: {
            brand: repair.watch?.brand?.nameJp || repair.watch?.brand?.nameEn || repair.watch?.brand?.name || "不明",
            model: repair.watch?.model?.nameJp || repair.watch?.model?.name || "不明",
            ref: repair.watch?.reference?.name || "-",
            serial: repair.watch?.serialNumber || "-",
            caliber: repair.watch?.caliber?.name || "-",
        },
        timeline: repair.logs.map(log => {
            const statusLabels: Record<string, string> = {
                // 内部識別子
                'reception': '受付',
                'diagnosing': '見積中',
                'parts_wait': '部品待 (未注文)',
                'parts_wait_ordered': '部品待 (注文済)',
                'in_progress': '作業中',
                'completed': '完了',
                'delivered': '納品済',
                'canceled': 'キャンセル',
                // 旧ラベル（英語混じり）の吸収
                '受付 (Reception)': '受付',
                '見積中 (Estimating)': '見積中',
                '部品待 (Waiting Parts)': '部品待 (未注文)',
                '作業中 (In Progress)': '作業中',
                '完了 (Completed)': '完了',
                '納品済 (Delivered)': '納品済',
                'キャンセル (Canceled)': 'キャンセル',
            };
            return {
                id: log.id,
                status: statusLabels[log.status] || log.status,
                date: log.changedAt ? log.changedAt.toLocaleString("ja-JP", { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-",
                isCompleted: true
            };
        }),
        photos: repair.photos?.map(p => p.storageKey) || [],
        estimateItems: repair.estimate?.items || []
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 pb-20">
            {/* Header / Nav */}
            <div className="bg-white border-b sticky top-0 z-30 px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <Link href="/repairs">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" /> 修理一覧
                        </Button>
                    </Link>
                    <div className="h-6 w-px bg-slate-200 mx-2 hidden md:block"></div>
                    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                        <ClickToCopy text={mockRepair.inquiryNumber}>
                            <div className="font-mono text-xs text-slate-500 cursor-copy hover:bg-zinc-100 px-1 rounded transition-colors">
                                {mockRepair.inquiryNumber}
                            </div>
                        </ClickToCopy>
                        <h1 className="text-lg font-bold text-slate-900">
                            {mockRepair.watch.brand} {mockRepair.watch.model} {mockRepair.watch.ref}
                        </h1>
                        <div className="flex items-center gap-2">
                            {getStatusBadge(mockRepair.status)}
                            <StatusUpdateForm repairId={parseInt(mockRepair.id)} currentStatus={mockRepair.status} />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <PublishCaseButton
                        repairId={parseInt(mockRepair.id)}
                        initialB2C={repair.isPublicB2C}
                        initialB2B={repair.isPublicB2B}
                    />
                    <LineButton
                        repairId={mockRepair.inquiryNumber}
                        customerName={mockRepair.customer.name}
                        status={mockRepair.status}
                    />
                    <TagPrintButton
                        repair={{
                            id: mockRepair.id,
                            inquiryNumber: mockRepair.inquiryNumber,
                            watch: {
                                brand: mockRepair.watch.brand,
                                model: mockRepair.watch.model,
                                ref: mockRepair.watch.ref,
                            },
                            customer: {
                                name: mockRepair.customer.name
                            }
                        }}
                    />
                    <div className="h-6 w-px bg-slate-200 mx-1"></div>
                    <Link href={`/repairs/${params.id}/edit`}>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 shadow-sm">
                            <Edit className="w-4 h-4 mr-2" /> 編集
                        </Button>
                    </Link>
                </div>
            </div>

            <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                {/* Left Column: Basic Info (Sticky on Large Screens) */}
                <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
                    {/* Status Update Card (Moved to top of sidebar for quick access) */}
                    <Card className="border-blue-100 bg-blue-50/30">
                        <CardHeader className="pb-3 text-blue-900">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Settings className="w-4 h-4" /> ステータス更新
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <StatusUpdateForm repairId={parseInt(mockRepair.id)} currentStatus={mockRepair.status} />
                        </CardContent>
                    </Card>

                    {/* Customer Card */}
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center">
                                <ShieldCheck className="w-4 h-4 mr-2 text-blue-600" />
                                顧客情報
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-3">
                            <div>
                                <div className="text-slate-500 text-xs text-zinc-400">お名前</div>
                                <div className="font-bold text-slate-900 text-lg flex flex-wrap items-center gap-2 text-zinc-800">
                                    {mockRepair.customer.name} 様
                                    {mockRepair.endUserName && (
                                        <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                            (エンドユーザー: {mockRepair.endUserName} 様)
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div>
                                    <div className="text-slate-500 text-xs text-zinc-400">客層</div>
                                    <Badge variant="secondary" className="mt-1">{mockRepair.customer.type}</Badge>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs text-zinc-400">連絡先</div>
                                    <div className="mt-1 font-mono text-zinc-700">{mockRepair.customer.phone}</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-slate-500 text-xs text-zinc-400">住所</div>
                                <div className="mt-1 flex items-start gap-1 text-zinc-600">
                                    <MapPin className="w-3 h-3 mt-1 text-slate-400" />
                                    {mockRepair.customer.address}
                                </div>
                            </div>
                            {/* Partner Ref */}
                            {mockRepair.partnerRef && mockRepair.partnerRef !== "-" && (
                                <div className="pt-2 border-t mt-2">
                                    <div className="text-slate-500 text-xs text-blue-600 font-bold">貴社管理番号</div>
                                    <ClickToCopy text={mockRepair.partnerRef}>
                                        <div className="font-mono font-bold text-blue-700 cursor-copy hover:bg-blue-50 px-1 rounded transition-colors inline-block">{mockRepair.partnerRef}</div>
                                    </ClickToCopy>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Watch Card */}
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center">
                                <Clock className="w-4 h-4 mr-2 text-slate-600" />
                                時計詳細
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-slate-500 text-xs text-zinc-400">ブランド</div>
                                    <div className="font-bold text-zinc-800">{mockRepair.watch.brand}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs text-zinc-400">モデル名</div>
                                    <div className="font-medium text-zinc-800">{mockRepair.watch.model}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs text-zinc-400">型番 (Ref)</div>
                                    <div className="font-mono font-medium text-zinc-700">{mockRepair.watch.ref}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs text-zinc-400">シリアル</div>
                                    <div className="font-mono font-medium text-zinc-700">{mockRepair.watch.serial}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs text-zinc-400">キャリバー</div>
                                    <div className="font-mono font-medium text-zinc-700">{mockRepair.watch.caliber}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs text-zinc-400">受付日</div>
                                    <div className="font-medium flex items-center gap-1 text-zinc-800">
                                        <Calendar className="w-3 h-3 text-slate-400" />
                                        {mockRepair.receptionDate}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Quick Documents - Consolidated List */}
                    <Card className="shadow-sm overflow-hidden">
                        <CardHeader className="pb-3 bg-zinc-50 border-b">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <FileText className="w-4 h-4" /> 帳票・書類一覧
                            </CardTitle>
                        </CardHeader>
                        <div className="divide-y text-sm">
                            <Link href={`/repairs/${params.id}/estimate/pdf`} className="flex items-center justify-between p-3 hover:bg-zinc-50 transition-colors group">
                                <div className="flex items-center gap-3">
                                    <FileText className="w-4 h-4 text-zinc-400 group-hover:text-blue-600" />
                                    <span>修理見積書.pdf</span>
                                </div>
                                <ArrowLeft className="w-3 h-3 rotate-180 text-zinc-300" />
                            </Link>
                            <Link href={`/repairs/${params.id}/invoice/pdf`} className="flex items-center justify-between p-3 hover:bg-zinc-50 transition-colors group">
                                <div className="flex items-center gap-3">
                                    <FileText className="w-4 h-4 text-zinc-400 group-hover:text-blue-600" />
                                    <span>修理請求書.pdf</span>
                                </div>
                                <ArrowLeft className="w-3 h-3 rotate-180 text-zinc-300" />
                            </Link>
                            <Link href={`/repairs/${params.id}/delivery/pdf`} className="flex items-center justify-between p-3 hover:bg-zinc-50 transition-colors group">
                                <div className="flex items-center gap-3">
                                    <Package className="w-4 h-4 text-zinc-400 group-hover:text-blue-600" />
                                    <span>修理納品書.pdf</span>
                                </div>
                                <ArrowLeft className="w-3 h-3 rotate-180 text-zinc-300" />
                            </Link>
                            <Link href={`/repairs/${params.id}/warranty/pdf`} className="flex items-center justify-between p-3 hover:bg-zinc-50 transition-colors group">
                                <div className="flex items-center gap-3">
                                    <ShieldCheck className="w-4 h-4 text-zinc-400 group-hover:text-blue-600" />
                                    <span>修理保証書.pdf</span>
                                </div>
                                <ArrowLeft className="w-3 h-3 rotate-180 text-zinc-300" />
                            </Link>
                        </div>
                    </Card>
                </div>

                {/* Right Column: All Content Segments */}
                <div className="lg:col-span-8 space-y-12">

                    {/* Section 1: Timeline */}
                    <div id="timeline">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="h-6 w-1 bg-blue-600 rounded-full"></div>
                            <h2 className="text-xl font-bold text-zinc-800">進行状況</h2>
                        </div>
                        <Card className="shadow-sm border-0">
                            <CardContent className="pt-6">
                                <RepairTimeline events={mockRepair.timeline} />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Section 2: Photos */}
                    <div id="photos">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="h-6 w-1 bg-orange-500 rounded-full"></div>
                            <h2 className="text-xl font-bold text-zinc-800">写真ギャラリー ({mockRepair.photos.length})</h2>
                        </div>
                        <Card className="shadow-sm border-0">
                            <CardContent className="pt-6">
                                <PhotoGallery photos={mockRepair.photos} repairId={mockRepair.id} />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Section 3: Parts & Labor */}
                    <div id="parts">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="h-6 w-1 bg-green-600 rounded-full"></div>
                                <h2 className="text-xl font-bold text-zinc-800">使用部品・工賃 ({mockRepair.estimateItems.length})</h2>
                            </div>
                        </div>
                        <Card className="shadow-sm border-0 overflow-hidden">
                            <CardContent className="p-0">
                                {mockRepair.estimateItems.length === 0 ? (
                                    <p className="text-slate-500 text-center py-12 bg-zinc-50/50">部品リストはまだ登録されていません。</p>
                                ) : (
                                    <div className="space-y-0">
                                        <div className="grid grid-cols-12 text-[10px] font-bold text-zinc-400 px-6 py-3 bg-zinc-50 border-b uppercase tracking-wider">
                                            <div className="col-span-8">項目名 / 区分</div>
                                            <div className="col-span-4 text-right">価格</div>
                                        </div>
                                        <div className="divide-y">
                                            {mockRepair.estimateItems.map((item: any, idx: number) => (
                                                <div key={idx} className="grid grid-cols-12 py-4 px-6 hover:bg-zinc-50 transition-colors items-center">
                                                    <div className="col-span-8 flex flex-col gap-1">
                                                        <span className="font-bold text-zinc-800">{item.itemName}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-zinc-400 font-mono uppercase italic leading-tight">{item.type === 'labor' ? '技術料' : '交換部品'}</span>
                                                            {item.type === 'part' && (
                                                                <PartOrderStatusSelect itemId={item.id} currentStatus={item.orderStatus} />
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-4 text-right font-mono font-bold text-zinc-900">
                                                        ¥{item.unitPrice.toLocaleString()}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex justify-between items-center p-6 bg-zinc-900 text-white font-bold text-xl">
                                            <span className="text-zinc-400 text-sm font-normal">合計金額 (税別)</span>
                                            <span className="font-mono">
                                                ¥{mockRepair.estimateItems.reduce((sum: number, i: any) => sum + i.unitPrice, 0).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>

            </main>
        </div>
    );
}
