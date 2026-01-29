"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, Package, Save, ArrowLeft, LayoutDashboard, FileText, X, Camera, Loader2, ImageIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PartItem } from "@/lib/masterData";
import { MasterValidators, ValidationMessages } from "@/lib/validators";
import { getBrands, getModels, getCalibers, getCalibersForModel, upsertBrand, upsertModel, upsertCaliber, getRefsByModel, upsertRef } from "@/actions/master-actions";

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

    // When open, we show search. When closed, we show the current value.
    const displayValue = isOpen ? search : value;

    useEffect(() => {
        if (!isOpen) {
            setSearch("");
            setError(null);
        }
    }, [isOpen]);

    const handleFocus = () => {
        setIsOpen(true);
    };

    const handleInputChange = (val: string) => {
        setSearch(val);
        onChange(val);
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
            <Input
                className={cn(
                    "h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
                    disabled ? "opacity-50 pointer-events-none" : "hover:bg-accent",
                    value && !isOpen ? "font-bold" : "text-muted-foreground"
                )}
                placeholder={placeholder || "選択または入力..."}
                value={displayValue}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={handleFocus}
                onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                disabled={disabled}
            />
            {error && <p className="text-[10px] text-red-500 pl-1 font-bold absolute -bottom-4">{error}</p>}

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-white dark:bg-zinc-800 shadow-lg p-1 max-h-[200px] overflow-auto">
                    {value && (
                        <div className="p-1.5 text-xs text-red-500 cursor-pointer hover:bg-red-50 flex items-center gap-1 font-bold"
                            onClick={() => { onChange(""); setIsOpen(false); }}>
                            <X className="w-3 h-3" /> 選択をクリア
                        </div>
                    )}
                    {filtered.length === 0 && search && !safeOptions.includes(search) ? (
                        <div className="p-2 text-sm text-blue-600 cursor-pointer hover:bg-blue-50 font-bold" onClick={handleCreateNew}>
                            + "{search}" を新規登録
                        </div>
                    ) : (
                        filtered.map(opt => (
                            <div key={opt} className="p-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                                onClick={() => { onChange(opt); setIsOpen(false); }}>
                                {opt}
                            </div>
                        ))
                    )}
                    {filtered.length === 0 && !search && (
                        <div className="p-2 text-xs text-muted-foreground italic text-center">既存の候補がありません</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default function PartsManagerPage() {
    // --- State ---
    const [mode, setMode] = useState<"internal" | "external">("internal");
    const [partsList, setPartsList] = useState<PartItem[]>([]);

    const [editingId, setEditingId] = useState<string | null>(null);

    const [brand, setBrand] = useState("");
    const [model, setModel] = useState("");
    const [refName, setRefName] = useState("");
    const [caliber, setCaliber] = useState("");

    const [partName, setPartName] = useState("");
    const [partRef, setPartRef] = useState("");

    const [costPrice, setCostPrice] = useState("");
    const [retailPrice, setRetailPrice] = useState("");

    const [stock, setStock] = useState("0");
    const [supplier, setSupplier] = useState("");
    const [notes, setNotes] = useState("");
    const [photoKey, setPhotoKey] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

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

            const mRaw = await getModels(b.id);
            setModelOptions(mRaw.map(m => m.nameJp || m.name));

            const m = model ? mRaw.find(x => x.nameJp === model || x.name === model) : null;
            const narrowedCals = await getCalibersForModel(b.id, m?.id);
            setCalOptions(narrowedCals.map(c => c.name));
        };
        loadOptions();
    }, [brand, model]);

    useEffect(() => {
        const loadRefs = async () => {
            if (!model || !brand) {
                setRefOptions([]);
                return;
            }
            const bList = await getBrands();
            const b = bList.find(x => x.name === brand);
            if (!b) return;
            const mRaw = await getModels(b.id);
            const m = mRaw.find(x => x.nameJp === model || x.name === model);

            if (m) {
                const refs = await getRefsByModel(m.id);
                setRefOptions(refs.map(r => r.name));
            } else {
                setRefOptions([]);
            }
        };
        loadRefs();
    }, [model, brand]);

    const refreshList = async () => {
        try {
            const res = await fetch(`/api/parts?type=${mode}`);
            const data = await res.json();
            if (res.ok && Array.isArray(data)) {
                setPartsList(data);
            }
        } catch (e) {
            console.error("Failed to load parts", e);
        }
    };

    useEffect(() => {
        refreshList();
        handleClearForm();
    }, [mode]);

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

    const handleSelectPart = (part: PartItem) => {
        setEditingId(part.id);
        const p = part;
        setBrand(p.brand || "");
        setPartName(p.name);
        setPartRef(p.ref);
        setCostPrice(String(p.costPrice));
        setRetailPrice(String(p.retailPrice));
        setStock(String(p.stock));
        setSupplier(p.supplier || "");
        setNotes(p.notes || "");
        setPhotoKey(p.photoKey || null);

        if (p.type === 'internal') {
            setCaliber(p.targetId || "");
            setModel("");
        }
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
        setPhotoKey(null);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        if (editingId) formData.append("partId", editingId);

        try {
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            const data = await res.json();
            if (res.ok && data.storageKey) {
                setPhotoKey(data.storageKey);
            } else {
                alert("アップロードに失敗しました");
            }
        } catch (err) {
            console.error(err);
            alert("エラーが発生しました");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
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
                notes: notes,
                photoKey: photoKey
            };

            let res;
            if (editingId) {
                res = await fetch(`/api/parts/${editingId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch("/api/parts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            }

            if (!res.ok) throw new Error("Operation failed");
            refreshList();
            handleClearForm();
            alert("保存しました");
        } catch (e) {
            alert("処理に失敗しました");
        }
    };

    const handleDelete = async () => {
        if (!editingId || !confirm("本当に削除しますか？")) return;
        try {
            const res = await fetch(`/api/parts/${editingId}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Delete failed");
            refreshList();
            handleClearForm();
            alert("削除しました");
        } catch (e) {
            alert("削除に失敗しました");
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
        const bList = await getBrands();
        const b = bList.find(x => x.name === brand);
        if (b) {
            const updated = await getModels(b.id);
            setModelOptions(updated.map(m => m.nameJp || m.name));
        }
    };

    const handleCaliberUpsert = async (val: string) => {
        const bList = await getBrands();
        const b = bList.find(x => x.name === brand);
        await upsertCaliber(val, b?.id);
        setCaliber(val);
        const updated = await getCalibers(b?.id);
        setCalOptions(updated.map(c => c.name));
    };

    const handleRefUpsert = async (val: string) => {
        const bList = await getBrands();
        const b = bList.find(x => x.name === brand);
        if (b) {
            const mRaw = await getModels(b.id);
            const m = mRaw.find(x => x.nameJp === model || x.name === model);
            if (m) {
                await upsertRef(m.name, brand, val);
                setRefName(val);
                const updated = await getRefsByModel(m.id);
                setRefOptions(updated.map(r => r.name));
            }
        }
    };

    const safePartsList = Array.isArray(partsList) ? partsList : [];
    const filteredParts = safePartsList.filter(p => p.type === mode);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 font-sans text-zinc-900 dark:text-zinc-100 flex gap-4">
            <div className="flex-1 flex flex-col gap-4">
                <div className="flex items-center gap-4 mb-2">
                    <Link href="/admin"><Button variant="ghost" size="sm"><LayoutDashboard className="w-4 h-4 mr-2" /> ダッシュボード</Button></Link>
                    <Link href="/repairs"><Button variant="ghost" size="sm"><FileText className="w-4 h-4 mr-2" /> 修理一覧</Button></Link>
                </div>
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="w-6 h-6" /> 部品マスタ管理</h1>
                    <div className="flex bg-zinc-200 rounded-lg p-1">
                        <button onClick={() => setMode("internal")} className={cn("px-4 py-1.5 text-sm font-bold rounded-md transition-all", mode === "internal" ? "bg-white shadow text-blue-700" : "text-zinc-500 hover:text-zinc-700")}>内装</button>
                        <button onClick={() => setMode("external")} className={cn("px-4 py-1.5 text-sm font-bold rounded-md transition-all", mode === "external" ? "bg-white shadow text-green-700" : "text-zinc-500 hover:text-zinc-700")}>外装</button>
                    </div>
                </div>

                <div className="bg-white border rounded-md shadow-sm overflow-hidden flex-1">
                    <div className="grid grid-cols-12 bg-zinc-100 border-b text-xs font-bold text-zinc-500 py-2 px-4 italic">
                        <div className="col-span-1">区分</div>
                        <div className="col-span-3">部品名 / Ref</div>
                        <div className="col-span-2 text-center">ターゲット</div>
                        <div className="col-span-3">仕入先 / 備考</div>
                        <div className="col-span-2 text-right">価格</div>
                        <div className="col-span-1 text-center">在庫</div>
                    </div>
                    <div className="overflow-y-auto max-h-[75vh]">
                        {filteredParts.length === 0 ? (
                            <div className="p-8 text-center text-zinc-400">データがありません</div>
                        ) : (
                            filteredParts.map(part => (
                                <div key={part.id} onClick={() => handleSelectPart(part)} className={cn("grid grid-cols-12 border-b py-3 px-4 text-sm cursor-pointer transition-colors items-center", editingId === part.id ? "bg-blue-50 border-blue-200" : "hover:bg-zinc-50")}>
                                    <div className="col-span-1 flex items-center justify-center">
                                        <div className="relative w-8 h-8 rounded border overflow-hidden bg-zinc-100 flex items-center justify-center">
                                            {part.photoKey ? <img src={part.photoKey} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-zinc-300" />}
                                            <div className={cn("absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white", part.type === "internal" ? "bg-blue-500" : "bg-green-500")} />
                                        </div>
                                    </div>
                                    <div className="col-span-3"><div className="font-bold text-zinc-800">{part.name}</div><div className="text-xs text-zinc-500 font-mono">{part.ref}</div></div>
                                    <div className="col-span-2 text-center text-xs font-bold text-zinc-600 bg-zinc-100 py-1 rounded-sm mx-2">{part.targetId}</div>
                                    <div className="col-span-3 text-xs text-zinc-500"><div className="font-bold">{part.supplier || "-"}</div><div className="truncate text-[10px]" title={part.notes}>{part.notes}</div></div>
                                    <div className="col-span-2 text-right font-mono text-xs"><div className="text-zinc-400">¥{part.costPrice.toLocaleString()}</div><div className="text-zinc-900 font-bold">¥{part.retailPrice.toLocaleString()}</div></div>
                                    <div className="col-span-1 text-center font-bold">{part.stock}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <Card className={cn("w-[360px] p-4 flex flex-col gap-4 h-fit border-l-4 shadow-xl transition-all", editingId ? "border-l-orange-500 bg-orange-50/10" : "border-l-blue-500")}>
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                        {editingId ? <Package className="w-5 h-5 text-orange-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
                        <h2 className="font-bold text-lg">{editingId ? "編集" : "新規登録"}</h2>
                    </div>
                </div>

                <div className="space-y-3 bg-zinc-100/50 p-3 rounded-md border border-zinc-200 shadow-inner">
                    <div className="space-y-1">
                        <Label className="text-[10px] text-zinc-500 uppercase font-bold px-1">ブランド</Label>
                        <AdvancedCombobox value={brand} onChange={setBrand} onUpsert={handleBrandUpsert} options={brandOptions} placeholder="ROLEX..." validator={MasterValidators.brand} />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] text-zinc-500 uppercase font-bold px-1">モデル</Label>
                        <AdvancedCombobox value={model} onChange={setModel} onUpsert={handleModelUpsert} options={modelOptions} placeholder="DATEJUST..." disabled={!brand} />
                    </div>
                    {mode === "internal" ? (
                        <div className="space-y-1">
                            <Label className="text-[10px] text-blue-600 uppercase font-bold px-1">対象キャリバー</Label>
                            <AdvancedCombobox value={caliber} onChange={setCaliber} onUpsert={handleCaliberUpsert} options={calOptions} placeholder="Cal.3135..." />
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <Label className="text-[10px] text-green-600 uppercase font-bold px-1">対象Ref</Label>
                            <AdvancedCombobox value={refName} onChange={setRefName} onUpsert={handleRefUpsert} options={refOptions} placeholder="Ref.16233..." />
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label className="text-xs">部品名</Label><Input value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="ゼンマイ..." /></div>
                        <div className="space-y-1"><Label className="text-xs">部品Ref</Label><Input value={partRef} onChange={(e) => setPartRef(e.target.value)} placeholder="B-100..." className="font-mono" /></div>
                    </div>
                    <div className="bg-blue-50 p-2 rounded-sm space-y-2 border border-blue-100">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1"><Label className="text-xs">仕入 (Cost)</Label><Input type="number" value={costPrice} onChange={(e) => handleCostChange(e.target.value)} className="text-right" /></div>
                            <div className="space-y-1"><Label className="text-xs text-blue-700 font-bold">上代 (Retail)</Label><Input type="number" value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} className="text-right font-bold text-blue-800" /></div>
                        </div>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">仕入れ先</Label><AdvancedCombobox value={supplier} onChange={setSupplier} options={supplierOptions} /></div>
                    <div className="space-y-1"><Label className="text-xs">備考 / メモ</Label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px] w-full rounded-md border p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" /></div>

                    <div className="space-y-1">
                        <Label className="text-xs">部品写真</Label>
                        <div className="relative aspect-video rounded-md border-2 border-dashed flex flex-col items-center justify-center cursor-pointer overflow-hidden group hover:border-blue-400 hover:bg-blue-50/30" onClick={() => !isUploading && fileInputRef.current?.click()}>
                            {isUploading ? <Loader2 className="w-6 h-6 animate-spin text-blue-500" /> : photoKey ? <img src={photoKey} alt="" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-zinc-400" />}
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end items-center"><Label className="text-xs">在庫</Label><Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="w-20 text-center" /></div>
                </div>

                <div className="flex gap-2">
                    {editingId && <Button variant="destructive" className="flex-1" onClick={handleDelete}>削除</Button>}
                    <Button className={cn("flex-[2] gap-2", editingId ? "bg-orange-600 hover:bg-orange-700" : "bg-blue-600 hover:bg-blue-700")} onClick={handleSave}><Save className="w-4 h-4" /> {editingId ? "更新" : "登録"}</Button>
                </div>
            </Card>
        </div>
    );
}
