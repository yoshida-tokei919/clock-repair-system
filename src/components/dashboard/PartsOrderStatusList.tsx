import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getPendingParts } from "@/actions/repair-actions";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ExternalLink, Truck, Clock } from "lucide-react";

export async function PartsOrderStatusList() {
    const parts = await getPendingParts();

    const orderStatusMap: Record<string, { label: string, color: string }> = {
        'pending': { label: '未注文', color: 'bg-red-100 text-red-700 border-red-200' },
        'ordered': { label: '注文済', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    };

    return (
        <Card className="col-span-full">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg font-bold">部品注文状況</CardTitle>
                        <CardDescription>現在注文待ち、または入荷待ちの部品一覧</CardDescription>
                    </div>
                    <Badge variant="outline" className="font-mono">{parts.length} 件</Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-zinc-50 border-y py-2">
                            <tr className="text-left text-zinc-500 font-medium">
                                <th className="p-2">ステータス</th>
                                <th className="p-2">ブランド・モデル</th>
                                <th className="p-2">Ref / Cal</th>
                                <th className="p-2">部品名</th>
                                <th className="p-2">部品番号</th>
                                <th className="p-2 text-right">価格</th>
                                <th className="p-2 text-right">日付</th>
                                <th className="p-2 text-center">案件</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {parts.map((item: any) => {
                                const watch = item.estimate?.repair?.watch;
                                const repair = item.estimate?.repair;
                                const status = orderStatusMap[item.orderStatus || 'pending'];

                                return (
                                    <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors">
                                        <td className="p-2">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${status.color}`}>
                                                {status.label}
                                            </span>
                                        </td>
                                        <td className="p-2 font-medium">
                                            <div>{watch?.brand?.nameEn || watch?.brand?.name || '-'}</div>
                                            <div className="text-[10px] text-zinc-400">{watch?.model?.nameJp || '-'}</div>
                                        </td>
                                        <td className="p-2 text-xs">
                                            <div>{watch?.reference?.name || '-'}</div>
                                            <div className="text-zinc-400 font-mono italic">{watch?.caliber?.name || '-'}</div>
                                        </td>
                                        <td className="p-2">
                                            <div className="font-bold">{item.itemName}</div>
                                        </td>
                                        <td className="p-2 font-mono text-xs text-zinc-500">
                                            {/* We don't have partNumber in EstimateItem yet, might need to link to PartMaster or just add it */}
                                            {/* For now, leaving as placeholder or if it's in itemName */}
                                            -
                                        </td>
                                        <td className="p-2 text-right font-mono">
                                            ¥{item.unitPrice.toLocaleString()}
                                        </td>
                                        <td className="p-2 text-right text-xs text-zinc-400">
                                            <div className="flex items-center justify-end gap-1">
                                                {item.orderStatus === 'ordered' ? <Truck className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                {new Date(item.orderedAt || item.createdAt).toLocaleDateString("ja-JP")}
                                            </div>
                                        </td>
                                        <td className="p-2 text-center">
                                            <Link href={`/repairs/${repair.id}`} className="inline-flex p-1 rounded hover:bg-zinc-200 text-zinc-400 hover:text-blue-600 transition-colors">
                                                <ExternalLink className="w-4 h-4" />
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                            {parts.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-zinc-400 italic">注文が必要な部品はありません</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
