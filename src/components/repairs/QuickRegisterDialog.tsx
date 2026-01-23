
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { X, Check } from "lucide-react";

interface QuickRegisterDialogProps {
    isOpen: boolean;
    mode: "work" | "part";
    initialName: string;
    onClose: () => void;
    onRegister: (data: RegisterData) => void;
}

export interface RegisterData {
    name: string;
    price: number; // Retail Price or Tech Fee
    cost?: number; // Cost Price (Part only)
    supplier?: string; // (Part only)
}

export const QuickRegisterDialog: React.FC<QuickRegisterDialogProps> = ({ isOpen, mode, initialName, onClose, onRegister }) => {
    const [name, setName] = useState(initialName);
    const [price, setPrice] = useState(0);
    const [cost, setCost] = useState(0);
    const [supplier, setSupplier] = useState("");

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            setPrice(0);
            setCost(0);
            setSupplier("");
        }
    }, [isOpen, initialName]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!name || price < 0) {
            alert("名称と有効な金額を入力してください");
            return;
        }
        onRegister({ name, price, cost, supplier });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-white p-4 shadow-xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="font-bold text-lg">
                        {mode === "work" ? "新規作業項目の登録" : "新規部品の登録"}
                    </h3>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1">
                        <Label className="text-xs font-bold text-zinc-500">名称 / Name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="名称を入力..." className="font-bold" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs font-bold text-zinc-500">
                                {mode === "work" ? "技術料 (Tax Inc)" : "販売価格 (Retail)"}
                            </Label>
                            <Input
                                type="number"
                                value={price}
                                onChange={e => setPrice(parseInt(e.target.value) || 0)}
                                className="font-mono text-right"
                            />
                        </div>

                        {mode === "part" && (
                            <div className="space-y-1">
                                <Label className="text-xs font-bold text-zinc-500">仕入価格 (Cost)</Label>
                                <Input
                                    type="number"
                                    value={cost}
                                    onChange={e => setCost(parseInt(e.target.value) || 0)}
                                    className="font-mono text-right bg-zinc-50"
                                />
                            </div>
                        )}
                    </div>

                    {mode === "part" && (
                        <div className="space-y-1">
                            <Label className="text-xs font-bold text-zinc-500">仕入先 / Supplier</Label>
                            <Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="仕入先..." className="text-sm" />
                        </div>
                    )}
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>キャンセル</Button>
                    <Button className="bg-blue-600 hover:bg-blue-700 gap-1" onClick={handleSave}>
                        <Check className="w-4 h-4" /> 登録して追加
                    </Button>
                </div>
            </Card>
        </div>
    );
};
