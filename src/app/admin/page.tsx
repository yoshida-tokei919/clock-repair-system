import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusOverview } from "@/components/dashboard/StatusOverview";
import { SalesAnalytics } from "@/components/dashboard/SalesAnalytics";
import { UrgentTaskList } from "@/components/dashboard/UrgentTaskList";
import { PlusCircle, FileText, Settings, User as UserIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard - Clock Repair System",
  description: "Management Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">ダッシュボード</h2>
        <div className="flex items-center space-x-2">
          <Link href="/repairs">
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              修理一覧
            </Button>
          </Link>
          <Link href="/parts">
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              部品マスタ
            </Button>
          </Link>
          <Link href="/masters/pricing">
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              料金マスタ
            </Button>
          </Link>
          <Link href="/repairs/new">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              新規修理登録
            </Button>
          </Link>
          <Link href="/customers/new">
            <Button variant="outline">
              <UserIcon className="mr-2 h-4 w-4" />
              新規顧客登録
            </Button>
          </Link>
        </div>
      </div>

      {/* 1. Status Cards */}
      <StatusOverview />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* 2. Charts (Revenue & Brands) - Takes 4/7 space */}
        <div className="col-span-4">
          <SalesAnalytics />
        </div>

        {/* 3. Urgent List - Takes 3/7 space */}
        <div className="col-span-3">
          <UrgentTaskList />
        </div>
      </div>

    </div>
  );
}
