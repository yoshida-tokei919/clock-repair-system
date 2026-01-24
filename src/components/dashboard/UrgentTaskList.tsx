import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRecentRepairs } from "@/actions/repair-actions";
import Link from "next/link";
import { Watch, User, ArrowRight } from "lucide-react";

export async function UrgentTaskList() {
    const recentRepairs = await getRecentRepairs(5);

    const statusMap: Record<string, string> = {
        'reception': '受付',
        'diagnosing': '見積中',
        'parts_wait': '部品待',
        'in_progress': '作業中',
        'completed': '完了',
        'delivered': '納品済',
        'canceled': 'キャンセル'
    };

    return (
        <Card className="col-span-4 lg:col-span-3">
            <CardHeader>
                <CardTitle>直近の受付案件</CardTitle>
                <CardDescription>
                    システムに登録された最新 5 件を表示しています
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {recentRepairs.map((repair) => (
                        <Link href={`/repairs/${repair.id}`} key={repair.id} className="block group">
                            <div className="flex items-center p-2 rounded-lg hover:bg-zinc-50 transition-colors border border-transparent hover:border-zinc-100">
                                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <Watch className="h-5 w-5" />
                                </div>
                                <div className="ml-4 space-y-1 flex-1">
                                    <p className="text-sm font-bold leading-none text-zinc-800">
                                        {repair.watch?.brand?.nameEn || repair.watch?.brand?.name || "ブランド不明"} {repair.watch?.model?.nameJp || ""}
                                    </p>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <User className="h-3 w-3" /> {repair.customer?.name || "顧客不明"} • {repair.inquiryNumber}
                                    </p>
                                </div>
                                <div className="font-medium text-right">
                                    <div className="text-xs bg-zinc-100 px-2 py-0.5 rounded-full inline-block mb-1 group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
                                        {statusMap[repair.status] || repair.status}
                                    </div>
                                    <div className="text-[10px] text-zinc-400">
                                        {new Date(repair.createdAt).toLocaleDateString("ja-JP")}
                                    </div>
                                </div>
                                <ArrowRight className="h-4 w-4 ml-4 text-zinc-200 group-hover:text-blue-500 translate-x-0 group-hover:translate-x-1 transition-all" />
                            </div>
                        </Link>
                    ))}
                    {recentRepairs.length === 0 && (
                        <div className="text-center text-muted-foreground py-8">
                            データがありません
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
