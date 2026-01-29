"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import imageCompression from 'browser-image-compression';
import {
    ArrowLeft, Camera, Printer, Save, Search, Check, ChevronDown, User, Watch,
    Settings, Trash2, Plus, Image as ImageIcon, MapPin, Phone, Mail, MessageCircle,
    Clock, CheckCircle, Smartphone, FileText, RefreshCw, AlertTriangle
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { MasterService } from "@/lib/masterData";
import {
    getBrands, getModels, getCalibers, getCalibersForModel, getCalibersForRef,
    getPricingRules, getPartsMatched, upsertBrand, upsertModel, upsertCaliber,
    getRefsByModel, upsertRef
} from "@/actions/master-actions";
import { getCustomers } from "@/actions/customer-actions";
import { LinePreviewModal } from "@/components/line/LinePreviewModal";
import { QuickRegisterDialog, RegisterData } from "@/components/repairs/QuickRegisterDialog";
import { RecentRegistrations } from "@/components/repairs/RecentRegistrations";
import { CameraCaptureDialog } from "@/components/repairs/CameraCaptureDialog";
import { MobileConnectDialog } from "@/components/repairs/MobileConnectDialog";

// Dynamically import PDF components to avoid SSR issues
const PDFPreviewDialog = dynamic(() => import("@/components/repairs/PDFPreviewDialog"), {
    ssr: false,
    loading: () => <Button variant="outline" size="sm" disabled><FileText className="w-4 h-4 mr-1" /> PDFを準備中...</Button>
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
                            if (!isNaN(d.getTime())) {
                                // For input[type="date"], we need YYYY-MM-DD in local time
                                const offset = 9 * 60; // Tokyo
                                const localDate = new Date(d.getTime() + offset * 60 * 1000);
                                dateValue = d.toLocaleString("ja-JP", { timeZone: 'Asia/Tokyo' }).split(" ")[0].replace(/\//g, "-");
                                // Simpler: just use what's in the string if it's already YYYY/MM/DD
                                if (logDate.includes("/")) dateValue = logDate.replace(/\//g, "-");
                                else dateValue = d.toISOString().split("T")[0];
                            }
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
    value: string;
    onChange: (v: string) => void;
    onSearchChange?: (s: string) => void;
    onUpsert?: (v: string) => void;
    placeholder?: string;
    options: { label: string, value: string }[];
    disabled?: boolean;
}> = ({ value, onChange, onSearchChange, onUpsert, placeholder, options, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Use either the selected value's label or the manual search text
    // Fixed: Always filter based on current search or show all if search is empty
    const filtered = (options || []).filter(opt =>
        (opt.label || "").toLowerCase().includes(search.toLowerCase()) ||
        (opt.value || "").toLowerCase().includes(search.toLowerCase())
    );

    // After selection, we usually want the clean 'value' (e.g. "TRUST") in the input,
    // not the 'label' (e.g. "TRUST (No Contact)")
    const inputDisplayValue = isOpen ? search : value;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Important: Reflect parent-side 'value' changes in local search if needed, 
    // but usually 'search' should only exist while typing.
    useEffect(() => {
        if (!isOpen) setSearch("");
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && onSearchChange) {
            onSearchChange(search);
        }
    }, [search, isOpen, onSearchChange]);

    return (
        <div className="relative" ref={wrapperRef}>
            <div
                className={cn(
                    "flex h-8 w-full items-center justify-between rounded border border-input bg-white px-2 py-1 text-xs cursor-text focus-within:ring-1 focus-within:ring-blue-400 font-medium",
                    disabled ? "opacity-50" : ""
                )}
                onClick={() => {
                    if (!disabled) {
                        setIsOpen(true);
                        inputRef.current?.focus();
                    }
                }}
            >
                <input
                    ref={inputRef}
                    className="bg-transparent border-0 p-0 text-xs w-full focus:outline-none placeholder:text-zinc-300"
                    placeholder={placeholder}
                    value={inputDisplayValue}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        if (!isOpen) setIsOpen(true);
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        // Trigger search with empty string to show all on focus
                        if (onSearchChange) onSearchChange("");
                    }}
                    disabled={disabled}
                />
                <ChevronDown className="h-3 w-3 opacity-50 cursor-pointer" onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }} />
            </div>
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border rounded shadow-lg p-1 min-w-[240px] max-h-60 overflow-hidden flex flex-col">
                    <div className="overflow-auto flex-1">
                        {onUpsert && search && !options.some(o => o.label === search) && (
                            <div className="p-1 px-2 text-xs text-blue-600 font-bold hover:bg-blue-50 cursor-pointer border-b mb-1" onClick={() => {
                                onUpsert(search);
                                onChange(search);
                                setIsOpen(false);
                            }}>
                                + "{search}" を新規登録/使用
                            </div>
                        )}
                        {filtered.length === 0 && !onUpsert && (
                            <div className="p-2 text-xs text-zinc-400 italic">候補が見つかりません</div>
                        )}
                        {filtered.map(opt => (
                            <div
                                key={opt.value}
                                className={cn(
                                    "p-1.5 text-xs hover:bg-zinc-100 cursor-pointer rounded flex justify-between items-center",
                                    value === opt.value ? "bg-blue-50 text-blue-700 font-bold" : ""
                                )}
                                onClick={() => {
                                    onChange(opt.value);
                                    setSearch(opt.label);
                                    setIsOpen(false);
                                }}
                            >
                                <span>{opt.label}</span>
                                {value === opt.value && <Check className="w-3 h-3" />}
                            </div>
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
    const [customerId, setCustomerId] = useState<number | null>(initialData?.customer?.id || null);
    const [customerCategory, setCustomerCategory] = useState<"B2B" | "B2C">(initialData?.customer?.type === 'business' ? "B2B" : "B2C");
    const [customerName, setCustomerName] = useState(initialData?.customer?.name || "");
    const [endUserName, setEndUserName] = useState(initialData?.endUserName || "");
    const [lineId, setLineId] = useState(initialData?.customer?.lineId || "");
    const [customerPhone, setCustomerPhone] = useState(initialData?.customer?.phone || "");
    const [address, setAddress] = useState(initialData?.customer?.address || "");
    const [customerPrefix, setCustomerPrefix] = useState(initialData?.customer?.prefix || "");

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
    const [refOptions, setRefOptions] = useState<any[]>([]);
    const [caliberOptions, setCaliberOptions] = useState<any[]>([]);
    const [workOptions, setWorkOptions] = useState<any[]>([]);
    const [partsOptions, setPartsOptions] = useState<any[]>([]);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [isMobileConnectOpen, setIsMobileConnectOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isQuickRegisterOpen, setIsQuickRegisterOpen] = useState(false);
    const [customerOptions, setCustomerOptions] = useState<any[]>([]);
    const [showDupDialog, setShowDupDialog] = useState(false);
    const [dupResults, setDupResults] = useState<any[]>([]);

    const [customerSearch, setCustomerSearch] = useState("");
    const [newWorkName, setNewWorkName] = useState("");
    const [newWorkPrice, setNewWorkPrice] = useState("");
    const [newPartName, setNewPartName] = useState("");
    const [newPartPrice, setNewPartPrice] = useState("");

    // Incremental Customer Search
    useEffect(() => {
        const timer = setTimeout(async () => {
            // Fetch even if search is empty to show initial list
            const results = await getCustomers(customerSearch);
            setCustomerOptions(results.map(c => ({
                label: `${c.name} (${c.phone || c.email || "連絡先なし"})`,
                value: c.name,
                fullData: c
            })));
        }, 150); // Shorter debounce for better feel

        return () => clearTimeout(timer);
    }, [customerSearch]);

    const handleCustomerRegister = (data: any) => {
        setCustomerId(null);
        setCustomerCategory(data.type === 'business' ? 'B2B' : 'B2C');
        setCustomerName(data.name);
        setCustomerPrefix(data.prefix || "");
        if (data.phone) setCustomerPhone(data.phone);
        if (data.lineId) setLineId(data.lineId);
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
        getBrands().then(data => setBrandOptions(data.map(b => ({ label: b.nameJp || b.name, value: b.name, id: b.id }))));
    }, []);

    // Brand Change -> Load Models
    useEffect(() => {
        if (!brand) {
            setModelOptions([]);
            return;
        }
        const b = brandOptions.find(x => x.value === brand);
        if (b) {
            getModels(b.id).then(m => setModelOptions(m.map((x: any) => ({ label: x.nameJp || x.name, value: x.nameJp || x.name, id: x.id }))));
        }
    }, [brand, brandOptions]);

    // Model Change -> Load Refs & Calibers
    useEffect(() => {
        if (!model) {
            setRefOptions([]);
            setCaliberOptions([]);
            return;
        }
        const m = modelOptions.find(x => x.value === model);
        if (m) {
            getRefsByModel(m.id).then(refs => {
                setRefOptions(refs.map(r => ({ label: r.name, value: r.name, id: r.id, caliber: r.caliber?.name })));
            });
            const b = brandOptions.find(x => x.value === brand);
            if (b) {
                getCalibersForModel(b.id, m.id).then(cals => {
                    setCaliberOptions(cals.map(c => ({ label: c.name, value: c.name })));
                });
            }
        }
    }, [model, modelOptions, brand, brandOptions]);

    // Ref Change -> Auto-fill Caliber (Safely)
    useEffect(() => {
        if (!refName) return;
        const r = refOptions.find(o => o.value === refName);
        if (r?.caliber) {
            setCaliber(r.caliber);
        }
    }, [refName, refOptions]); // Include refOptions in deps

    // Fetch Work & Parts Master automatically based on context
    useEffect(() => {
        const b = brandOptions.find(x => x.value === brand);
        const m = modelOptions.find(x => x.value === model);
        const c = caliberOptions.find(x => x.value === caliber);

        if (b) {
            getPricingRules(b.id, m?.id).then(rules => {
                setWorkOptions(rules.map(r => ({
                    label: r.suggestedWorkName,
                    value: r.suggestedWorkName,
                    price: r.minPrice
                })));
            });
            getPartsMatched(b.id, m?.id).then(parts => {
                setPartsOptions(parts.map(p => ({
                    label: p.nameJp || p.name,
                    value: p.nameJp || p.name,
                    price: p.retailPrice,
                    supplier: p.supplier
                })));
            });
        }
    }, [brand, model, caliber, brandOptions, modelOptions, caliberOptions]);

    // Handle Save
    const handleSave = async (force: boolean = false) => {
        if (!brand || !customerName) { alert("ブランドと顧客名は必須です"); return; }

        // --- Duplicate Check logic ---
        if (!force && mode === 'create' && !customerId) {
            // Check if name already exists
            const matches = await getCustomers(customerName);
            // Filter by exact name
            const exactMatches = matches.filter(m => m.name === customerName);
            if (exactMatches.length > 0) {
                setDupResults(exactMatches);
                setShowDupDialog(true);
                return;
            }
        }

        setIsSaving(true);
        const payload = {
            customer: {
                id: customerId,
                name: customerName,
                type: customerCategory === "B2B" ? "business" : "individual",
                address,
                endUserName,
                phone: customerPhone,
                lineId: lineId,
                prefix: customerCategory === "B2B" ? customerPrefix : "C"
            },
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
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 shadow-sm" onClick={() => handleSave()} disabled={isSaving}>
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
                            <button onClick={() => setCustomerCategory("B2B")} className={cn("flex-1 text-xs font-bold py-1.5 rounded-sm transition-all", customerCategory === "B2B" ? "bg-white shadow-sm text-blue-600" : "text-zinc-400 hover:text-zinc-600")}>業者</button>
                            <button onClick={() => setCustomerCategory("B2C")} className={cn("flex-1 text-xs font-bold py-1.5 rounded-sm transition-all", customerCategory === "B2C" ? "bg-white shadow-sm text-green-600" : "text-zinc-400 hover:text-zinc-600")}>一般</button>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">顧客名 / 業者名</Label>
                                    <div className="flex gap-1">
                                        <AdvancedCombobox
                                            value={customerName}
                                            onSearchChange={setCustomerSearch}
                                            onChange={(val) => {
                                                setCustomerName(val);
                                                // Find details
                                                const found = customerOptions.find(o => o.value === val);
                                                if (found?.fullData) {
                                                    const d = found.fullData;
                                                    setCustomerId(d.id);
                                                    setCustomerCategory(d.type === 'business' ? 'B2B' : 'B2C');
                                                    setCustomerPrefix(d.prefix || "");
                                                    if (d.phone) setCustomerPhone(d.phone);
                                                    if (d.lineId) setLineId(d.lineId);
                                                    if (d.address) setAddress(d.address);
                                                } else {
                                                    setCustomerId(null);
                                                }
                                            }}
                                            placeholder="顧客名を入力..."
                                            options={customerOptions}
                                        />
                                    </div>
                                </div>
                                <Button size="sm" className="h-8 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border border-zinc-200" onClick={() => setIsQuickRegisterOpen(true)}>
                                    <Plus className="w-3.5 h-3.5" /> 新規
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">電話番号</Label><Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="h-8 text-sm border-zinc-200" placeholder="090-..." /></div>
                                <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">LINE ID</Label><Input value={lineId} onChange={e => setLineId(e.target.value)} className="h-8 text-sm border-zinc-200" placeholder="@..." /></div>
                            </div>
                            {customerCategory === "B2B" && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">貴社伝票番号</Label><Input value={partnerRef} onChange={e => setPartnerRef(e.target.value)} className="h-8 text-sm font-mono border-zinc-200" /></div>
                                    <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">エンドユーザー</Label><Input value={endUserName} onChange={e => setEndUserName(e.target.value)} className="h-8 text-sm border-zinc-200" /></div>
                                </div>
                            )}
                            <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">住所</Label><Input value={address} onChange={e => setAddress(e.target.value)} className="h-8 text-sm border-zinc-200" placeholder="都道府県 市区町村..." /></div>
                        </div>
                    </Card>

                    <Card className="p-3 bg-white space-y-4 shadow-sm border-t-2 border-t-zinc-400">
                        <div className="flex items-center gap-2 mb-1"><Watch className="w-4 h-4 text-zinc-400" /><h3 className="text-xs font-bold">時計情報</h3></div>
                        <div className="grid grid-cols-2 gap-2">
                            <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">ブランド</Label><AdvancedCombobox value={brand} onChange={setBrand} options={brandOptions} onUpsert={v => upsertBrand(v).then(() => getBrands().then(d => setBrandOptions(d.map(b => ({ label: b.nameJp || b.name, value: b.name, id: b.id })))))} /></div>
                            <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">モデル</Label><AdvancedCombobox value={model} onChange={setModel} options={modelOptions} onUpsert={v => brand && upsertModel(brand, v).then(() => {
                                const b = brandOptions.find(x => x.value === brand);
                                if (b) getModels(b.id).then(m => setModelOptions(m.map(x => ({ label: x.nameJp || x.name, value: x.nameJp || x.name, id: x.id }))));
                            })} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">リファレンス (Ref)</Label><AdvancedCombobox value={refName} onChange={setRefName} options={refOptions} onUpsert={v => model && upsertRef(model, brand, v).then(() => {
                                const m = modelOptions.find(x => x.value === model);
                                if (m) getRefsByModel(m.id).then(r => setRefOptions(r.map(x => ({ label: x.name, value: x.name, id: x.id, caliber: x.caliber?.name }))));
                            })} placeholder="型番を選択..." /></div>
                            <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">キャリバー (Cal)</Label><AdvancedCombobox value={caliber} onChange={setCaliber} options={caliberOptions} onUpsert={v => brand && upsertCaliber(v, brandOptions.find(b => b.value === brand)?.id).then(() => {
                                const b = brandOptions.find(x => x.value === brand);
                                const m = modelOptions.find(x => x.value === model);
                                if (b) getCalibersForModel(b.id, m?.id).then(cals => setCaliberOptions(cals.map(c => ({ label: c.name, value: c.name }))));
                            })} placeholder="機械番号..." /></div>
                        </div>
                        <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">製造番号 (Serial)</Label><Input value={serial} onChange={e => setSerial(e.target.value)} className="h-8 text-sm font-mono border-zinc-200" /></div>
                        <div><Label className="text-[10px] text-zinc-400 uppercase font-bold px-1">付属品</Label><Input value={accessories} onChange={e => setAccessories(e.target.value)} className="h-8 text-xs border-zinc-200 placeholder:italic" placeholder="箱, 保証書, 外したコマ..." /></div>
                    </Card>

                    <Card className="p-3 bg-zinc-900 text-white shadow-xl mt-auto">
                        <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 border-b border-zinc-800 pb-1 flex items-center gap-2"><Settings className="w-3 h-3" /> 各種書類 / LINE出力</h3>
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
                                <p className="text-[9px] font-bold text-zinc-400 border-b border-zinc-100 pb-1 uppercase tracking-wider flex justify-between items-center"><span>1. 技術料・工賃</span></p>
                                <div className="flex gap-1">
                                    <div className="flex-1">
                                        <AdvancedCombobox
                                            value={newWorkName}
                                            onChange={(val) => {
                                                setNewWorkName(val);
                                                const match = workOptions.find(o => o.value === val);
                                                if (match) setNewWorkPrice(String(match.price));
                                            }}
                                            options={workOptions}
                                            placeholder="作業項目を選択または入力..."
                                        />
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-2 top-2 text-zinc-400 text-[10px]">¥</span>
                                        <Input
                                            placeholder="価格"
                                            value={newWorkPrice}
                                            onChange={e => setNewWorkPrice(e.target.value)}
                                            className="h-8 text-xs w-20 pl-5 border-zinc-200"
                                        />
                                    </div>
                                    <Button size="sm" className="h-8 w-8 p-0 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white" onClick={() => {
                                        const p = parseInt(newWorkPrice);
                                        if (newWorkName && !isNaN(p)) {
                                            setSelectedWorks([...selectedWorks, { id: "new-" + Date.now(), name: newWorkName, price: p }]);
                                            setNewWorkName("");
                                            setNewWorkPrice("");
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
                                <p className="text-[9px] font-bold text-zinc-400 border-b border-zinc-100 pb-1 uppercase tracking-wider flex justify-between items-center"><span>2. 交換部品代</span></p>
                                <div className="flex gap-1">
                                    <div className="flex-1">
                                        <AdvancedCombobox
                                            value={newPartName}
                                            onChange={(val) => {
                                                setNewPartName(val);
                                                const match = partsOptions.find(o => o.value === val);
                                                if (match) setNewPartPrice(String(match.price));
                                            }}
                                            options={partsOptions}
                                            placeholder="部品を選択または入力..."
                                        />
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-2 top-2 text-zinc-400 text-[10px]">¥</span>
                                        <Input
                                            placeholder="価格"
                                            value={newPartPrice}
                                            onChange={e => setNewPartPrice(e.target.value)}
                                            className="h-8 text-xs w-20 pl-5 border-emerald-100"
                                        />
                                    </div>
                                    <Button size="sm" className="h-8 w-8 p-0 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-600 hover:text-white" onClick={() => {
                                        const p = parseInt(newPartPrice);
                                        if (newPartName && !isNaN(p)) {
                                            setSelectedParts([...selectedParts, { id: "new-p-" + Date.now(), name: newPartName, retailPrice: p }]);
                                            setNewPartName("");
                                            setNewPartPrice("");
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
                                <span className="text-zinc-200 text-xs font-normal">合計見積額 (税別)</span>
                            </div>
                            <span className="text-2xl font-mono tracking-tight">¥{grandTotal.toLocaleString()}</span>
                        </div>
                    </Card>

                    <Card className="p-3 bg-white space-y-3 shadow-sm h-1/4">
                        <div className="flex items-center gap-2 mb-1"><FileText className="w-4 h-4 text-zinc-400" /><h3 className="text-xs font-bold font-bold">依頼・備考メモ</h3></div>
                        <div><Label className="text-[10px] text-zinc-400 font-bold ml-1">依頼内容 (お客様要望)</Label><textarea value={requestContent} onChange={e => setRequestContent(e.target.value)} className="w-full h-16 p-2 text-xs border border-zinc-200 rounded-md bg-zinc-50 focus:bg-white transition-colors resize-none" /></div>
                        <div><Label className="text-[10px] text-zinc-400 font-bold ml-1">社内備考 (技術メモ)</Label><textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} className="w-full h-12 p-2 text-xs border border-zinc-200 rounded-md bg-zinc-50 focus:bg-white transition-colors resize-none" /></div>
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
                                <span className="text-xs font-bold text-blue-600">処理中...</span>
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
                                    <p className="text-sm font-bold">写真がありません</p>
                                    <p className="text-[10px]">修理品の状態を撮影して追加してください</p>
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

            {/* 重複警告ダイアログ (Repair Entry screen version) */}
            <Dialog open={showDupDialog} onOpenChange={setShowDupDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="w-5 h-5" /> 重複の可能性があります
                        </DialogTitle>
                        <DialogDescription className="pt-2 text-zinc-600 text-xs">
                            同じ名称の顧客が既に見つかりました。既存の顧客を選択するか（候補から選ぶ）、被っていても新しく作成するか選んでください。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">一致する既存顧客:</p>
                        {dupResults.map(c => (
                            <div key={c.id} className="p-2.5 bg-zinc-50 border rounded-md text-xs flex justify-between items-center group hover:border-blue-300 cursor-pointer transition-all"
                                onClick={() => {
                                    setCustomerId(c.id);
                                    setCustomerName(c.name);
                                    setCustomerCategory(c.type === 'business' ? 'B2B' : 'B2C');
                                    setCustomerPrefix(c.prefix || "");
                                    if (c.phone || c.lineId) setLineId(c.phone || c.lineId);
                                    if (c.address) setAddress(c.address);
                                    setShowDupDialog(false);
                                    toast({ title: "既存顧客を選択しました", description: `${c.name} を修理に紐付けます。` });
                                }}
                            >
                                <div>
                                    <div className="font-bold text-zinc-900">{c.name}</div>
                                    <div className="text-[10px] text-zinc-500">電話: {c.phone || "不明"} / Prefix: <span className="font-mono font-bold">{c.prefix}</span></div>
                                </div>
                                <div className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold opacity-0 group-hover:opacity-100">これを選択</div>
                            </div>
                        ))}
                    </div>
                    <DialogFooter className="gap-2 sm:gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setShowDupDialog(false)} className="text-xs">キャンセル・修正</Button>
                        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-xs" onClick={() => { setShowDupDialog(false); handleSave(true); }}>
                            被っていても新規で保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
