import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getRecentRepairs } from "@/actions/repair-actions";

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
                <div className="space-y-8">
                    {recentRepairs.map((repair) => (
                        <div key={repair.id} className="flex items-center">
                            <Avatar className="h-9 w-9">
                                <AvatarFallback>{repair.customer?.name?.[0] || "?"}</AvatarFallback>
                            </Avatar>
                            <div className="ml-4 space-y-1">
                                <p className="text-sm font-medium leading-none">
                                    {repair.watch?.brand?.name || "ブランド不明"} {repair.watch?.model?.nameJp || ""}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {repair.customer?.name || "顧客不明"} • {repair.inquiryNumber}
                                </p>
                            </div>
                            <div className="ml-auto font-medium text-right">
                                <div className="text-sm">{statusMap[repair.status] || repair.status}</div>
                                <div className="text-xs text-muted-foreground">
                                    {new Date(repair.createdAt).toLocaleDateString("ja-JP")}
                                </div>
                            </div>
                        </div>
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
