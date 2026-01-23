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
        case 'diagnosing': return "bg-orange-500 hover:bg-orange-600";
        case 'parts_wait': return "bg-yellow-500 hover:bg-yellow-600";
        case 'in_progress': return "bg-purple-500 hover:bg-purple-600";
        case 'completed': return "bg-green-500 hover:bg-green-600";
        case 'delivered': return "bg-slate-500 hover:bg-slate-600";
        default: return "";
    }
};

const getStatusLabel = (status: string) => {
    switch (status) {
        case 'reception': return "受付 (Reception)";
        case 'diagnosing': return "見積中 (Estimating)";
        case 'parts_wait': return "部品待 (Waiting Parts)";
        case 'in_progress': return "作業中 (In Progress)";
        case 'completed': return "完了 (Completed)";
        case 'delivered': return "納品済 (Delivered)";
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
                <DropdownMenuItem onClick={() => handleSelect('reception')}>受付 (Reception)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('diagnosing')}>見積中 (Estimating)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('parts_wait')}>部品待 (Waiting Parts)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('in_progress')}>作業中 (In Progress)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('completed')}>完了 (Completed)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelect('delivered')}>納品済 (Delivered)</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
