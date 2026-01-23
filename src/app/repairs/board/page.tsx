import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
import { KanbanBoard } from "@/components/repairs/KanbanBoard";
import { ArrowLeft, LayoutDashboard, ListFilter } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function KanbanPage() {
    // Fetch Active Repairs (Exclude Delivered/Canceled for Board Clarity?)
    // Or include all? Usually board is for WIP. 
    // Let's filtering out Canceled and Delivered (unless recently delivered?).
    // For now, exclude Canceled/Delivered to keep board clean.

    const repairs = await prisma.repair.findMany({
        where: {
            status: {
                notIn: ['canceled']
            }
        },
        include: {
            customer: true,
            watch: {
                include: { brand: true, model: true }
            },
            photos: {
                orderBy: { id: 'desc' },
                take: 1
            } // Thumbnail
        },
        orderBy: {
            receptionDate: 'asc' // Oldest first?
        }
    });

    // Transform for Client Component
    const formattedRepairs = repairs.map(r => ({
        id: r.id,
        inquiryNumber: r.inquiryNumber,
        partnerRef: r.partnerRef, // Added
        customer: {
            name: r.customer.name,
            type: r.customer.type
        },
        watch: {
            brand: r.watch.brand.name || "Unknown",
            model: r.watch.model.name || "Unknown",
        },
        endUserName: r.endUserName, // Added
        status: r.status,
        approvalDate: r.approvalDate ? r.approvalDate.toLocaleDateString("ja-JP") : null,
        photo: r.photos[0]?.storageKey || null
    }));

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col">
            <header className="bg-white border-b px-6 py-3 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-4">
                    <Link href="/admin">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" /> 戻る
                        </Button>
                    </Link>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <LayoutDashboard className="w-5 h-5 text-blue-600" />
                        進捗ボード (Kanban)
                    </h1>
                </div>
                <div className="flex gap-2">
                    <Link href="/repairs">
                        <Button variant="outline" size="sm">
                            <ListFilter className="w-4 h-4 mr-2" /> リスト表示
                        </Button>
                    </Link>
                </div>
            </header>

            <main className="flex-1 p-6 overflow-hidden">
                <KanbanBoard initialRepairs={formattedRepairs} />
            </main>
        </div>
    );
}
