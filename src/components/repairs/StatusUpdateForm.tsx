'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { updateRepairStatus } from "@/actions/repair-actions";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function StatusUpdateForm({ repairId, currentStatus }: { repairId: number, currentStatus: string }) {
    const [status, setStatus] = useState(currentStatus);
    const [isPending, setIsPending] = useState(false);
    const router = useRouter();

    const handleUpdate = async () => {
        if (status === currentStatus) return;

        setIsPending(true);
        const result = await updateRepairStatus(repairId, status);
        setIsPending(false);

        if (result.success) {
            // Toast or just let revalidate handle it
            // Assuming revalidatePath works, but router.refresh() is often safer for client cache
            // router.refresh(); 
            // relying on revalidatePath in action
        } else {
            alert("更新に失敗しました。");
        }
    };

    return (
        <div className="flex items-center gap-2">
            <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
                <option value="reception">受付</option>
                <option value="diagnosing">見積中</option>
                <option value="parts_wait">部品待 (未注文)</option>
                <option value="parts_wait_ordered">部品待 (注文済)</option>
                <option value="in_progress">作業中</option>
                <option value="completed">完了</option>
                <option value="delivered">納品済</option>
                <option value="canceled">キャンセル</option>
            </select>
            <Button
                onClick={handleUpdate}
                disabled={isPending || status === currentStatus}
                size="sm"
            >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                更新
            </Button>
        </div>
    );
}
