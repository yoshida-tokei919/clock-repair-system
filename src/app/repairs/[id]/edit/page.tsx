
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { RepairEntryForm } from "@/components/repairs/RepairEntryForm";

export const dynamic = "force-dynamic";

export default async function EditRepairPage({ params }: { params: { id: string } }) {
    const repairId = parseInt(params.id);

    const repair = await prisma.repair.findUnique({
        where: { id: repairId },
        include: {
            customer: true,
            watch: {
                include: {
                    brand: true,
                    model: true,
                    caliber: true,
                    reference: true
                }
            },
            estimate: {
                include: {
                    items: true
                }
            },
            photos: true,
            logs: true
        }
    });

    if (!repair) {
        notFound();
    }

    // Prepare status log for UI
    const statusLog: Record<string, string> = {};
    repair.logs.forEach(log => {
        // Map log labels back to UI keys if possible
        const labelToKey: Record<string, string> = {
            '受付 (Reception)': 'reception',
            '見積中 (Estimating)': 'diagnosing',
            '部品待 (未注文)': 'parts_wait',
            '部品待 (注文済)': 'parts_wait_ordered',
            '作業中 (In Progress)': 'in_progress',
            '完了 (Completed)': 'completed',
            '納品済 (Delivered)': 'delivered'
        };
        const key = labelToKey[log.status] || log.status;
        statusLog[key] = log.changedAt.toLocaleDateString("ja-JP");
    });

    return (
        <div className="bg-zinc-100 min-h-screen">
            <RepairEntryForm mode="edit" initialData={{ ...repair, statusLog }} />
        </div>
    );
}
