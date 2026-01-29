import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function BizCasePage() {
    const repairs = await prisma.repair.findMany({
        where: {
            isPublicB2B: true,
            status: { not: 'canceled' }
        },
        include: {
            watch: { include: { brand: true, model: true, reference: true } },
            estimate: true
        },
        orderBy: { deliveryDateActual: 'desc' },
        take: 50
    });

    return (
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
            <div className="mb-12 border-b pb-8">
                <h1 className="text-2xl font-bold mb-2 tracking-tight flex items-center gap-3">
                    <span className="bg-neutral-900 text-white text-sm px-2 py-1 rounded">B2B</span>
                    業者様向け 修理価格・納期事例
                </h1>
                <p className="text-neutral-500 text-sm">
                    実際の修理実績に基づいた価格と納期の目安です。<br />
                    同業者様、買取店様のアフターメンテナンスの参考情報として公開しています。
                </p>
            </div>

            <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-neutral-50">
                        <TableRow>
                            <TableHead className="w-[120px]">ブランド</TableHead>
                            <TableHead className="w-[180px]">モデル / Ref</TableHead>
                            <TableHead>作業内容</TableHead>
                            <TableHead className="text-right w-[120px]">修理総額(税別)</TableHead>
                            <TableHead className="text-right w-[100px]">納期目安</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {repairs.map((repair) => {
                            const est = repair.estimate;
                            const total = est ? est.technicalFee + est.partsTotal : 0;
                            // Calculate days
                            const days = repair.receptionDate && repair.deliveryDateActual
                                ? Math.ceil((repair.deliveryDateActual.getTime() - repair.receptionDate.getTime()) / (1000 * 60 * 60 * 24))
                                : "-";

                            return (
                                <TableRow key={repair.id} className="group">
                                    <TableCell className="font-bold">
                                        {repair.watch.brand.name}
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium">{repair.watch.model.name}</div>
                                        <div className="text-xs text-neutral-500 font-mono">{repair.watch.reference?.name}</div>
                                    </TableCell>
                                    <TableCell className="text-sm text-neutral-600">
                                        {repair.publicTitle || repair.workSummary || "オーバーホール, 部品交換..."}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-neutral-900">
                                        ¥{total.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right text-sm">
                                        {days} 日
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`/cases/biz/${repair.id}`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ArrowRight className="w-4 h-4 text-neutral-400 hover:text-blue-600" />
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <div className="mt-8 p-4 bg-blue-50 text-blue-900 text-sm rounded border border-blue-100">
                <strong>ご注意:</strong> 掲載価格は過去の実績であり、現在の部品価格や状態により変動する場合があります。正確な御見積は現物拝見後にご提示いたします。
            </div>
        </div>
    );
}
