import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CheckCircle, AlertCircle, TrendingUp } from "lucide-react";
import { getRepairStats } from "@/actions/repair-actions";

export async function StatusOverview() {
    const statsData = await getRepairStats();

    const stats = [
        { title: "受付数", value: statsData?.reception || 0, icon: Clock, color: "text-blue-500" },
        { title: "見積中", value: statsData?.diagnosing || 0, icon: AlertCircle, color: "text-orange-500" },
        { title: "作業中", value: statsData?.in_progress || 0, icon: TrendingUp, color: "text-purple-500" },
        { title: "完了 (未納品)", value: statsData?.completed || 0, icon: CheckCircle, color: "text-green-500" },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
                <Card key={stat.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {stat.title}
                        </CardTitle>
                        <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <p className="text-xs text-muted-foreground">
                            システム内件数
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
