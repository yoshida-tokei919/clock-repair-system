import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { X, Check } from "lucide-react";


interface QuickRegisterDialogProps {
    isOpen: boolean;
    mode: "work" | "part" | "customer";
    initialName: string;
    onClose: () => void;
    onRegister: (data: RegisterData) => void;
}

export interface RegisterData {
    name: string;
    // For Work/Part
    price?: number;
    cost?: number;
    supplier?: string;
    // For Customer
    type?: "individual" | "business";
    prefix?: string;
    phone?: string;
    address?: string;
}

export const QuickRegisterDialog: React.FC<QuickRegisterDialogProps> = ({ isOpen, mode, initialName, onClose, onRegister }) => {
    const [name, setName] = useState(initialName);

    // Work/Part State
    const [price, setPrice] = useState(0);
    const [cost, setCost] = useState(0);
    const [supplier, setSupplier] = useState("");

    // Customer State
    const [type, setType] = useState<"individual" | "business">("individual");
    const [prefix, setPrefix] = useState("C");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            // Reset Work/Part
            setPrice(0);
            setCost(0);
            setSupplier("");
            // Reset Customer
            setType("individual");
            setPrefix("C");
            setPhone("");
            setAddress("");
        }
    }, [isOpen, initialName]);

    // Auto-set prefix based on type
    useEffect(() => {
        if (mode === 'customer') {
            if (type === 'individual') {
                setPrefix("C");
            } else {
                setPrefix(""); // Clear for user input if business
            }
        }
    }, [type, mode]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!name) {
            alert("名称を入力してください");
            return;
        }

        if (mode === 'customer') {
            if (type === 'business' && !prefix) {
                alert("業者の場合、管理用プレフィックス（2-3文字）は必須です");
                return;
            }
            onRegister({ name, type, prefix, phone, address });
        } else {
            // Work/Part
            if (price < 0) {
                alert("有効な金額を入力してください");
                return;
            }
            onRegister({ name, price, cost, supplier });
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-white p-4 shadow-xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="font-bold text-lg">
                        {mode === "work" && "新規作業項目の登録"}
                        {mode === "part" && "新規部品の登録"}
                        {mode === "customer" && "新規顧客・業者の登録"}
                    </h3>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* CUSTOMER MODE */}
                    {mode === 'customer' && (
                        <>
                            <div className="flex gap-4 mb-2">
                                <div className="flex items-center space-x-2">
                                    <input type="radio" id="type-c" checked={type === 'individual'} onChange={() => setType('individual')} className="w-4 h-4 text-blue-600" />
                                    <Label htmlFor="type-c" className="cursor-pointer">個人 (Individual)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input type="radio" id="type-b" checked={type === 'business'} onChange={() => setType('business')} className="w-4 h-4 text-blue-600" />
                                    <Label htmlFor="type-b" className="cursor-pointer">業者 (Business)</Label>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-bold text-zinc-500">名前 / 業者名</Label>
                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="名称を入力..." className="font-bold" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold text-zinc-500">管理ID (Prefix)</Label>
                                    <Input
                                        value={prefix}
                                        onChange={e => setPrefix(e.target.value.toUpperCase())}
                                        maxLength={3}
                                        placeholder="例: T, BR"
                                        className="font-mono uppercase bg-zinc-50"
                                        disabled={type === 'individual'}
                                    />
                                    {type === 'individual' && <p className="text-[10px] text-zinc-400">※個人客は "C" 固定</p>}
                                </div>
                                {type === 'individual' && (
                                    <div className="space-y-1">
                                        <Label className="text-xs font-bold text-zinc-500">電話番号</Label>
                                        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="090-..." />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-bold text-zinc-500">住所</Label>
                                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="都道府県 市区町村..." />
                            </div>
                        </>
                    )}

                    {/* WORK / PART MODE */}
                    {mode !== 'customer' && (
                        <>
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
                        </>
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
