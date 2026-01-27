"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import imageCompression from 'browser-image-compression';
import {
    ArrowLeft, Camera, Printer, Save, Search, Check, ChevronDown, User, Watch,
    Settings, Trash2, Plus, Image as ImageIcon, MapPin, Phone, Mail, MessageCircle,
    Clock, CheckCircle, Smartphone, FileText, RefreshCw
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MasterService } from "@/lib/masterData";
import {
    getBrands, getModels, getCalibers, getCalibersForModel, getCalibersForRef,
    getPricingRules, getPartsMatched, upsertBrand, upsertModel, upsertCaliber,
    getRefsByModel, upsertRef
} from "@/actions/master-actions";
import { LinePreviewModal } from "@/components/line/LinePreviewModal";
import { QuickRegisterDialog, RegisterData } from "@/components/repairs/QuickRegisterDialog";
import { RecentRegistrations } from "@/components/repairs/RecentRegistrations";
import { CameraCaptureDialog } from "@/components/repairs/CameraCaptureDialog";
import { MobileConnectDialog } from "@/components/repairs/MobileConnectDialog";

// Dynamically import PDF components to avoid SSR issues
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

// --- Status Timeline Data ---
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
    'parts_wait_ordered': 'parts_wait',
    'in_progress': 'in_progress',
    'completed': 'completed',
    'delivered': 'delivered'
};

