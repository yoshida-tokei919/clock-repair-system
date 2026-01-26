"use client";

import React, { useState } from "react";
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";
import { updateRepairStatus } from "@/actions/repair-actions";
import { useToast } from "@/components/ui/use-toast";

type Repair = any; // Simplify for now

interface KanbanBoardProps {
    initialRepairs: Repair[];
}

const COLUMNS = [
    { id: 'reception', title: '受付', color: 'bg-slate-100' },
    { id: 'diagnosing', title: '見積中', color: 'bg-yellow-50 text-yellow-800 border-yellow-100' },
    { id: 'parts_wait', title: '部品待 (未注文)', color: 'bg-orange-50 text-orange-800 border-orange-100' },
    { id: 'parts_wait_ordered', title: '部品待 (注文済)', color: 'bg-orange-100 text-orange-900 border-orange-200' },
    { id: 'in_progress', title: '作業中', color: 'bg-blue-50 text-blue-800 border-blue-100' },
    { id: 'completed', title: '完了', color: 'bg-green-50 text-green-800 border-green-100' },
    { id: 'delivered', title: '納品済', color: 'bg-zinc-100 text-zinc-600' },
];

export function KanbanBoard({ initialRepairs }: KanbanBoardProps) {
    const [repairs, setRepairs] = useState<Repair[]>(initialRepairs);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeRepair, setActiveRepair] = useState<Repair | null>(null);
    const { toast } = useToast();

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Prevent accidental drags
            },
        })
    );

    // Grouping
    const columnsData = COLUMNS.map(col => ({
        ...col,
        items: repairs.filter(r => r.status === col.id)
    }));

    // Other/Unknown status items?
    // Just ignore them or put in reception?
    // Filter out canceled/delivered for now?
    // Let's assume initialRepairs is filtered by Server Page.

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        setActiveId(String(active.id));
        setActiveRepair(active.data.current?.repair);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        setActiveRepair(null);

        if (!over) return;

        const repairId = parseInt(String(active.id));
        const newStatus = String(over.id);
        const currentRepair = repairs.find(r => r.id === repairId);

        if (!currentRepair || currentRepair.status === newStatus) return;

        // Optimistic Update
        setRepairs(prev => prev.map(r =>
            r.id === repairId ? { ...r, status: newStatus } : r
        ));

        // Server Action
        const result = await updateRepairStatus(repairId, newStatus);
        if (!result.success) {
            // Revert
            setRepairs(initialRepairs);
            toast({
                title: "ステータス更新失敗",
                description: result.error || "サーバーエラーが発生しました。",
                variant: "destructive"
            });
        }
    };

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-[calc(100vh-140px)] gap-4 overflow-x-auto pb-4 items-start">
                {columnsData.map(col => (
                    <KanbanColumn
                        key={col.id}
                        id={col.id}
                        title={col.title}
                        repairs={col.items}
                        color={col.color}
                    />
                ))}
            </div>

            <DragOverlay>
                {activeRepair ? <KanbanCard repair={activeRepair} /> : null}
            </DragOverlay>
        </DndContext>
    );
}
