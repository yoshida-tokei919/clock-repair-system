'use client';

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Watch, User, Clock, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export function RecentRegistrations() {
    const [repairs, setRepairs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchRecent = async () => {
            try {
                const res = await fetch('/api/repairs/recent?limit=10');
                const data = await res.json();
                if (data.success) setRepairs(data.repairs);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRecent();
        // Refresh every minute
        const interval = setInterval(fetchRecent, 60000);
        return () => clearInterval(interval);
    }, []);

    if (isLoading) return <div className="p-4 text-center text-xs text-zinc-400">Loading history...</div>;

    return (
        <div className="flex flex-col gap-2 p-2">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">最近の受付履歴</h3>
            {repairs.map((r) => (
                <Link href={`/repairs/${r.id}`} key={r.id} className="group">
                    <Card className="p-2 hover:border-blue-300 hover:shadow-sm transition-all bg-white border-zinc-200">
                        <div className="flex items-start justify-between mb-1">
                            <div className="font-mono text-[10px] text-zinc-500">{r.inquiryNumber}</div>
                            <div className="text-[9px] text-zinc-400 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(r.createdAt).toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                        <div className="font-bold text-xs truncate text-zinc-800">
                            {r.watch?.brand?.name || "Unknown"} {r.watch?.model?.name || ""}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                            <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                                <User className="w-2.5 h-2.5 text-zinc-300" />
                                {r.customer?.name}
                            </div>
                            <Badge variant="outline" className="text-[8px] px-1 h-3.5 border-blue-100 text-blue-600 bg-blue-50">
                                {r.status}
                            </Badge>
                        </div>
                    </Card>
                </Link>
            ))}
            {repairs.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed rounded-lg border-zinc-200">
                    <p className="text-[10px] text-zinc-400 italic">履歴はありません</p>
                </div>
            )}
            <Link href="/repairs" className="text-[10px] text-center text-blue-600 hover:underline mt-2">
                すべての修理一覧を見る
            </Link>
        </div>
    );
}