// --- Sub-components ---
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
                                {isCurrent && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className={cn("text-xs font-bold transition-colors cursor-pointer", isCurrent ? "text-blue-700" : isCompleted ? "text-zinc-700" : "text-zinc-400")} onClick={() => onStatusClick(step.id)}>
                                {step.label}
                            </span>
                            <div className="h-5 mt-1 text-center">
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

// --- Main Form ---
export function RepairEntryForm({ initialData, mode = 'create' }: { initialData?: any, mode?: 'create' | 'edit' }) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);

    // Dynamic import for Photo Gallery maybe later, currently inline

    // --- Core State ---
    const [status, setStatus] = useState<RepairStatus>(initialData?.status || "reception");
    const [statusLog, setStatusLog] = useState<Record<string, string>>(initialData?.statusLog || { "reception": new Date().toLocaleDateString("ja-JP") });

    // Customer
    const [customerCategory, setCustomerCategory] = useState<"B2B" | "B2C">(initialData?.customer?.type === 'business' ? "B2B" : "B2C");
    const [customerName, setCustomerName] = useState(initialData?.customer?.name || "");
    const [endUserName, setEndUserName] = useState(initialData?.endUserName || "");
    const [lineId, setLineId] = useState(initialData?.customer?.phone || initialData?.customer?.lineId || "");
    const [address, setAddress] = useState(initialData?.customer?.address || "");

    // Watch
    const [brand, setBrand] = useState(initialData?.watch?.brand?.name || initialData?.watch?.brand?.nameEn || "");
    const [model, setModel] = useState(initialData?.watch?.model?.nameJp || initialData?.watch?.model?.name || "");
    const [refName, setRefName] = useState(initialData?.watch?.reference?.name || "");
    const [caliber, setCaliber] = useState(initialData?.watch?.caliber?.name || "");
    const [serial, setSerial] = useState(initialData?.watch?.serialNumber || "");
    const [accessories, setAccessories] = useState(() => {
        if (!initialData?.accessories) return "";
        try {
            const parsed = JSON.parse(initialData.accessories);
            return Array.isArray(parsed) ? parsed.join(", ") : initialData.accessories;
        } catch (e) { return initialData.accessories; }
    });

    // Estimates
    const [repairType, setRepairType] = useState<"internal" | "external">("internal");
    const [selectedWorks, setSelectedWorks] = useState<WorkItem[]>(initialData?.estimate?.items?.filter((i: any) => i.type === 'labor').map((i: any) => ({ id: i.id.toString(), name: i.itemName, price: i.unitPrice })) || []);
    const [selectedParts, setSelectedParts] = useState<PartItem[]>(initialData?.estimate?.items?.filter((i: any) => i.type === 'part').map((i: any) => ({ id: i.id.toString(), name: i.itemName, retailPrice: i.unitPrice })) || []);

    // Notes
    const [requestContent, setRequestContent] = useState(initialData?.workSummary || "");
    const [internalNotes, setInternalNotes] = useState(initialData?.internalNotes || "");
    const [partnerRef, setPartnerRef] = useState(initialData?.partnerRef || "");
    const [uploadedPhotos, setUploadedPhotos] = useState<any[]>(initialData?.photos?.map((p: any) => ({ storageKey: p.storageKey, fileName: p.fileName, mimeType: p.mimeType })) || []);

    // --- Masters ---
    const [brandOptions, setBrandOptions] = useState<any[]>([]);
    const [modelOptions, setModelOptions] = useState<any[]>([]);
    const [workOptions, setWorkOptions] = useState<any[]>([]);
    const [partsOptions, setPartsOptions] = useState<any[]>([]);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [isMobileConnectOpen, setIsMobileConnectOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isQuickRegisterOpen, setIsQuickRegisterOpen] = useState(false);
    const [customerOptions, setCustomerOptions] = useState<any[]>([]);

    useEffect(() => {
        // Ideally we should have a getCustomers action, but for now we'll simulate or fetch if available.
        // Or we can rely on the user typing to search. 
        // Let's implement a simple fetch or re-use existing if available, or just keep it simple for now.
        // We will pass an empty list initially and let the user type.
        // Actually, let's fetch customers for the combobox if possible.
        // For this step, I'll restore the state and dialog logic first.
    }, []);

    const handleCustomerRegister = (data: any) => {
        setCustomerCategory(data.type === 'business' ? 'B2B' : 'B2C');
        setCustomerName(data.name);
        if (data.phone) setLineId(data.phone);
        if (data.address) setAddress(data.address);
        setIsQuickRegisterOpen(false);
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Refresh photos from server (for mobile upload sync)
    const refreshPhotos = async () => {
        if (!initialData?.id) return;
        try {
            const res = await fetch(`/api/repairs/${initialData.id}/photos`);
            if (res.ok) {
                const photos = await res.json();
                setUploadedPhotos(photos.map((p: any) => ({
                    storageKey: p.storageKey,
                    fileName: p.fileName,
                    mimeType: p.mimeType
                })));
            }
        } catch (e) {
            console.error("Failed to refresh photos", e);
        }
    };

    const handlePhotoUpload = async (file: File | Blob) => {
        setIsUploading(true);

        try {
            // 1. Image Compression & WebP Conversion
            const options = {
                maxSizeMB: 1,            // Target 1MB
                maxWidthOrHeight: 3000, // Limit resolution but keep it high
                useWebWorker: true,
                fileType: 'image/webp' as any
            };

            const imageFile = file instanceof File ? file : new File([file], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
            const compressedBlob = await imageCompression(imageFile, options);

            // 2. Prepare Form Data
            const formData = new FormData();
            const fileName = (imageFile.name || `img-${Date.now()}`).replace(/\.[^/.]+$/, "") + ".webp";
            formData.append("file", compressedBlob, fileName);
            if (initialData?.id) formData.append("repairId", initialData.id.toString());

            // 3. Upload
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            const data = await res.json();
            if (data.success) {
                setUploadedPhotos(prev => [...prev, { storageKey: data.storageKey, fileName: data.fileName, mimeType: data.mimeType }]);
            } else {
                alert("アップロードに失敗しました");
            }
        } catch (e) {
            console.error("Photo process/upload failed:", e);
            alert("画像の処理またはアップロードに失敗しました");
        } finally {
            setIsUploading(false);
        }
    };

    useEffect(() => {
        getBrands().then(data => setBrandOptions(data.map(b => ({ label: b.nameJp || b.name, value: b.name }))));
    }, []);

    useEffect(() => {
        if (!brand) return;
        getBrands().then(list => {
            const b = list.find(x => x.name === brand);
            if (b) getModels(b.id).then(m => setModelOptions(m.map((x: any) => ({ label: x.nameJp, value: x.nameJp }))));
        });
    }, [brand]);

    // Handle Save
    const handleSave = async () => {
        if (!brand || !customerName) { alert("ブランドと顧客名は必須です"); return; }
        setIsSaving(true);
        const payload = {
            customer: { name: customerName, type: customerCategory === "B2B" ? "business" : "individual", address, endUserName, phone: lineId },
            watch: { brand, model, ref: refName, serial, caliber },
            request: { partnerRef, accessories: accessories.split(",").map((s: string) => s.trim()).filter(Boolean), diagnosis: requestContent, internalNotes },
            estimate: { items: [...selectedWorks.map((w: WorkItem) => ({ type: "labor", name: w.name, price: w.price })), ...selectedParts.map((p: PartItem) => ({ type: "part", name: p.name, price: p.retailPrice }))] },
            status, statusLog, photos: uploadedPhotos
        };

        try {
            const url = mode === 'edit' ? `/api/repairs/${initialData.id}` : "/api/repairs";
            const res = await fetch(url, { method: mode === 'edit' ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error("保存に失敗しました");
            const result = await res.json();
            router.push(`/repairs/${result.repair.id}`);
        } catch (e: any) { alert(e.message); setIsSaving(false); }
    };

    const grandTotal = selectedWorks.reduce((s, w) => s + w.price, 0) + selectedParts.reduce((s, p) => s + p.retailPrice, 0);

    return (
        <div className="min-h-screen bg-zinc-100 flex flex-col font-sans text-zinc-800">
            {/* Header */}
            <div className="bg-white border-b px-4 py-2 flex items-center justify-between sticky top-0 z-50 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.back()} className="h-8"><ArrowLeft className="w-4 h-4 mr-1" /> 戻る</Button>
                    <h1 className="font-bold text-lg">{mode === 'edit' ? `修理編集: ${initialData?.inquiryNumber}` : "新規修理受付"}</h1>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-8 gap-1 border-zinc-300" onClick={() => window.print()}><Printer className="w-4 h-4" /> 印刷</Button>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 shadow-sm" onClick={handleSave} disabled={isSaving}>
                        <Save className="w-4 h-4 mr-1" /> {isSaving ? "保存中..." : "保存する"}
                    </Button>
                </div>
            </div>

            {/* Timeline */}
            <StatusTimeline currentStatus={status} statusLog={statusLog} onStatusClick={s => setStatus(s)} onDateChange={(s, d) => setStatusLog({ ...statusLog, [s]: d })} />

            <div className="flex-1 p-2 grid grid-cols-12 gap-2 overflow-hidden items-stretch">
                {/* Left Column: History, Basic Info & Actions (3/12) */}
                <div className="col-span-3 flex flex-col gap-2 overflow-y-auto pr-1">
                    {mode === 'create' && (
                        <div className="bg-white border border-zinc-200 rounded-lg shadow-sm max-h-48 overflow-y-auto mb-2">
                            <RecentRegistrations />
                        </div>
                    )}

                    <Card className="p-3 bg-white space-y-4 shadow-sm">
                        <div className="flex bg-zinc-100 p-1 rounded-md">
                            <button onClick={() => setCustomerCategory("B2B")} className={cn("flex-1 text-xs font-bold py-1.5 rounded-sm transition-all", customerCategory === "B2B" ? "bg-white shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600")}>業者 (B2B)</button>
                            <button onClick={() => setCustomerCategory("B2C")} className={cn("flex-1 text-xs font-bold py-1.5 rounded-sm transition-all", customerCategory === "B2C" ? "bg-white shadow-sm text-green-600" : "text-zinc-400 hover:text-zinc-600")}>一般 (B2C)</button>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">顧客名 / 業者名</Label>
                                    <div className="flex gap-1">
                                        <Input
                                            value={customerName}
                                            onChange={e => setCustomerName(e.target.value)}
                                            className="h-8 text-sm font-bold border-zinc-200 focus:border-blue-400"
                                            placeholder="名前を入力..."
                                        />
                                    </div>
                                </div>
                                <Button size="sm" className="h-8 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border border-zinc-200" onClick={() => setIsQuickRegisterOpen(true)}>
                                    <Plus className="w-3.5 h-3.5" /> 新規
                                </Button>
                            </div>

                            {customerCategory === "B2B" ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">貴社伝票番号</Label><Input value={partnerRef} onChange={e => setPartnerRef(e.target.value)} className="h-8 text-sm font-mono border-zinc-200" /></div>
                                    <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">エンドユーザー</Label><Input value={endUserName} onChange={e => setEndUserName(e.target.value)} className="h-8 text-sm border-zinc-200" /></div>
                                </div>
                            ) : (
                                <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">連絡先 (Tel/LINE)</Label><Input value={lineId} onChange={e => setLineId(e.target.value)} className="h-8 text-sm border-zinc-200" /></div>
                            )}
                            <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">住所</Label><Input value={address} onChange={e => setAddress(e.target.value)} className="h-8 text-sm border-zinc-200" /></div>
                        </div>
                    </Card>

                    <Card className="p-3 bg-white space-y-4 shadow-sm border-t-2 border-t-zinc-400">
                        <div className="flex items-center gap-2 mb-1"><Watch className="w-4 h-4 text-zinc-400" /><h3 className="text-xs font-bold">時計情報</h3></div>
                        <div className="grid grid-cols-2 gap-2">
                            <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">ブランド</Label><AdvancedCombobox value={brand} onChange={setBrand} options={brandOptions} onUpsert={v => upsertBrand(v).then(() => getBrands().then(d => setBrandOptions(d.map(b => ({ label: b.name, value: b.name })))))} /></div>
                            <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">モデル</Label><AdvancedCombobox value={model} onChange={setModel} options={modelOptions} onUpsert={v => brand && upsertModel(brand, v).then(() => getModels(brandOptions.find(b => b.value === brand)?.id).then(m => setModelOptions(m.map(x => ({ label: x.nameJp, value: x.nameJp })))))} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">リファレンス</Label><Input value={refName} onChange={e => setRefName(e.target.value)} className="h-8 text-sm border-zinc-200" /></div>
                            <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">キャリバー</Label><Input value={caliber} onChange={e => setCaliber(e.target.value)} className="h-8 text-sm font-mono border-zinc-200" /></div>
                        </div>
                        <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">製造番号 (Serial)</Label><Input value={serial} onChange={e => setSerial(e.target.value)} className="h-8 text-sm font-mono border-zinc-200" /></div>
                        <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">付属品</Label><Input value={accessories} onChange={e => setAccessories(e.target.value)} className="h-8 text-xs border-zinc-200 placeholder:italic" placeholder="箱, 保証書, 外したコマ..." /></div>
                    </Card>

                    <Card className="p-3 bg-zinc-900 text-white shadow-xl mt-auto">
                        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 border-b border-zinc-800 pb-1 flex items-center gap-2"><Settings className="w-3 h-3" /> Quick Documents / LINE</h3>
                        <div className="space-y-2">
                            <Button variant="outline" size="sm" className="w-full h-8 text-[10px] bg-transparent border-zinc-700 hover:bg-zinc-800 justify-start" disabled={mode === 'create'}><FileText className="w-3.5 h-3.5 mr-2 text-blue-400" /> 見積書作成 (PDF)</Button>
                            <Button variant="outline" size="sm" className="w-full h-8 text-[10px] bg-transparent border-zinc-700 hover:bg-zinc-800 justify-start" disabled={mode === 'create'}><CheckCircle className="w-3.5 h-3.5 mr-2 text-green-400" /> 納品書発行 (PDF)</Button>
                            <div className="h-px bg-zinc-800 my-1"></div>
                            <Button variant="outline" size="sm" className="w-full h-8 text-[10px] bg-transparent border-zinc-700 hover:bg-zinc-800 justify-start text-emerald-400 border-emerald-900/50"><MessageCircle className="w-3.5 h-3.5 mr-2" /> LINEでステータス送信</Button>
                        </div>
                    </Card>
                </div>

                {/* Center Column: Estimates & Requests (5/12) */}
                <div className="col-span-5 flex flex-col gap-2">
                    <Card className="flex-1 p-0 bg-white flex flex-col overflow-hidden shadow-sm border-t-2 border-t-blue-500">
                        <div className="p-2.5 border-b bg-zinc-50 flex justify-between items-center">
                            <div className="flex items-center gap-2"><Settings className="w-4 h-4 text-blue-500" /><span className="text-xs font-bold text-zinc-700">見積項目明細</span></div>
                            <div className="flex bg-white shadow-sm border border-zinc-200 rounded p-0.5 scale-90">
                                <button onClick={() => setRepairType("internal")} className={cn("px-3 py-1 text-[10px] font-bold rounded-sm transition-all", repairType === "internal" ? "bg-blue-100 text-blue-700" : "text-zinc-500 hover:text-zinc-800")}>内装</button>
                                <button onClick={() => setRepairType("external")} className={cn("px-3 py-1 text-[10px] font-bold rounded-sm transition-all", repairType === "external" ? "bg-green-100 text-green-700" : "text-zinc-500 hover:text-zinc-800")}>外装</button>
                            </div>
                        </div>
                        <div className="p-3 overflow-y-auto space-y-5 flex-1">
                            {/* Labor Section */}
                            <div className="space-y-2">
                                <p className="text-[9px] font-bold text-zinc-400 border-b border-zinc-100 pb-1 uppercase tracking-wider flex justify-between items-center"><span>1. 技術料・工賃</span> <span className="text-blue-500">Labor Fee</span></p>
                                <div className="flex gap-1">
                                    <Input placeholder="作業項目を入力..." id="newWorkName" className="h-8 text-xs flex-1 border-zinc-200" />
                                    <div className="relative">
                                        <span className="absolute left-2 top-2 text-zinc-400 text-[10px]">¥</span>
                                        <Input placeholder="価格" id="newWorkPrice" className="h-8 text-xs w-20 pl-5 border-zinc-200" />
                                    </div>
                                    <Button size="sm" className="h-8 w-8 p-0 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white" onClick={() => {
                                        const n = (document.getElementById('newWorkName') as HTMLInputElement).value;
                                        const pStr = (document.getElementById('newWorkPrice') as HTMLInputElement).value;
                                        const p = parseInt(pStr);
                                        if (n && !isNaN(p)) {
                                            setSelectedWorks([...selectedWorks, { id: "new-" + Date.now(), name: n, price: p }]);
                                            (document.getElementById('newWorkName') as HTMLInputElement).value = "";
                                            (document.getElementById('newWorkPrice') as HTMLInputElement).value = "";
                                        }
                                    }}><Plus className="w-3.5 h-3.5" /></Button>
                                </div>
                                <div className="space-y-1 mt-2">
                                    {selectedWorks.map((w, i) => (
                                        <div key={i} className="flex justify-between items-center bg-zinc-50/80 p-2 rounded border border-zinc-100 text-xs group">
                                            <span className="font-medium text-zinc-700">{w.name}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono font-bold">¥{w.price.toLocaleString()}</span>
                                                <button onClick={() => setSelectedWorks(selectedWorks.filter((_, idx) => idx !== i))} className="text-zinc-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Parts Section */}
                            <div className="space-y-2">
                                <p className="text-[9px] font-bold text-zinc-400 border-b border-zinc-100 pb-1 uppercase tracking-wider flex justify-between items-center"><span>2. 交換部品代</span> <span className="text-emerald-500">Parts Fee</span></p>
                                <div className="flex gap-1">
                                    <Input placeholder="部品名..." id="newPartName" className="h-8 text-xs flex-1 border-emerald-100" />
                                    <div className="relative">
                                        <span className="absolute left-2 top-2 text-zinc-400 text-[10px]">¥</span>
                                        <Input placeholder="価格" id="newPartPrice" className="h-8 text-xs w-20 pl-5 border-emerald-100" />
                                    </div>
                                    <Button size="sm" className="h-8 w-8 p-0 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-600 hover:text-white" onClick={() => {
                                        const n = (document.getElementById('newPartName') as HTMLInputElement).value;
                                        const pStr = (document.getElementById('newPartPrice') as HTMLInputElement).value;
                                        const p = parseInt(pStr);
                                        if (n && !isNaN(p)) {
                                            setSelectedParts([...selectedParts, { id: "new-p-" + Date.now(), name: n, retailPrice: p }]);
                                            (document.getElementById('newPartName') as HTMLInputElement).value = "";
                                            (document.getElementById('newPartPrice') as HTMLInputElement).value = "";
                                        }
                                    }}><Plus className="w-3.5 h-3.5" /></Button>
                                </div>
                                <div className="space-y-1 mt-2">
                                    {selectedParts.map((p, i) => (
                                        <div key={i} className="flex justify-between items-center bg-emerald-50/30 border border-emerald-100 p-2 rounded text-xs text-emerald-900 group">
                                            <span className="font-medium">{p.name}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono font-bold">¥{p.retailPrice.toLocaleString()}</span>
                                                <button onClick={() => setSelectedParts(selectedParts.filter((_, idx) => idx !== i))} className="text-emerald-200 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-3 border-t bg-zinc-900 text-white flex justify-between items-center font-bold">
                            <div className="flex flex-col">
                                <span className="text-[9px] text-zinc-500 font-normal uppercase">Total Estimate (Tax excl.)</span>
                                <span className="text-zinc-200 text-xs font-normal">合計金額 (税抜)</span>
                            </div>
                            <span className="text-2xl font-mono tracking-tight">¥{grandTotal.toLocaleString()}</span>
                        </div>
                    </Card>

                    <Card className="p-3 bg-white space-y-3 shadow-sm h-1/4">
                        <div className="flex items-center gap-2 mb-1"><FileText className="w-4 h-4 text-zinc-400" /><h3 className="text-xs font-bold font-bold">依頼・備考メモ</h3></div>
                        <div><Label className="text-[10px] text-zinc-400 font-bold ml-1">依頼内容 (Customer Request)</Label><textarea value={requestContent} onChange={e => setRequestContent(e.target.value)} className="w-full h-16 p-2 text-xs border border-zinc-200 rounded-md bg-zinc-50 focus:bg-white transition-colors resize-none" /></div>
                        <div><Label className="text-[10px] text-zinc-400 font-bold ml-1">社内備考 (Internal Notes)</Label><textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} className="w-full h-12 p-2 text-xs border border-zinc-200 rounded-md bg-zinc-50 focus:bg-white transition-colors resize-none" /></div>
                    </Card>
                </div>

                {/* Right Column: Photos (4/12) - Dedicated & Large */}
                <div className="col-span-4 flex flex-col h-full bg-zinc-50 border border-zinc-200 rounded-lg overflow-hidden relative">
                    {/* Header / Upload Controls - Compact */}
                    <div className="p-2 border-b bg-white flex items-center justify-between shrink-0 z-10 shadow-sm">
                        <div className="flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-zinc-500" />
                            <h3 className="text-xs font-bold text-zinc-600">修理写真 ({uploadedPhotos.length})</h3>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="file"
                                className="hidden"
                                ref={fileInputRef}
                                accept="image/*"
                                multiple
                                onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    files.forEach(f => handlePhotoUpload(f));
                                }}
                            />
                            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setIsMobileConnectOpen(true)}>
                                <Smartphone className="w-3 h-3 text-blue-500" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setIsCameraOpen(true)}>
                                <Camera className="w-3 h-3 text-zinc-600" />
                            </Button>
                            <Button size="sm" className="h-7 text-[10px] gap-1 bg-zinc-800 hover:bg-zinc-700" onClick={() => fileInputRef.current?.click()}>
                                <Plus className="w-3 h-3" /> 追加
                            </Button>
                        </div>
                    </div>

                    {/* Photo Grid - Large Area */}
                    <div className="flex-1 overflow-y-auto p-4 bg-zinc-100/50">
                        {isUploading && (
                            <div className="w-full p-4 mb-4 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center gap-2 animate-pulse">
                                <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                                <span className="text-xs font-bold text-blue-600">アップロード中...</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4">
                            {uploadedPhotos.map((p, i) => (
                                <div key={i} className="group relative bg-white rounded-lg shadow-sm border border-zinc-200 overflow-hidden hover:shadow-md transition-all">
                                    <div className="aspect-[4/3] w-full bg-zinc-50 relative cursor-pointer">
                                        <img src={p.storageKey} alt="Repair" className="w-full h-full object-contain" />
                                        {/* Overlay Metadata */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                            <p className="text-[10px] truncate font-mono">{p.fileName}</p>
                                        </div>
                                    </div>

                                    {/* Delete Button - Clearly Visible */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm("この写真を削除しますか？")) {
                                                setUploadedPhotos(uploadedPhotos.filter((_, idx) => idx !== i));
                                            }
                                        }}
                                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transform scale-90 hover:scale-105 transition-all z-10"
                                        title="削除"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}

                            {uploadedPhotos.length === 0 && !isUploading && (
                                <div className="flex flex-col items-center justify-center py-20 text-zinc-300 border-2 border-dashed border-zinc-200 rounded-xl">
                                    <Camera className="w-12 h-12 mb-2 opacity-50" />
                                    <p className="text-sm font-bold">No Photos</p>
                                    <p className="text-[10px]">写真を追加してください</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer Info */}
                    <div className="p-2 bg-zinc-50 border-t text-[10px] text-zinc-400 text-center">
                        Drag & Drop supported
                    </div>
                </div>
            </div>

            <CameraCaptureDialog
                isOpen={isCameraOpen}
                onClose={() => setIsCameraOpen(false)}
                onCapture={(blob) => {
                    handlePhotoUpload(blob);
                    // Keep open for continuous shooting if desired, or close
                    // setIsCameraOpen(false); 
                }}
            />

            {initialData?.id && (
                <MobileConnectDialog
                    isOpen={isMobileConnectOpen}
                    onClose={() => setIsMobileConnectOpen(false)}
                    repairId={initialData.id.toString()}
                    onPhotosUploaded={refreshPhotos}
                />
            )}

            <QuickRegisterDialog
                isOpen={isQuickRegisterOpen}
                onClose={() => setIsQuickRegisterOpen(false)}
                onRegister={handleCustomerRegister}
                mode="customer"
                initialName={customerName}
            />
        </div>
    );
}
