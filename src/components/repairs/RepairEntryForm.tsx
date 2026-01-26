"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Camera, Printer, Save, Search, Check, ChevronDown, User, Watch, Settings, Trash2, Plus, Image as ImageIcon, MapPin, Phone, Mail, MessageCircle, Clock, CheckCircle, Smartphone, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MasterService } from "@/lib/masterData";
import { getBrands, getModels, getCalibers, getCalibersForModel, getCalibersForRef, getPricingRules, getPartsMatched, upsertBrand, upsertModel, upsertCaliber, getRefsByModel, upsertRef } from "@/actions/master-actions";
import { LinePreviewModal } from "@/components/line/LinePreviewModal";
import { QuickRegisterDialog, RegisterData } from "@/components/repairs/QuickRegisterDialog";
import { RecentRegistrations } from "@/components/repairs/RecentRegistrations";

// Dynamically import PDF component to avoid SSR issues with @react-pdf/renderer
const PDFPreviewDialog = dynamic(() => import("@/components/repairs/PDFPreviewDialog"), {
    ssr: false,
    loading: () => <Button variant="outline" size="sm" disabled><FileText className="w-4 h-4 mr-1" /> Loading PDF...</Button>
});
const TagPreviewDialog = dynamic(() => import("@/components/repairs/TagPreviewDialog"), {
    ssr: false
});

// --- Types ---
interface WorkItem { id: string; name: string; price: number; }
interface PartItem { id: string; name: string; retailPrice: number; supplier?: string; notes?: string; }
type RepairStatus = "reception" | "diagnosing" | "parts_wait" | "parts_wait_ordered" | "in_progress" | "completed" | "delivered" | "canceled";
interface Partner { id: string; name: string; prefix: string; currentSeq: number; }

const formatPartOption = (p: any) => `${p.name} [${p.supplier || "-"}] - ¥${p.retailPrice.toLocaleString()}`;

// --- Status Timeline Data (Mapping to Internal Keys) ---
const STATUS_STEPS: { id: RepairStatus; label: string }[] = [
    { id: "reception", label: "受付" },
    { id: "diagnosing", label: "見積中" },
    { id: "parts_wait", label: "部品待" },
    { id: "in_progress", label: "作業中" },
    { id: "completed", label: "完了" },
    { id: "delivered", label: "納品済" },
];

const RepairToUIStatus: Record<string, string> = {
    'reception': 'reception',
    'diagnosing': 'diagnosing',
    'parts_wait': 'parts_wait',
    'parts_wait_ordered': 'parts_wait', // Simple UI treats both as parts_wait
    'in_progress': 'in_progress',
    'completed': 'completed',
    'delivered': 'delivered'
};

