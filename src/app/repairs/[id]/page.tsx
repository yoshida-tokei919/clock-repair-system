import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepairTimeline } from "@/components/repair-timeline";
import { PhotoGallery } from "@/components/photo-gallery";
import { ArrowLeft, Printer, FileText, Edit, Clock, Calendar, ShieldCheck, MapPin, Package } from "lucide-react";

import { getStatusBadge } from "@/components/status-badge";
import { StatusUpdateForm } from "@/components/repairs/StatusUpdateForm";
import { TagPrintButton } from "@/components/repairs/TagPrintButton";
import { LineButton } from "@/components/line/LineButton";

export const dynamic = "force-dynamic";
import { PublishCaseButton } from "@/components/repairs/PublishCaseButton";

export default async function RepairDetailPage({ params }: { params: { id: string } }) {
    const repair = await prisma.repair.findUnique({
        where: { id: parseInt(params.id) },
        include: {
            customer: true,
            watch: {
                include: { brand: true, model: true, caliber: true, reference: true }
            },
            logs: { orderBy: { changedAt: 'asc' } },
            estimate: { include: { items: true } },
            photos: true
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
            name: repair.customer?.name || "Unknown",
            type: repair.customer ? (repair.customer.rank > 3 ? "VIP" : (repair.customer.type === 'business' ? "Owner/B2B" : "General")) : "-",
            phone: repair.customer?.phone || repair.customer?.lineId || "-",
            address: repair.customer?.address || "-",
        },
        watch: {
            brand: (repair.watch?.brand?.nameEn && repair.watch?.brand?.nameJp && repair.watch.brand.nameEn !== repair.watch.brand.nameJp)
                ? `${repair.watch.brand.nameEn} ${repair.watch.brand.nameJp}`
                : (repair.watch?.brand?.nameJp || repair.watch?.brand?.nameEn || repair.watch?.brand?.name || "Unknown"),
            model: repair.watch?.model?.name || "Unknown",
            ref: repair.watch?.reference?.name || "-",
            serial: repair.watch?.serialNumber || "-",
            caliber: repair.watch?.caliber?.name || "-",
        },
        timeline: repair.logs.map(log => ({
            id: log.id,
            status: log.status,
            date: log.changedAt ? (log.changedAt.toLocaleDateString("ja-JP") + " " + log.changedAt.toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' })) : "-",
            isCompleted: true
        })),
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
                        <div className="font-mono text-xs text-slate-500">{mockRepair.inquiryNumber}</div>
                        <h1 className="text-lg font-bold text-slate-900">
                            {mockRepair.watch.brand} {mockRepair.watch.model} {mockRepair.watch.ref}
                        </h1>
                        <div>{getStatusBadge(mockRepair.status)}</div>
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
                    <Link href={`/repairs/${params.id}/estimate/pdf`}>
                        <Button variant="outline" size="sm">
                            <Printer className="w-4 h-4 mr-2" /> 見積書
                        </Button>
                    </Link>
                    <Link href={`/repairs/${params.id}/invoice/pdf`}>
                        <Button variant="outline" size="sm">
                            <FileText className="w-4 h-4 mr-2" /> 請求書
                        </Button>
                    </Link>
                    <Link href={`/repairs/${params.id}/delivery/pdf`}>
                        <Button variant="outline" size="sm">
                            <Package className="w-4 h-4 mr-2" /> 納品書
                        </Button>
                    </Link>
                    <Link href={`/repairs/${params.id}/warranty/pdf`}>
                        <Button variant="outline" size="sm">
                            <ShieldCheck className="w-4 h-4 mr-2" /> 保証書
                        </Button>
                    </Link>
                    <Link href={`/repairs/${params.id}/edit`}>
                        <Button size="sm">
                            <Edit className="w-4 h-4 mr-2" /> 編集
                        </Button>
                    </Link>
                </div>
            </div>

            <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">

                {/* Left Column: Basic Info */}
                <div className="md:col-span-4 space-y-6">
                    {/* Customer Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center">
                                <ShieldCheck className="w-4 h-4 mr-2 text-blue-600" />
                                顧客情報 (Client)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-3">
                            <div>
                                <div className="text-slate-500 text-xs">お名前</div>
                                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                                    {mockRepair.customer.name}
                                    {mockRepair.endUserName && (
                                        <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                            (エンドユーザー: {mockRepair.endUserName} 様)
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div>
                                    <div className="text-slate-500 text-xs">ランク</div>
                                    <Badge variant="secondary" className="mt-1">{mockRepair.customer.type}</Badge>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs">連絡先</div>
                                    <div className="mt-1 font-mono">{mockRepair.customer.phone}</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-slate-500 text-xs">住所</div>
                                <div className="mt-1 flex items-start gap-1">
                                    <MapPin className="w-3 h-3 mt-1 text-slate-400" />
                                    {mockRepair.customer.address}
                                </div>
                            </div>
                            {/* Partner Ref */}
                            {mockRepair.partnerRef && mockRepair.partnerRef !== "-" && (
                                <div className="pt-2 border-t mt-2">
                                    <div className="text-slate-500 text-xs text-blue-600 font-bold">貴社管理番号 (Their Ref)</div>
                                    <div className="font-mono font-bold">{mockRepair.partnerRef}</div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Watch Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center">
                                <Clock className="w-4 h-4 mr-2 text-slate-600" />
                                時計詳細 (Watch)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-slate-500 text-xs">ブランド</div>
                                    <div className="font-medium">{mockRepair.watch.brand}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs">モデル名</div>
                                    <div className="font-medium">{mockRepair.watch.model}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs">型番 (Ref)</div>
                                    <div className="font-mono font-medium">{mockRepair.watch.ref}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs">製造番号 (Serial)</div>
                                    <div className="font-mono font-medium">{mockRepair.watch.serial}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs">キャリバー</div>
                                    <div className="font-mono font-medium">{mockRepair.watch.caliber}</div>
                                </div>
                                <div>
                                    <div className="text-slate-500 text-xs">受付日</div>
                                    <div className="font-medium flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-slate-400" />
                                        {mockRepair.receptionDate}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Quick Documents */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">関連書類 (Documents)</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Link href={`/repairs/${params.id}/estimate/pdf`} className="flex items-center justify-between p-3 border rounded-md hover:bg-slate-50 transition-colors group">
                                <div className="flex items-center gap-3">
                                    <FileText className="w-8 h-8 text-red-500" />
                                    <div>
                                        <div className="font-bold text-slate-900 group-hover:text-blue-600 group-hover:underline">修理見積書.pdf</div>
                                        <div className="text-xs text-slate-500">2026/01/12 発行</div>
                                    </div>
                                </div>
                                <ArrowLeft className="w-4 h-4 rotate-180 text-slate-300" />
                            </Link>
                            <Link href={`/repairs/${params.id}/warranty/pdf`} className="flex items-center justify-between p-3 border rounded-md hover:bg-slate-50 transition-colors group">
                                <div className="flex items-center gap-3">
                                    <ShieldCheck className="w-8 h-8 text-green-600" />
                                    <div>
                                        <div className="font-bold text-slate-900 group-hover:text-blue-600 group-hover:underline">修理保証書.pdf</div>
                                        <div className="text-xs text-slate-500">発行可能</div>
                                    </div>
                                </div>
                                <ArrowLeft className="w-4 h-4 rotate-180 text-slate-300" />
                            </Link>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Timeline & Photos */}
                <div className="md:col-span-8">
                    <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="w-full justify-start mb-6 bg-transparent border-b rounded-none p-0 h-auto">
                            <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-6 py-2 text-base">
                                概要 & タイムライン
                            </TabsTrigger>
                            <TabsTrigger value="photos" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-6 py-2 text-base">
                                写真ギャラリー ({mockRepair.photos.length})
                            </TabsTrigger>
                            <TabsTrigger value="parts" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent px-6 py-2 text-base">
                                使用部品・工賃 ({mockRepair.estimateItems.length})
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-2">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-2">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base">修理進行状況 (Status History)</CardTitle>
                                        <CardDescription>
                                            現在、技術者による分解掃除が進行中です。予定納期: 1月20日
                                        </CardDescription>
                                    </div>
                                    <div className="w-[240px]">
                                        <StatusUpdateForm repairId={parseInt(mockRepair.id)} currentStatus={mockRepair.status} />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <RepairTimeline events={mockRepair.timeline} />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="photos" className="animate-in fade-in-50 slide-in-from-bottom-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>登録写真 (Photo Gallery)</CardTitle>
                                    <CardDescription>
                                        クリックで拡大表示します。スマホから直接アップロードも可能です。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <PhotoGallery photos={mockRepair.photos} repairId={mockRepair.id} />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="parts">
                            <Card>
                                <CardContent className="pt-6">
                                    {mockRepair.estimateItems.length === 0 ? (
                                        <p className="text-slate-500">部品リストはまだ登録されていません。</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {mockRepair.estimateItems.map((item: any, idx: number) => (
                                                <div key={idx} className="flex justify-between items-center p-2 border-b last:border-0 hover:bg-slate-50">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sm">{item.itemName}</span>
                                                        <span className="text-xs text-slate-500 uppercase">{item.type}</span>
                                                    </div>
                                                    <div className="font-mono">
                                                        ¥{item.unitPrice.toLocaleString()}
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="flex justify-between items-center p-2 pt-4 font-bold border-t">
                                                <span>合計 (税抜)</span>
                                                <span>¥{mockRepair.estimateItems.reduce((sum: number, i: any) => sum + i.unitPrice, 0).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

            </main>
        </div>
    );
}
