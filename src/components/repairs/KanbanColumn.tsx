"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { KanbanCard } from "./KanbanCard";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
    id: string; // ステータスキー（例: '受付'）
    title: string;
    repairs: any[];
    color?: string;
}

export function KanbanColumn({ id, title, repairs, color = "bg-slate-100" }: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({
        id: id,
    });

    return (
        <div className="flex flex-col h-full bg-slate-50/50 rounded-lg border border-slate-200 min-w-[280px] w-[280px]">
            {/* Header */}
            <div className={cn("p-3 font-bold text-sm border-b flex justify-between items-center rounded-t-lg", color)}>
                <span>{title}</span>
                <span className="bg-white/50 px-2 py-0.5 rounded-full text-xs text-slate-700">
                    {repairs.length}
                </span>
            </div>

            {/* Droppable Area */}
            <div
                ref={setNodeRef}
                className={cn(
                    "flex-1 p-2 overflow-y-auto transition-colors",
                    isOver ? "bg-slate-100 inner-shadow-sm" : ""
                )}
            >
                {repairs.map((repair) => (
                    <KanbanCard key={repair.id} repair={repair} />
                ))}
            </div>
        </div>
    );
}