// --- Inline Components ---
const StatusTimeline: React.FC<{
    currentStatus: RepairStatus;
    statusLog: Record<string, string>;
    onStatusClick: (status: RepairStatus) => void;
    onDateChange: (status: RepairStatus, date: string) => void;
}> = ({ currentStatus, statusLog, onStatusClick, onDateChange }) => {
    const activeStatus = RepairToUIStatus[currentStatus] || currentStatus;
    const currentIndex = STATUS_STEPS.findIndex(s => s.id === activeStatus);

    return (
        <div className="w-full bg-white border-b border-zinc-200 px-4 py-3 mb-2 overflow-x-auto">
            <div className="flex items-center justify-between min-w-[600px]">
                {STATUS_STEPS.map((step, idx) => {
                    const isCompleted = idx <= currentIndex;
                    const isCurrent = step.id === activeStatus;
                    const logDate = statusLog[step.id];
                    let dateValue = "";
                    if (logDate) {
                        try {
                            const d = new Date(logDate);
                            if (!isNaN(d.getTime())) dateValue = d.toISOString().split("T")[0];
                        } catch (e) { }
                    }

                    return (
                        <div key={step.id} className="flex flex-col items-center relative flex-1 group" >
                            {idx < STATUS_STEPS.length - 1 && (
                                <div className={cn("absolute top-3 left-[50%] w-full h-0.5 z-0", idx < currentIndex ? "bg-blue-500" : "bg-zinc-200")} />
                            )}
                            <div
                                className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 transition-all mb-1 cursor-pointer",
                                    isCurrent ? "bg-blue-600 border-blue-600 shadow-md scale-110" :
                                        isCompleted ? "bg-white border-blue-500" : "bg-white border-zinc-300"
                                )}
                                onClick={() => onStatusClick(step.id)}
                            >
                                {isCompleted && <Check className={cn("w-3 h-3 value-none", isCurrent ? "text-white" : "text-blue-500")} />}
                            </div>
                            <span className={cn("text-xs font-bold transition-colors cursor-pointer", isCurrent ? "text-blue-700" : isCompleted ? "text-zinc-700" : "text-zinc-400")} onClick={() => onStatusClick(step.id)}>
                                {step.label}
                            </span>
                            <div className="h-5 mt-1">
                                {isCompleted ? (
                                    <input type="date" className="text-[10px] bg-transparent border-0 text-zinc-500 font-mono w-[80px] text-center focus:outline-none focus:ring-0 cursor-pointer hover:bg-zinc-50 rounded" value={dateValue} onChange={(e) => onDateChange(step.id, e.target.value)} onClick={(e) => e.stopPropagation()} />
                                ) : (
                                    <span className="text-[10px] text-zinc-300">-</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const PartnerRegisterDialog: React.FC<{
    isOpen: boolean; initialName: string; onClose: () => void;
    onRegister: (data: { name: string; prefix: string; address?: string; phone?: string }) => void;
}> = ({ isOpen, initialName, onClose, onRegister }) => {
    const [name, setName] = useState(initialName);
    const [prefix, setPrefix] = useState("");
    const [customPrefix, setCustomPrefix] = useState("");
    const [isCustom, setIsCustom] = useState(false);
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");
    useEffect(() => { setName(initialName); }, [initialName, isOpen]);
    if (!isOpen) return null;
    const handleSave = () => {
        const finalPrefix = isCustom ? customPrefix : prefix;
        if (!name || !finalPrefix) { alert("名前とプレフィックスは必須です"); return; }
        onRegister({ name, prefix: finalPrefix, address, phone });
    };
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-[400px] overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-3 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2"><User className="w-5 h-5" /> 取引先登録</h3>
                    <button onClick={onClose} className="hover:bg-white/20 p-1 rounded"><CheckCircle className="w-5 h-5" /></button>
                </div>
                <div className="p-4 space-y-4">
                    <div><Label>取引先名</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
                    <div><Label>プレフィックス</Label><Input value={isCustom ? customPrefix : prefix} onChange={e => isCustom ? setCustomPrefix(e.target.value) : setPrefix(e.target.value)} placeholder="T, JK, etc..." /></div>
                </div>
                <div className="p-3 bg-zinc-50 border-t flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>キャンセル</Button>
                    <Button onClick={handleSave} className="bg-blue-600">登録</Button>
                </div>
            </div>
        </div>
    );
};

const AdvancedCombobox: React.FC<{
    value: string; onChange: (v: string) => void; onUpsert?: (v: string) => void; placeholder?: string;
    options: { label: string, value: string }[]; disabled?: boolean;
}> = ({ value, onChange, onUpsert, placeholder, options, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const filtered = (options || []).filter(opt => opt.label?.toLowerCase().includes(search.toLowerCase()));
    const selectedLabel = options?.find(o => o.value === value)?.label || value;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false); };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={wrapperRef}>
            <div className={cn("flex h-8 w-full items-center justify-between rounded border border-input bg-white px-2 py-1 text-xs cursor-pointer", disabled ? "opacity-50" : "")} onClick={() => !disabled && setIsOpen(!isOpen)}>
                <span className="truncate">{selectedLabel || placeholder}</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
            </div>
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border rounded shadow-lg p-1 min-w-[200px]">
                    <Input ref={inputRef} autoFocus className="h-7 mb-1 text-xs" placeholder="検索..." value={search} onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()} />
                    <div className="max-h-60 overflow-auto">
                        {onUpsert && search && !options.some(o => o.label === search) && (
                            <div className="p-1 px-2 text-xs text-blue-600 font-bold hover:bg-blue-50 cursor-pointer" onClick={() => { onUpsert(search); setIsOpen(false); }}>+ "{search}" を登録</div>
                        )}
                        {filtered.map(opt => (
                            <div key={opt.value} className="p-1.5 text-xs hover:bg-zinc-100 cursor-pointer rounded" onClick={() => { onChange(opt.value); setIsOpen(false); }}>{opt.label}</div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export function RepairEntryForm({ initialData, mode = 'create' }: { initialData?: any, mode?: 'create' | 'edit' }) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);

    // --- States ---
    const [status, setStatus] = useState<RepairStatus>(initialData?.status || "reception");
    const [statusLog, setStatusLog] = useState<Record<string, string>>(initialData?.statusLog || { "reception": new Date().toLocaleDateString("ja-JP") });

    const [customerCategory, setCustomerCategory] = useState<"B2B" | "B2C">(initialData?.customer?.type === 'business' ? "B2B" : "B2C");
    const [customerName, setCustomerName] = useState(initialData?.customer?.name || "");
    const [contactPerson, setContactPerson] = useState(initialData?.customer?.contact || "");
    const [endUserName, setEndUserName] = useState(initialData?.endUserName || "");
    const [lineId, setLineId] = useState(initialData?.customer?.lineId || initialData?.customer?.phone || "");
    const [address, setAddress] = useState(initialData?.customer?.address || "");

    const [brand, setBrand] = useState(initialData?.watch?.brand?.name || "");
    const [model, setModel] = useState(initialData?.watch?.model?.name || "");
    const [refName, setRefName] = useState(initialData?.watch?.reference?.name || "");
    const [caliber, setCaliber] = useState(initialData?.watch?.caliber?.name || "");
    const [serial, setSerial] = useState(initialData?.watch?.serialNumber || "");
    const [accessories, setAccessories] = useState(initialData?.accessories ? JSON.parse(initialData.accessories).join(", ") : "");

    const [repairType, setRepairType] = useState<"internal" | "external">("internal");
    const [selectedWorks, setSelectedWorks] = useState<WorkItem[]>(initialData?.estimate?.items?.filter((i: any) => i.type === 'labor').map((i: any) => ({ id: i.id.toString(), name: i.itemName, price: i.unitPrice })) || []);
    const [selectedParts, setSelectedParts] = useState<PartItem[]>(initialData?.estimate?.items?.filter((i: any) => i.type === 'part').map((i: any) => ({ id: i.id.toString(), name: i.itemName, retailPrice: i.unitPrice })) || []);

    const [requestContent, setRequestContent] = useState(initialData?.workSummary || "");
    const [internalNotes, setInternalNotes] = useState(initialData?.internalNotes || "");
    const [partnerRef, setPartnerRef] = useState(initialData?.partnerRef || "");
    const [uploadedPhotos, setUploadedPhotos] = useState<any[]>(initialData?.photos || []);

    // --- Options & Masters ---
    const [partners, setPartners] = useState<Partner[]>([]);
    const [brandOptions, setBrandOptions] = useState<any[]>([]);
    const [modelOptions, setModelOptions] = useState<any[]>([]);
    const [refOptions, setRefOptions] = useState<any[]>([]);
    const [calOptions, setCalOptions] = useState<any[]>([]);
    const [workOptions, setWorkOptions] = useState<any[]>([]);
    const [partsOptions, setPartsOptions] = useState<any[]>([]);

    useEffect(() => {
        fetch('/api/partners').then(res => res.json()).then(data => data.partners && setPartners(data.partners));
        getBrands().then(data => setBrandOptions(data.map(b => ({ label: b.name, value: b.name }))));
    }, []);

    useEffect(() => {
        if (!brand) return;
        getBrands().then(list => {
            const b = list.find(x => x.name === brand);
            if (b) getModels(b.id).then(m => setModelOptions(m.map(x => ({ label: x.nameJp, value: x.nameJp }))));
        });
    }, [brand]);

    // Handle Save / Update
    const handleSave = async () => {
        if (!brand || !customerName) { alert("ブランドと顧客名は必須です"); return; }
        setIsSaving(true);
        const payload = {
            customer: { name: customerName, type: customerCategory === "B2B" ? "business" : "individual", address, endUserName, phone: lineId },
            watch: { brand, model, ref: refName, serial, caliber },
            request: { partnerRef, accessories: accessories.split(",").map(s => s.trim()), diagnosis: requestContent, internalNotes },
            estimate: { items: [...selectedWorks.map(w => ({ type: "labor", name: w.name, price: w.price })), ...selectedParts.map(p => ({ type: "part", name: p.name, price: p.retailPrice }))] },
            status, statusLog, photos: uploadedPhotos
        };

        try {
            const url = mode === 'edit' ? `/api/repairs/${initialData.id}` : "/api/repairs";
            const res = await fetch(url, { method: mode === 'edit' ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error("保存失敗");
            const result = await res.json();
            router.push(`/repairs/${result.repair.id}`);
        } catch (e: any) { alert(e.message); setIsSaving(false); }
    };

    const grandTotal = selectedWorks.reduce((s, w) => s + w.price, 0) + selectedParts.reduce((s, p) => s + p.retailPrice, 0);

    return (
        <div className="min-h-screen bg-zinc-100 flex flex-col font-sans">
            <div className="bg-white border-b px-4 py-2 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="w-4 h-4 mr-1" /> 戻る</Button>
                    <h1 className="font-bold text-lg">{mode === 'edit' ? `修理編集: ${initialData.inquiryNumber}` : "新規修理受付"}</h1>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8" onClick={handleSave} disabled={isSaving}>
                        <Save className="w-4 h-4 mr-1" /> {isSaving ? "保存中..." : "保存"}
                    </Button>
                </div>
            </div>

            <StatusTimeline currentStatus={status} statusLog={statusLog} onStatusClick={s => setStatus(s)} onDateChange={(s, d) => setStatusLog({ ...statusLog, [s]: d })} />

            <div className="flex-1 p-2 grid grid-cols-12 gap-2 overflow-hidden">
                {/* Fixed sidebar for New, maybe hidden for Edit to focus? */}
                {mode === 'create' && (
                    <div className="col-span-2 overflow-y-auto bg-white border rounded">
                        <RecentRegistrations />
                    </div>
                )}

                <div className={cn("flex flex-col gap-2 overflow-y-auto", mode === 'create' ? "col-span-3" : "col-span-4")}>
                    <Card className="p-3 bg-white space-y-4">
                        <div className="flex bg-zinc-100 p-0.5 rounded">
                            <button onClick={() => setCustomerCategory("B2B")} className={cn("flex-1 text-xs font-bold py-1 rounded", customerCategory === "B2B" ? "bg-white shadow-sm text-blue-600" : "text-zinc-400")}>業者 (B2B)</button>
                            <button onClick={() => setCustomerCategory("B2C")} className={cn("flex-1 text-xs font-bold py-1 rounded", customerCategory === "B2C" ? "bg-white shadow-sm text-green-600" : "text-zinc-400")}>一般 (B2C)</button>
                        </div>
                        <div className="space-y-3">
                            <div><Label className="text-[10px]">顧客名 / 業者名</Label><Input value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-8 text-sm font-bold" /></div>
                            {customerCategory === "B2B" ? (
                                <>
                                    <div><Label className="text-[10px]">貴社伝票番号</Label><Input value={partnerRef} onChange={e => setPartnerRef(e.target.value)} className="h-8 text-sm font-mono" /></div>
                                    <div><Label className="text-[10px]">エンドユーザー</Label><Input value={endUserName} onChange={e => setEndUserName(e.target.value)} className="h-8 text-sm" /></div>
                                </>
                            ) : (
                                <div><Label className="text-[10px]">連絡先 (Tel/LINE)</Label><Input value={lineId} onChange={e => setLineId(e.target.value)} className="h-8 text-sm" /></div>
                            )}
                            <div><Label className="text-[10px]">住所</Label><Input value={address} onChange={e => setAddress(e.target.value)} className="h-8 text-sm" /></div>
                        </div>
                    </Card>

                    <Card className="p-3 bg-white space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div><Label className="text-[10px]">ブランド</Label><AdvancedCombobox value={brand} onChange={setBrand} options={brandOptions} /></div>
                            <div><Label className="text-[10px]">モデル</Label><AdvancedCombobox value={model} onChange={setModel} options={modelOptions} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div><Label className="text-[10px]">リファレンス</Label><Input value={refName} onChange={e => setRefName(e.target.value)} className="h-8 text-sm" /></div>
                            <div><Label className="text-[10px]">キャリバー</Label><Input value={caliber} onChange={e => setCaliber(e.target.value)} className="h-8 text-sm" /></div>
                        </div>
                        <div><Label className="text-[10px]">シリアル番号</Label><Input value={serial} onChange={e => setSerial(e.target.value)} className="h-8 text-sm font-mono" /></div>
                    </Card>
                </div>

                <div className={cn("flex flex-col gap-2", mode === 'create' ? "col-span-4" : "col-span-5")}>
                    <Card className="flex-1 p-0 bg-white flex flex-col overflow-hidden">
                        <div className="p-2 border-b bg-zinc-50 flex justify-between items-center text-xs font-bold">
                            <span>見積項目 ({selectedWorks.length + selectedParts.length})</span>
                            <div className="flex bg-white border rounded p-0.5 scale-90">
                                <button onClick={() => setRepairType("internal")} className={cn("px-2 py-0.5 rounded", repairType === "internal" ? "bg-blue-100 text-blue-700" : "")}>内装</button>
                                <button onClick={() => setRepairType("external")} className={cn("px-2 py-0.5 rounded", repairType === "external" ? "bg-green-100 text-green-700" : "")}>外装</button>
                            </div>
                        </div>
                        <div className="p-3 overflow-y-auto space-y-4">
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold text-zinc-400 border-b pb-1 uppercase">技術料</p>
                                <div className="flex gap-1"><Input placeholder="作業内容" id="newWorkName" className="h-7 text-xs flex-1" /> <Input placeholder="価格" id="newWorkPrice" className="h-7 text-xs w-20" /> <Button size="sm" className="h-7 w-7 p-0" onClick={() => {
                                    const n = (document.getElementById('newWorkName') as HTMLInputElement).value;
                                    const p = parseInt((document.getElementById('newWorkPrice') as HTMLInputElement).value);
                                    if (n && p) setSelectedWorks([...selectedWorks, { id: Date.now().toString(), name: n, price: p }]);
                                }}><Plus className="w-3 h-3" /></Button></div>
                                {selectedWorks.map((w, i) => (
                                    <div key={i} className="flex justify-between items-center bg-zinc-50 p-1.5 rounded text-xs">
                                        <span>{w.name}</span>
                                        <div className="flex items-center gap-2"><span>¥{w.price.toLocaleString()}</span><button onClick={() => setSelectedWorks(selectedWorks.filter((_, idx) => idx !== i))} className="text-zinc-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button></div>
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold text-zinc-400 border-b pb-1 uppercase">部品代</p>
                                <div className="flex gap-1"><Input placeholder="部品名" id="newPartName" className="h-7 text-xs flex-1" /> <Input placeholder="価格" id="newPartPrice" className="h-7 text-xs w-20" /> <Button size="sm" className="h-7 w-7 p-0" onClick={() => {
                                    const n = (document.getElementById('newPartName') as HTMLInputElement).value;
                                    const p = parseInt((document.getElementById('newPartPrice') as HTMLInputElement).value);
                                    if (n && p) setSelectedParts([...selectedParts, { id: Date.now().toString(), name: n, retailPrice: p }]);
                                }}><Plus className="w-3 h-3" /></Button></div>
                                {selectedParts.map((p, i) => (
                                    <div key={i} className="flex justify-between items-center bg-blue-50/30 border border-blue-100 p-1.5 rounded text-xs italic text-blue-800">
                                        <span>{p.name}</span>
                                        <div className="flex items-center gap-2"><span>¥{p.retailPrice.toLocaleString()}</span><button onClick={() => setSelectedParts(selectedParts.filter((_, idx) => idx !== i))} className="text-zinc-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-3 border-t bg-zinc-900 text-white flex justify-between items-center font-bold">
                            <span className="text-xs text-zinc-400">合計金額 (税抜)</span>
                            <span className="text-xl font-mono">¥{grandTotal.toLocaleString()}</span>
                        </div>
                    </Card>

                    <Card className="p-3 bg-white space-y-3">
                        <div><Label className="text-[10px]">依頼内容</Label><textarea value={requestContent} onChange={e => setRequestContent(e.target.value)} className="w-full h-16 p-2 text-xs border rounded bg-zinc-50" /></div>
                        <div><Label className="text-[10px]">社内備考</Label><textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} className="w-full h-12 p-2 text-xs border rounded bg-zinc-50" /></div>
                    </Card>
                </div>

                <div className="col-span-3 flex flex-col gap-2">
                    <Card className="flex-1 bg-zinc-200 border-dashed border-2 flex flex-col relative overflow-hidden">
                        <div className="flex-1 flex flex-col items-center justify-center p-4">
                            <ImageIcon className="w-8 h-8 text-zinc-400 mb-1" />
                            <p className="text-[10px] text-zinc-500 font-bold">写真管理</p>
                        </div>
                        <div className="bg-white/80 backdrop-blur p-2 h-40 overflow-y-auto grid grid-cols-2 gap-2">
                            {uploadedPhotos.map((p, i) => (
                                <div key={i} className="aspect-video bg-zinc-100 border rounded relative group">
                                    <img src={p.storageKey} className="w-full h-full object-cover rounded" />
                                    <button onClick={() => setUploadedPhotos(uploadedPhotos.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 text-[8px] opacity-0 group-hover:opacity-100">×</button>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
