"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User } from "lucide-react";

interface RepairCardProps {
    repair: {
        id: number;
        inquiryNumber: string;
        partnerRef?: string | null;
        customer: { name: string; type: string };
        watch: { brand: string; model: string };
        status: string;
        photo?: string;
        approvalDate?: string | null;
        endUserName?: string | null;
    };
}

export function KanbanCard({ repair }: RepairCardProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: String(repair.id), // Draggable ID must be string
        data: { repair }
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        // Ensure card stays on top while dragging
        zIndex: isDragging ? 100 : undefined,
    };

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="mb-3 touch-none">
            <Card className="shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing border-l-4 border-l-blue-500">
                <CardContent className="p-3 space-y-2">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="font-mono text-xs text-slate-500">{repair.inquiryNumber}</div>
                            {repair.partnerRef && (
                                <div className="text-[10px] text-blue-600 font-bold leading-none mt-0.5">{repair.partnerRef}</div>
                            )}
                        </div>
                        {repair.customer.type === 'business' && (
                            <Badge variant="outline" className="text-[10px] py-0 h-4 bg-orange-50 border-orange-200 text-orange-700">業者</Badge>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {repair.photo && (
                            <img src={repair.photo} alt="Watch" className="w-10 h-10 rounded object-cover bg-slate-100" />
                        )}
                        <div>
                            <div className="font-bold text-sm leading-tight text-slate-900">
                                {repair.watch.brand}
                            </div>
                            <div className="text-xs text-slate-500 truncate w-[140px]">
                                {repair.watch.model}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                        <User className="w-3 h-3" />
                        <div className="flex flex-col truncate max-w-[120px]">
                            <span>{repair.customer.name}</span>
                            {repair.endUserName && (
                                <span className="font-bold text-slate-700 text-[10px]">お客様名: {repair.endUserName} 様</span>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
