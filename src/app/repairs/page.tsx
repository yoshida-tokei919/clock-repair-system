import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStatusBadge } from "@/components/status-badge";
import { RepairListStatusSelect } from "@/components/repairs/RepairListStatusSelect";
import { RepairsTableClient } from "@/components/repairs/RepairsTableClient";
import { PlusCircle, Search, Filter, LayoutDashboard } from "lucide-react";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";

export default async function RepairsPage({
    searchParams,
}: {
    searchParams: { q?: string; status?: string };
}) {
    const query = searchParams.q || "";
    const status = searchParams.status || "all";

    // Build Filters
    const where: any = {};

    if (query) {
        where.OR = [
            { inquiryNumber: { contains: query } },
            { customer: { name: { contains: query } } },
            { watch: { brand: { name: { contains: query } } } },
            { watch: { serialNumber: { contains: query } } },
        ];
    }

    if (status !== "all") {
        where.status = status;
    }

    // Fetch Data
    const repairs = await prisma.repair.findMany({
        where,
        orderBy: { id: "desc" },
        include: {
            customer: true,
            watch: { include: { brand: true, model: true } },
            deliveryNote: true,
            invoice: true,
            estimateDocument: true,
        },
        take: 50,
    });

    async function searchAction(formData: FormData) {
        "use server";
        const q = formData.get("q");
        const s = formData.get("status");
        const params = new URLSearchParams();
        if (q) params.set("q", q.toString());
        if (s && s !== "all") params.set("status", s.toString());
        redirect(`/repairs?${params.toString()}`);
    }

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">修理案件一覧</h2>
                <div className="flex items-center space-x-2">
                    <Link href="/repairs/board">
                        <Button variant="outline">
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            ボード表示
                        </Button>
                    </Link>
                    <Link href="/repairs/new">
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            新規修理登録
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex items-center gap-4 bg-white p-4 rounded-md border shadow-sm">
                <form className="flex w-full gap-4 items-center" action={searchAction}>
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="検索 (管理番号, 名前, ブランド...)" name="q" defaultValue={query} className="pl-8" />
                    </div>

                    <select
                        name="status"
                        defaultValue={status}
                        className="flex h-10 w-[180px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <option value="all">全てのステータス</option>
                        <option value="reception">受付 (Reception)</option>
                        <option value="diagnosing">見積中 (Estimating)</option>
                        <option value="parts_wait">部品待 (Waiting Parts)</option>
                        <option value="in_progress">作業中 (In Progress)</option>
                        <option value="completed">完了 (Completed)</option>
                    </select>

                    <Button type="submit" variant="outline">
                        <Filter className="mr-2 h-4 w-4" />
                        絞り込み
                    </Button>
                </form>
            </div>

            {/* Data Table */}
            <RepairsTableClient repairs={repairs as any} />
        </div>
    );
}
