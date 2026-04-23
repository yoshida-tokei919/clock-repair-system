import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CheckCircle, AlertCircle, TrendingUp, Settings } from "lucide-react";
import { getRepairStats } from "@/actions/repair-actions";
import Link from "next/link";

export async function StatusOverview() {
    const statsData = await getRepairStats();

    const stats = [
        { title: "受付数", value: statsData?.['受付'] || 0, icon: Clock, color: "text-blue-500", href: "/repairs?status=受付" },
        { title: "見積中", value: statsData?.['見積中'] || 0, icon: AlertCircle, color: "text-orange-500", href: "/repairs?status=見積中" },
        { title: "部品待ち", value: (statsData?.['部品待ち(未注文)'] || 0) + (statsData?.['部品待ち(注文済み)'] || 0), icon: Settings, color: "text-amber-600", href: "/repairs?status=部品待ち(未注文)" },
        { title: "作業中", value: statsData?.['作業中'] || 0, icon: TrendingUp, color: "text-purple-500", href: "/repairs?status=作業中" },
        { title: "作業完了", value: statsData?.['作業完了'] || 0, icon: CheckCircle, color: "text-green-500", href: "/repairs?status=作業完了" },
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
