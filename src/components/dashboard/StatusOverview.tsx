import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CheckCircle, AlertCircle, TrendingUp, Settings } from "lucide-react";
import { getRepairStats } from "@/actions/repair-actions";
import Link from "next/link";

export async function StatusOverview() {
    const statsData = await getRepairStats();

    const stats = [
        { title: "受付数", value: statsData?.reception || 0, icon: Clock, color: "text-blue-500", href: "/repairs?status=reception" },
        { title: "見積中", value: statsData?.diagnosing || 0, icon: AlertCircle, color: "text-orange-500", href: "/repairs?status=diagnosing" },
        { title: "部品待ち", value: (statsData?.parts_wait || 0) + (statsData?.parts_wait_ordered || 0), icon: Settings, color: "text-amber-600", href: "/repairs?status=parts_wait" },
        { title: "作業中", value: statsData?.in_progress || 0, icon: TrendingUp, color: "text-purple-500", href: "/repairs?status=in_progress" },
        { title: "完了 (未納品)", value: statsData?.completed || 0, icon: CheckCircle, color: "text-green-500", href: "/repairs?status=completed" },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {stats.map((stat) => (
                <Link href={stat.href} key={stat.title}>
                    <Card className="hover:shadow-md transition-all hover:-translate-y-1 cursor-pointer">
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
                </Link>
            ))}
        </div>
    );
}
