"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, Settings, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MasterValidators, ValidationMessages } from "@/lib/validators";
import { getBrands, getModels, getCalibers, getCalibersForModel, upsertBrand, upsertModel, upsertCaliber } from "@/actions/master-actions";

// --- Advanced Combobox (Reused) ---
interface AdvancedComboboxProps {
    value: string;
    onChange: (value: string) => void;
    onUpsert?: (value: string) => void;
    placeholder?: string;
    options: string[];
    disabled?: boolean;
    validator?: (value: string) => boolean;
    validationMessage?: string;
}

const AdvancedCombobox: React.FC<AdvancedComboboxProps> = ({
    value,
    onChange,
    onUpsert,
    placeholder,
    options,
    disabled,
    validator,
    validationMessage
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [error, setError] = useState<string | null>(null);

    const safeOptions = Array.isArray(options) ? options : [];
    const filtered = safeOptions.filter(opt => opt && opt.toLowerCase().includes(search.toLowerCase()));
    const exactMatch = safeOptions.some(opt => opt === search);

    useEffect(() => {
        if (isOpen) {
            setSearch("");
            setError(null);
        }
    }, [isOpen]);

    const handleInputChange = (val: string) => {
        setSearch(val);
        onChange(val); // Update state in real-time
        if (validator && val && !validator(val)) {
            setError(validationMessage || "形式が無効です");
        } else {
            setError(null);
        }
    };

    const handleCreateNew = () => {
        if (validator && !validator(search)) {
            if (!confirm(`表記ルールに違反しています: \n${validationMessage}\n\nそれでも登録しますか？`)) {
                return;
            }
        }
        if (onUpsert) {
            onUpsert(search);
        }
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <div
                className={cn(
                    "flex h-9 w-full items-center justify-between rounded-md border border-input bg-zinc-50 px-3 py-2 text-sm shadow-sm cursor-pointer",
                    disabled ? "opacity-50 pointer-events-none" : "hover:bg-accent",
                    value ? "font-bold text-zinc-900" : "text-muted-foreground"
                )}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                {value ? value : (placeholder || "選択してください")}
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-white dark:bg-zinc-800 p-1 shadow-xl">
                    <Input
                        className="h-8 mb-1"
                        placeholder="検索または入力..."
                        value={search}
                        onChange={(e) => handleInputChange(e.target.value)}
                        autoFocus
                    />
                    {error && <p className="text-[10px] text-red-500 pl-1 font-bold">{error}</p>}

                    <div className="max-h-[200px] overflow-auto">
                        {filtered.length === 0 && search && !exactMatch ? (
                            <div className="p-2 text-sm text-blue-600 cursor-pointer hover:bg-blue-50 font-bold" onClick={handleCreateNew}>
                                + "{search}" を使用/登録
                            </div>
                        ) : (
                            filtered.map(opt => (
                                <div key={opt} className="p-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                                    onClick={() => { onChange(opt); setIsOpen(false); }}>
                                    {opt}
                                </div>
                            ))
                        )}
                        {filtered.length === 0 && !search && <div className="p-2 text-xs text-muted-foreground">入力して検索...</div>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default function PricingManagerPage() {
    const [rules, setRules] = useState<any[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form States
    const [brand, setBrand] = useState("");
    const [model, setModel] = useState("");
    const [caliber, setCaliber] = useState("");
    const [workName, setWorkName] = useState("");
    const [minPrice, setMinPrice] = useState("");
    const [maxPrice, setMaxPrice] = useState("");
    const [customerType, setCustomerType] = useState("individual");
    const [notes, setNotes] = useState("");

    // Options
    const [brandOptions, setBrandOptions] = useState<string[]>([]);
    const [modelOptions, setModelOptions] = useState<string[]>([]);
    const [calOptions, setCalOptions] = useState<string[]>([]);

    useEffect(() => {
        const loadBase = async () => {
            const [bRaw, cRaw] = await Promise.all([getBrands(), getCalibers()]);
            setBrandOptions(bRaw.map(b => b.name));
            setCalOptions(cRaw.map(c => c.name));
        };
        loadBase();
        refreshList();
    }, []);

    useEffect(() => {
        const loadOptions = async () => {
            if (!brand) {
                setModelOptions([]);
                const allCals = await getCalibers();
                setCalOptions(allCals.map(c => c.name));
                return;
            }

            const brandsList = await getBrands();
            const b = brandsList.find(x => x.name === brand);
            if (!b) return;

            // Load Models
            const mRaw = await getModels(b.id);
            setModelOptions(mRaw.map(m => m.nameJp));

            // Load Narrowed Calibers
            const m = model ? mRaw.find(x => x.nameJp === model) : null;
            const narrowedCals = await getCalibersForModel(b.id, m?.id);
            setCalOptions(narrowedCals.map(c => c.name));
        };
        loadOptions();
    }, [brand, model]);

    const handleBrandUpsert = async (val: string) => {
        await upsertBrand(val);
        setBrand(val);
        const updated = await getBrands();
        setBrandOptions(updated.map(b => b.name));
    };

    const handleModelUpsert = async (val: string) => {
        await upsertModel(brand, val);
        setModel(val);
        const brandsList = await getBrands();
        const b = brandsList.find(x => x.name === brand);
        if (b) {
            const updated = await getModels(b.id);
            setModelOptions(updated.map(m => m.nameJp));
        }
    };

    const handleCaliberUpsert = async (val: string) => {
        const brandsList = await getBrands();
        const b = brandsList.find(x => x.name === brand);
        await upsertCaliber(val, b?.id);
        setCaliber(val);
        const updated = await getCalibers(b?.id);
        setCalOptions(updated.map(c => c.name));
    };

    const refreshList = async () => {
        const res = await fetch("/api/masters/pricing");
        const data = await res.json();
        if (Array.isArray(data)) setRules(data);
    };

    const handleClearForm = () => {
        setEditingId(null);
        setWorkName("");
        setMinPrice("");
        setMaxPrice("");
        setNotes("");
    };

    const handleSelectRule = (rule: any) => {
        setEditingId(rule.id);
        setBrand(rule.brandName);
        setModel(rule.modelName);
        setCaliber(rule.caliberName);
        setWorkName(rule.workName);
        setMinPrice(String(rule.minPrice));
        setMaxPrice(String(rule.maxPrice));
        setCustomerType(rule.customerType);
        setNotes(rule.notes);
    };

    const handleSave = async () => {
        if (!workName || !minPrice) {
            alert("作業名と価格は必須です");
            return;
        }

        // Check duplicates with notes
        if (!editingId) {
            const exists = rules.find(r =>
                r.brandName === brand &&
                r.workName === workName &&
                r.notes === notes
            );
            if (exists) {
                if (!confirm("同じブランド、作業名、備考のマスタが既に存在します。重複して登録しますか？")) return;
            }
        }

        const payload = {
            brandName: brand,
            modelName: model,
            caliberName: caliber,
            workName,
            minPrice,
            maxPrice: maxPrice || minPrice,
            customerType,
            notes
        };

        const res = await fetch(editingId ? `/api/masters/pricing/${editingId}` : "/api/masters/pricing", {
            method: editingId ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            refreshList();
            handleClearForm();
            alert("保存しました");
        } else {
            alert("保存に失敗しました");
        }
    };

    const handleDelete = async () => {
        if (!editingId || !confirm("本当に削除しますか？")) return;
        const res = await fetch(`/api/masters/pricing/${editingId}`, { method: "DELETE" });
        if (res.ok) {
            refreshList();
            handleClearForm();
            alert("削除しました");
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-6 flex gap-6 font-sans">
            {/* List */}
            <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
                        <Settings className="w-6 h-6 text-blue-600" /> 作業内容・料金マスタ (Pricing Master)
                    </h1>
                </div>

                <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                    <div className="grid grid-cols-12 bg-slate-100 border-b text-[11px] font-bold text-slate-500 py-2.5 px-4 uppercase tracking-wider">
                        <div className="col-span-2">ブランド / モデル</div>
                        <div className="col-span-2">作業内容</div>
                        <div className="col-span-2">対象(Cal/Ref)</div>
                        <div className="col-span-3">備考 (区分管理)</div>
                        <div className="col-span-2 text-right">参考価格</div>
                        <div className="col-span-1"></div>
                    </div>
                    <div className="divide-y max-h-[75vh] overflow-y-auto">
                        {rules.map(rule => (
                            <div
                                key={rule.id}
                                onClick={() => handleSelectRule(rule)}
                                className={cn(
                                    "grid grid-cols-12 py-3 px-4 text-sm items-center cursor-pointer transition-all",
                                    editingId === rule.id ? "bg-blue-50/50 border-l-4 border-l-blue-600" : "hover:bg-slate-50"
                                )}
                            >
                                <div className="col-span-2">
                                    <div className="font-bold text-slate-900">{rule.brandName || "Common"}</div>
                                    <div className="text-[10px] text-slate-400 font-medium">{rule.modelName}</div>
                                </div>
                                <div className="col-span-2 font-medium text-slate-700">{rule.workName}</div>
                                <div className="col-span-2">
                                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">
                                        {rule.caliberName || "Generic"}
                                    </span>
                                </div>
                                <div className="col-span-3">
                                    {rule.notes ? (
                                        <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                                            {rule.notes}
                                        </span>
                                    ) : <span className="text-slate-300 text-xs">-</span>}
                                </div>
                                <div className="col-span-2 text-right font-mono font-bold text-slate-900">
                                    ¥{rule.minPrice.toLocaleString()} {rule.maxPrice > rule.minPrice && `~ ¥${rule.maxPrice.toLocaleString()}`}
                                </div>
                                <div className="col-span-1 text-right text-slate-300">
                                    {editingId === rule.id && <Save className="w-4 h-4 ml-auto" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Editor */}
            <Card className="w-[380px] p-5 shadow-xl border-t-4 border-t-blue-600 h-fit sticky top-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-bold text-lg">{editingId ? "マスタ項目を編集" : "新規料金登録"}</h2>
                    {editingId && <Button variant="ghost" size="sm" onClick={handleClearForm} className="text-xs h-7">新規へ</Button>}
                </div>

                <div className="space-y-4">
                    <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-500 uppercase">ブランド</Label>
                            <AdvancedCombobox
                                value={brand}
                                onChange={setBrand}
                                onUpsert={handleBrandUpsert}
                                options={brandOptions}
                                placeholder="ROLEX..."
                                validator={MasterValidators.brand}
                                validationMessage={ValidationMessages.brand}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-500 uppercase">モデル</Label>
                            <AdvancedCombobox
                                value={model}
                                onChange={setModel}
                                onUpsert={handleModelUpsert}
                                options={modelOptions}
                                placeholder="DATEJUST..."
                                disabled={!brand}
                                validator={MasterValidators.model}
                                validationMessage={ValidationMessages.model}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-500 uppercase">対象キャリバー/型番</Label>
                            <AdvancedCombobox
                                value={caliber}
                                onChange={setCaliber}
                                onUpsert={handleCaliberUpsert}
                                options={calOptions}
                                placeholder="3135 / 16233..."
                                validator={MasterValidators.ref}
                                validationMessage={ValidationMessages.ref}
                            />
                        </div>
                    </div>

                    <div className="space-y-3 pt-2">
                        <div className="space-y-1.5">
                            <Label className="text-sm font-bold">作業内容名称</Label>
                            <Input value={workName} onChange={e => setWorkName(e.target.value)} placeholder="オーバーホール等" className="font-bold" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold">最低価格 (¥)</Label>
                                <Input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="font-mono text-right" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold">最高価格 (¥)</Label>
                                <Input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="任意" className="font-mono text-right" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-sm font-bold flex items-center gap-1.5">
                                備考・区分 <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 rounded-full border border-blue-100">重複キー</span>
                            </Label>
                            <Input
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="中古、ジェネリック、18K等"
                                className="bg-amber-50/30 border-amber-200/50"
                            />
                            <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                                ※ここが異なれば、他の項目が同じでも別レコードとして登録されます。
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                        {editingId && (
                            <Button variant="destructive" className="flex-1 py-6" onClick={handleDelete}>削除</Button>
                        )}
                        <Button className="flex-[2] py-6 bg-blue-600 hover:bg-blue-700 font-bold gap-2 text-base" onClick={handleSave}>
                            <Save className="w-5 h-5" /> {editingId ? "更新する" : "マスタ登録"}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
