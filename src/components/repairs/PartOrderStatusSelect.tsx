'use client';

import { useState } from "react";
import { updatePartOrderStatus } from "@/actions/repair-actions";
import { Loader2, Truck, Clock, CheckCircle } from "lucide-react";

export function PartOrderStatusSelect({ itemId, currentStatus, minimal = false }: { itemId: number, currentStatus: string | null, minimal?: boolean }) {
    const [status, setStatus] = useState(currentStatus || 'pending');
    const [isPending, setIsPending] = useState(false);

    const handleSelect = async (newStatus: string) => {
        if (newStatus === status) return;
        setIsPending(true);
        const res = await updatePartOrderStatus(itemId, newStatus);
        setIsPending(false);
        if (res.success) {
            setStatus(newStatus);
        } else {
            alert("更新に失敗しました");
        }
    };

    return (
        <div className={`flex bg-zinc-100 rounded p-0.5 w-fit ${minimal ? 'scale-90 origin-left' : ''}`}>
            <button
                onClick={() => handleSelect('pending')}
                className={`p-1 rounded text-[10px] flex items-center gap-1 transition-colors ${status === 'pending' ? 'bg-white shadow text-red-600 font-bold' : 'text-zinc-400 hover:text-zinc-600'}`}
                title="未注文"
            >
                <Clock className="w-3 h-3" />
                {!minimal && <span>未注文</span>}
            </button>
            <button
                onClick={() => handleSelect('ordered')}
                className={`p-1 rounded text-[10px] flex items-center gap-1 transition-colors ${status === 'ordered' ? 'bg-white shadow text-blue-600 font-bold' : 'text-zinc-400 hover:text-zinc-600'}`}
                title="注文済"
            >
                <Truck className="w-3 h-3" />
                {!minimal && <span>注文済</span>}
            </button>
            {!minimal && (
                <button
                    onClick={() => handleSelect('received')}
                    className={`p-1 rounded text-[10px] flex items-center gap-1 transition-colors ${status === 'received' ? 'bg-white shadow text-green-600 font-bold' : 'text-zinc-400 hover:text-zinc-600'}`}
                    title="入荷済"
                >
                    <CheckCircle className="w-3 h-3" />
                    <span>入荷済</span>
                </button>
            )}
            {isPending && <Loader2 className="w-3 h-3 animate-spin ml-1 self-center" />}
        </div>
    );
}
