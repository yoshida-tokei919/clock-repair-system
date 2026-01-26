'use client';

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { updateRepairStatus } from "@/actions/repair-actions";
import { Loader2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
    id: number;
    currentStatus: string;
}

// Replicating the Badge logic for consistency
const getStatusBadgeVariant = (status: string) => {
    switch (status) {
        case 'reception': return "bg-blue-500 hover:bg-blue-600";
        case 'diagnosing': return "bg-amber-500 hover:bg-amber-600";
        case 'parts_wait': return "bg-orange-400 hover:bg-orange-500";
        case 'parts_wait_ordered': return "bg-orange-600 hover:bg-orange-700";
        case 'in_progress': return "bg-indigo-500 hover:bg-indigo-600";
        case 'completed': return "bg-emerald-500 hover:bg-emerald-600";
        case 'delivered': return "bg-zinc-500 hover:bg-zinc-600";
        case 'canceled': return "bg-red-500 hover:bg-red-600";
        default: return "";
    }
};

const getStatusLabel = (status: string) => {
    switch (status) {
        case 'reception': return "受付";
        case 'diagnosing': return "見積中";
        case 'parts_wait': return "部品待 (未注文)";
        case 'parts_wait_ordered': return "部品待 (注文済)";
        case 'in_progress': return "作業中";
        case 'completed': return "完了";
        case 'delivered': return "納品済";
        case 'canceled': return "キャンセル";
        default: return status;
    }
};

export function RepairListStatusSelect({ id, currentStatus }: Props) {
    const [status, setStatus] = useState(currentStatus);
    const [isPending, setIsPending] = useState(false);

    const handleSelect = async (newStatus: string) => {
        if (newStatus === status) return;

        // Optimistic update
        const oldStatus = status;
        setStatus(newStatus);

        setIsPending(true);
        const result = await updateRepairStatus(id, newStatus);
        setIsPending(false);

        if (!result.success) {
            // Revert on failure
            setStatus(oldStatus);
            alert("更新に失敗しました。");
        }
    };

    const variantClass = getStatusBadgeVariant(status);
    const label = getStatusLabel(status);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="focus:outline-none" asChild>
                <Badge className={`cursor-pointer ${variantClass} ${isPending ? 'opacity-70' : ''}`}>
                    {isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    {label}
                </Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => handleSelect('reception')}>受付</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('diagnosing')}>見積中</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('parts_wait')}>部品待 (未注文)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('parts_wait_ordered')}>部品待 (注文済)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('in_progress')}>作業中</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('completed')}>完了</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('delivered')}>納品済</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('canceled')}>キャンセル</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
