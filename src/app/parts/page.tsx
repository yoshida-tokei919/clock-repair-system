"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, Package, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
    MasterService,
    PartItem
} from "@/lib/masterData";
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
        onChange(val); // Allow real-time parent state update for "free editing"
        if (validator && val && !validator(val)) {
            setError(validationMessage || "形式が無効です");
        } else {
            setError(null);
        }
    };

    const handleCreateNew = () => {
        if (validator && !validator(search)) {
            if (!confirm(`表記ルールに違反しています: \n${validationMessage}\n\nそれでも登録しますカ？`)) {
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
                    "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm cursor-pointer",
                    disabled ? "opacity-50 pointer-events-none" : "hover:bg-accent",
                    value ? "font-bold" : "text-muted-foreground"
                )}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                {value ? value : (placeholder || "選択してください")}
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md bg-white dark:bg-zinc-800 p-1">
                    <Input
                        className="h-8 mb-1"
                        placeholder="検索または入力..."
                        value={search}
                        onChange={(e) => handleInputChange(e.target.value)}
                        autoFocus
                    />
                    {error && <p className="text-xs text-red-500 pl-1 font-bold">{error}</p>}

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

export default function PartsManagerPage() {
    // --- State ---
    const [mode, setMode] = useState<"internal" | "external">("internal");
    const [partsList, setPartsList] = useState<PartItem[]>([]); // Init empty array

    // Edit Mode State
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form States
    const [brand, setBrand] = useState("");
    const [model, setModel] = useState("");
    const [refName, setRefName] = useState("");
    const [caliber, setCaliber] = useState("");

    const [partName, setPartName] = useState("");
    const [partRef, setPartRef] = useState("");

    // Pricing
    const [costPrice, setCostPrice] = useState("");
    const [retailPrice, setRetailPrice] = useState("");

    const [stock, setStock] = useState("0");
    const [supplier, setSupplier] = useState("");
    const [notes, setNotes] = useState("");

    // Options
    const [brandOptions, setBrandOptions] = useState<string[]>([]);
    const [modelOptions, setModelOptions] = useState<string[]>([]);
    const [refOptions, setRefOptions] = useState<string[]>([]);
    const [calOptions, setCalOptions] = useState<string[]>([]);

    const supplierOptions = ["eBay", "Yahooオークション", "Chrono24", "国内業者A", "国内業者B", "その他"];

    // --- Effects ---
    useEffect(() => {
        const loadInitial = async () => {
            const [bRaw, cRaw] = await Promise.all([getBrands(), getCalibers()]);
            setBrandOptions(bRaw.map(b => b.name));
            setCalOptions(cRaw.map(c => c.name));
        };
        loadInitial();
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

            // Fetch Models
            const mRaw = await getModels(b.id);
            setModelOptions(mRaw.map(m => m.nameJp));

            // Fetch Calibers (Narrowed)
            const m = model ? mRaw.find(x => x.nameJp === model) : null;
            const narrowedCals = await getCalibersForModel(b.id, m?.id);
            setCalOptions(narrowedCals.map(c => c.name));
        };
        loadOptions();
    }, [brand, model]);

    useEffect(() => {
        // Ref options narrowing (Optional, keeping MasterService for now or migrating if logic exists)
        setRefOptions(MasterService.getRefsForModel(model));
    }, [model]);

    const refreshList = async () => {
        try {
            const res = await fetch(`/api/parts?type=${mode}`);
            const data = await res.json();

            if (res.ok && Array.isArray(data)) {
                setPartsList(data);
            } else {
                console.error("API Error or Invalid Data:", data);
            }
        } catch (e) {
            console.error("Failed to load parts", e);
        }
    };

    // Reload when mode changes
    useEffect(() => {
        refreshList();
        // Clear edit mode if switching type? Usually safer.
        handleClearForm();
    }, [mode]);

    // Auto-Calc Logic
    const handleCostChange = (val: string) => {
        setCostPrice(val);
        const cost = parseInt(val);
        if (!isNaN(cost)) {
            const retail = Math.round(cost * 1.55);
            setRetailPrice(retail.toString());
        } else {
            setRetailPrice("");
        }
    };

    // --- Actions ---
    const handleSelectPart = (part: PartItem) => {
        setEditingId(part.id);
        const p = part;
        setBrand(p.brand || "");
        // TargetId logic is fuzzy in mapping, so we might not perfectly restore Model/Caliber unless API returns them explicitly.
        // Current API `GET` returns `brand` name. `targetId`.
        // If internal, targetId is caliber name.
        if (p.type === 'internal') {
            setCaliber(p.targetId || "");
            setModel("");
            setRefName("");
        } else {
            // If external, targetId might be Ref name or Model name? 
            // In API GET, `targetId` is `p.nameEn`. 
            // Wait, standard GET mapping (line 32) says: `targetId: p.category === 'internal' ? p.caliber?.name : p.nameEn`.
            // For external, it doesn't give us Model/Ref clearly unless we fix GET. 
            // But let's just populate what we have.
            setModel("");
            setRefName("");
        }

        setPartName(p.name);
        setPartRef(p.ref);
        setCostPrice(String(p.costPrice));
        setRetailPrice(String(p.retailPrice));
        setStock(String(p.stock));
        setSupplier(p.supplier || "");
        setNotes(p.notes || "");
    };

    const handleClearForm = () => {
        setEditingId(null);
        setPartName("");
        setPartRef("");
        setCostPrice("");
        setRetailPrice("");
        setStock("0");
        setSupplier("");
        setNotes("");
        // Keep Brand/Caliber context? Maybe useful. 
        // But reset is clearer.
    };

    const handleSave = async () => {
        try {
            const payload = {
                type: mode,
                brandName: brand,
                modelName: model,
                caliberName: caliber,
                targetId: mode === 'internal' ? caliber : model,
                name: partName,
                ref: partRef,
                costPrice: parseInt(costPrice) || 0,
                retailPrice: parseInt(retailPrice) || 0,
                stock: parseInt(stock) || 0,
                supplier: supplier,
                notes: notes
            };

            // Check if a similar item exists (excluding ID) to warn user
            if (!editingId) {
                const similar = safePartsList.find(p =>
                    p.brand === brand &&
                    p.name === partName &&
                    p.ref === partRef &&
                    p.notes === notes
                );
                if (similar) {
                    if (!confirm("全く同じブランド、部品名、型番、備考の部品が既に登録されています。重複して登録しますか？")) {
                        return;
                    }
                }
            }

            let res;
            if (editingId) {
                // UPDATE
                res = await fetch(`/api/parts/${editingId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            } else {
                // CREATE
                res = await fetch("/api/parts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            }

            if (!res.ok) throw new Error("Operation failed");

            refreshList();
            handleClearForm();
            alert(editingId ? "更新しました" : "登録しました");
        } catch (e) {
            alert("処理に失敗しました");
            console.error(e);
        }
    };

    const handleDelete = async () => {
        if (!editingId) return;
        if (!confirm("本当に削除しますか？")) return;

        try {
            const res = await fetch(`/api/parts/${editingId}`, {
                method: "DELETE"
            });
            if (!res.ok) throw new Error("Delete failed");

            refreshList();
            handleClearForm();
            alert("削除しました");
        } catch (e) {
            alert("削除に失敗しました");
            console.error(e);
        }
    };

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
    const handleRefUpsert = async (val: string) => {
        // Keeping Ref fallback for now if logic is not yet in MasterActions
        MasterService.upsertRef(model, val);
        setRefName(val);
    };

    const safePartsList = Array.isArray(partsList) ? partsList : [];
    const filteredParts = safePartsList.filter(p => p.type === mode);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 font-sans text-zinc-900 dark:text-zinc-100 flex gap-4">

            {/* LEFT: Inventory List */}
            <div className="flex-1 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Package className="w-6 h-6" /> 部品在庫管理 (Parts Manager)
                    </h1>
                    <div className="flex bg-zinc-200 rounded-lg p-1">
                        <button
                            onClick={() => setMode("internal")}
                            className={cn("px-4 py-1.5 text-sm font-bold rounded-md transition-all", mode === "internal" ? "bg-white shadow text-blue-700" : "text-zinc-500 hover:text-zinc-700")}
                        >
                            内装 (Caliber)
                        </button>
                        <button
                            onClick={() => setMode("external")}
                            className={cn("px-4 py-1.5 text-sm font-bold rounded-md transition-all", mode === "external" ? "bg-white shadow text-green-700" : "text-zinc-500 hover:text-zinc-700")}
                        >
                            外装 (Ref/Model)
                        </button>
                    </div>
                </div>

                <div className="bg-white border rounded-md shadow-sm overflow-hidden flex-1">
                    <div className="grid grid-cols-12 bg-zinc-100 border-b text-xs font-bold text-zinc-500 py-2 px-4">
                        <div className="col-span-1">区分</div>
                        <div className="col-span-3">部品名 / Ref</div>
                        <div className="col-span-2">ターゲット</div>
                        <div className="col-span-2">仕入先 / 備考</div>
                        <div className="col-span-3 text-right">価格 (仕入 / 上代)</div>
                        <div className="col-span-1 text-center">在庫</div>
                    </div>
                    <div className="overflow-y-auto max-h-[70vh]">
                        {filteredParts.length === 0 ? (
                            <div className="p-8 text-center text-zinc-400">データがありません</div>
                        ) : (
                            filteredParts.map(part => (
                                <div key={part.id}
                                    onClick={() => handleSelectPart(part)}
                                    className={cn(
                                        "grid grid-cols-12 border-b py-3 px-4 text-sm cursor-pointer transition-colors items-center",
                                        editingId === part.id ? "bg-blue-50 border-blue-200" : "hover:bg-zinc-50"
                                    )}>
                                    <div className="col-span-1">
                                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold border", part.type === "internal" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200")}>
                                            {part.type === "internal" ? "内" : "外"}
                                        </span>
                                    </div>
                                    <div className="col-span-3">
                                        <div className="font-bold text-zinc-800">{part.name}</div>
                                        <div className="text-xs text-zinc-500 font-mono">{part.ref}</div>
                                    </div>
                                    <div className="col-span-2 text-xs text-zinc-600">
                                        {part.targetId === "c2" ? "Cal.3135" : part.targetId}
                                    </div>
                                    <div className="col-span-2 text-xs text-zinc-500">
                                        <div className="font-bold">{part.supplier || "-"}</div>
                                        <div className="truncate text-[10px]" title={part.notes}>{part.notes}</div>
                                    </div>
                                    <div className="col-span-3 text-right font-mono text-xs">
                                        <div className="text-zinc-400">¥{part.costPrice.toLocaleString()}</div>
                                        <div className="text-zinc-900 font-bold">¥{part.retailPrice.toLocaleString()}</div>
                                    </div>
                                    <div className="col-span-1 text-center font-bold">
                                        {part.stock}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* RIGHT: Add Form */}
            <Card className={cn("w-[350px] p-4 flex flex-col gap-4 h-fit border-l-4 shadow-lg transition-colors", editingId ? "border-l-orange-500 bg-orange-50/10" : "border-l-blue-500")}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        {editingId ? <Package className="w-5 h-5 text-orange-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
                        <h2 className="font-bold text-lg">{editingId ? "部品情報を編集" : "新規部品登録"}</h2>
                    </div>
                    {editingId && (
                        <Button variant="ghost" size="sm" onClick={handleClearForm} className="text-xs text-zinc-500 h-6">
                            新規へ戻る
                        </Button>
                    )}
                </div>

                {/* Context Selection */}
                <div className="space-y-4 bg-zinc-50 p-3 rounded-md border">
                    <div className="space-y-1">
                        <Label className="text-xs text-zinc-500">ブランド</Label>
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

                    <div className="space-y-1">
                        <Label className="text-xs text-zinc-500">モデル</Label>
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

                    {mode === "internal" ? (
                        <div className="space-y-1">
                            <Label className="text-xs text-blue-600 font-bold">対象キャリバー (Internal)</Label>
                            <AdvancedCombobox
                                value={caliber}
                                onChange={setCaliber}
                                onUpsert={handleCaliberUpsert}
                                options={calOptions}
                                placeholder="Cal.3135..."
                                validator={MasterValidators.ref}
                                validationMessage={ValidationMessages.ref}
                            />
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <Label className="text-xs text-green-600 font-bold">対象Ref (External)</Label>
                            <AdvancedCombobox
                                value={refName}
                                onChange={setRefName}
                                onUpsert={handleRefUpsert}
                                options={refOptions}
                                placeholder="Ref.16233..."
                                validator={MasterValidators.ref}
                                validationMessage={ValidationMessages.ref}
                            />
                        </div>
                    )}
                </div>

                <hr className="border-zinc-200" />

                {/* Part Details */}
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs">部品名</Label>
                            <Input
                                value={partName}
                                onChange={(e) => setPartName(e.target.value)}
                                placeholder="ゼンマイ..."
                                className="bg-white"
                            />
                            {partName && !MasterValidators.partName(partName) && (
                                <p className="text-[10px] text-red-500">{ValidationMessages.partName}</p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">部品Ref</Label>
                            <Input
                                value={partRef}
                                onChange={(e) => setPartRef(e.target.value)}
                                placeholder="B-100..."
                                className="bg-white font-mono"
                            />
                        </div>
                    </div>

                    {/* Pricing Block */}
                    <div className="bg-blue-50 p-2 rounded-sm space-y-2 border border-blue-100">
                        <div className="flex gap-2">
                            <div className="space-y-1 flex-1">
                                <Label className="text-xs text-zinc-500">仕入価格 (Cost)</Label>
                                <Input
                                    type="number"
                                    value={costPrice}
                                    onChange={(e) => handleCostChange(e.target.value)}
                                    className="bg-white text-right"
                                />
                            </div>
                            <div className="space-y-1 flex-1">
                                <Label className="text-xs text-blue-700 font-bold">上代価格 (Retail)</Label>
                                <Input
                                    type="number"
                                    value={retailPrice}
                                    onChange={(e) => setRetailPrice(e.target.value)}
                                    className="bg-white text-right font-bold text-blue-800"
                                    placeholder="自動計算"
                                />
                            </div>
                        </div>
                        <p className="text-[10px] text-blue-400 text-right">※仕入れ × 1.55 (自動計算)</p>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">仕入れ先 (Supplier)</Label>
                        <AdvancedCombobox
                            value={supplier}
                            onChange={setSupplier}
                            options={supplierOptions}
                            placeholder="eBay, Yahoo..."
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">備考 (Memo)</Label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="flex min-h-[60px] w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="状態やURLなど..."
                        />
                    </div>

                    <div className="space-y-1 max-w-[100px] ml-auto">
                        <Label className="text-xs">初期在庫</Label>
                        <Input
                            type="number"
                            value={stock}
                            onChange={(e) => setStock(e.target.value)}
                            className="bg-white text-center"
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    {editingId && (
                        <Button variant="destructive" className="flex-1" onClick={handleDelete}>
                            削除
                        </Button>
                    )}
                    <Button className={cn("flex-[2] gap-2", editingId ? "bg-orange-600 hover:bg-orange-700" : "bg-blue-600 hover:bg-blue-700")} onClick={handleSave}>
                        <Save className="w-4 h-4" /> {editingId ? "更新する" : "登録する"}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
