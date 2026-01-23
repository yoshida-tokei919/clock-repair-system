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
import { MasterValidators, ValidationMessages } from "@/lib/validators";
import { getBrands, getModels, getCalibers, getCalibersForModel, getCalibersForRef, getPricingRules, getPartsMatched, upsertBrand, upsertModel, upsertCaliber, getRefsByModel, upsertRef } from "@/actions/master-actions";

// Dynamically import PDF component to avoid SSR issues with @react-pdf/renderer
const PDFPreviewDialog = dynamic(() => import("@/components/repairs/PDFPreviewDialog"), {
    ssr: false,
    loading: () => <Button variant="outline" size="sm" disabled><FileText className="w-4 h-4 mr-1" /> Loading PDF...</Button>
});
const TagPreviewDialog = dynamic(() => import("@/components/repairs/TagPreviewDialog"), {
    ssr: false
});
import { LinePreviewModal } from "@/components/line/LinePreviewModal";
import { QuickRegisterDialog, RegisterData } from "@/components/repairs/QuickRegisterDialog";

// --- Types ---
interface WorkItem { id: string; name: string; price: number; }
interface PartItem { id: string; name: string; retailPrice: number; supplier?: string; notes?: string; }
type RepairStatus = "estimate" | "parts_wait" | "working" | "completed" | "delivered";
interface Partner { id: string; name: string; prefix: string; currentSeq: number; }

const formatPartOption = (p: any) => `${p.name} [${p.supplier || "-"}] - ¥${p.retailPrice.toLocaleString()}`;

// --- Status Timeline Data ---
const STATUS_STEPS: { id: RepairStatus; label: string }[] = [
    { id: "estimate", label: "見積・受付" },
    { id: "parts_wait", label: "部品待ち" },
    { id: "working", label: "作業中" },
    { id: "completed", label: "完了" },
    { id: "delivered", label: "納品済" },
];

// --- Inline Components ---

// 1. Status Timeline (Restored with Date Picker)
const StatusTimeline: React.FC<{
    currentStatus: RepairStatus;
    statusLog: Record<string, string>;
    onStatusClick: (status: RepairStatus) => void;
    onDateChange: (status: RepairStatus, date: string) => void;
}> = ({ currentStatus, statusLog, onStatusClick, onDateChange }) => {
    const currentIndex = STATUS_STEPS.findIndex(s => s.id === currentStatus);

    return (
        <div className="w-full bg-white border-b border-zinc-200 px-4 py-3 mb-2 overflow-x-auto">
            <div className="flex items-center justify-between min-w-[600px]">
                {STATUS_STEPS.map((step, idx) => {
                    const isCompleted = idx <= currentIndex;
                    const isCurrent = step.id === currentStatus;
                    // Conversions for date input (YYYY-MM-DD)
                    const logDate = statusLog[step.id];
                    let dateValue = "";
                    if (logDate) {
                        const d = new Date(logDate);
                        if (!isNaN(d.getTime())) {
                            // Adjust for timezone offset if necessary to show correct local day
                            // But statusLog is often LocaleString.
                            // Simple approach: if logDate is YYYY/MM/DD, parse manually
                            const parts = logDate.split('/');
                            if (parts.length === 3) {
                                dateValue = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                            } else {
                                try { dateValue = new Date(logDate).toISOString().split("T")[0]; } catch (e) { }
                            }
                        }
                    }

                    return (
                        <div key={step.id} className="flex flex-col items-center relative flex-1 group" >
                            {/* Connector Line */}
                            {idx < STATUS_STEPS.length - 1 && (
                                <div className={cn("absolute top-3 left-[50%] w-full h-0.5 z-0", idx < currentIndex ? "bg-blue-500" : "bg-zinc-200")} />
                            )}

                            {/* Circle (Clickable to toggle status) */}
                            <div
                                className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 transition-all mb-1 cursor-pointer",
                                    isCurrent ? "bg-blue-600 border-blue-600 shadow-md scale-110" :
                                        isCompleted ? "bg-white border-blue-500" : "bg-white border-zinc-300"
                                )}
                                onClick={() => onStatusClick(step.id)}
                            >
                                {isCompleted && <Check className={cn("w-3 h-3 value-none", isCurrent ? "text-white" : "text-blue-500")} />}
                            </div>

                            {/* Label */}
                            <span
                                className={cn("text-xs font-bold transition-colors cursor-pointer", isCurrent ? "text-blue-700" : isCompleted ? "text-zinc-700" : "text-zinc-400")}
                                onClick={() => onStatusClick(step.id)}
                            >
                                {step.label}
                            </span>

                            {/* Date Picker (Restored) */}
                            <div className="h-5 mt-1">
                                {isCompleted ? (
                                    <input
                                        type="date"
                                        className="text-[10px] bg-transparent border-0 text-zinc-500 font-mono w-[80px] text-center focus:outline-none focus:ring-0 cursor-pointer hover:bg-zinc-50 rounded"
                                        value={dateValue}
                                        onChange={(e) => onDateChange(step.id, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
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

// 2. Partner Register Dialog (Restored Logic)
const PartnerRegisterDialog: React.FC<{
    isOpen: boolean;
    initialName: string;
    onClose: () => void;
    onRegister: (data: { name: string; prefix: string; address?: string; phone?: string }) => void;
}> = ({ isOpen, initialName, onClose, onRegister }) => {
    const [name, setName] = useState(initialName);
    const [prefix, setPrefix] = useState("");
    const [customPrefix, setCustomPrefix] = useState("");
    const [isCustom, setIsCustom] = useState(false);
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");

    useEffect(() => { setName(initialName); setPrefix(""); setCustomPrefix(""); setIsCustom(false); }, [initialName, isOpen]);

    if (!isOpen) return null;

    // Common Prefixes
    const SUGGESTED_PREFIXES = ["T", "JK", "E", "M", "K"];

    const handleSave = () => {
        const finalPrefix = isCustom ? customPrefix : prefix;
        if (!name || !finalPrefix) { alert("名前とプレフィックスは必須です"); return; }
        onRegister({ name, prefix: finalPrefix, address, phone });
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-xl w-[400px] overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-3 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        <User className="w-5 h-5" /> 取引先新規登録 (New Partner)
                    </h3>
                    <button onClick={onClose} className="hover:bg-white/20 p-1 rounded"><CheckCircle className="w-5 h-5" /></button>
                </div>
                <div className="p-4 space-y-4">
                    <div className="bg-blue-50 p-2 rounded-md text-xs text-blue-800 border border-blue-100 mb-2">
                        <p>取引先のプレフィックス（管理番号の頭文字）を設定してください。</p>
                        <p className="font-bold mt-1">例: TRUST → "T" (T-001...)</p>
                    </div>

                    <div>
                        <Label>取引先名 (Name)</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} className="font-bold" />
                    </div>

                    <div>
                        <Label>プレフィックス (Prefix)</Label>
                        <div className="flex gap-2 flex-wrap mb-2">
                            {SUGGESTED_PREFIXES.map(p => (
                                <button
                                    key={p}
                                    onClick={() => { setPrefix(p); setIsCustom(false); }}
                                    className={cn("px-3 py-1 rounded border text-sm font-bold transition-all",
                                        (!isCustom && prefix === p) ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white hover:bg-zinc-50 text-zinc-700")}
                                >
                                    {p}
                                </button>
                            ))}
                            <button
                                onClick={() => setIsCustom(true)}
                                className={cn("px-3 py-1 rounded border text-sm font-bold transition-all",
                                    isCustom ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white hover:bg-zinc-50 text-zinc-700")}
                            >
                                Custom
                            </button>
                        </div>
                        {isCustom && (
                            <Input
                                placeholder="Enter custom prefix (e.g. ABC)"
                                value={customPrefix}
                                onChange={e => setCustomPrefix(e.target.value.toUpperCase())}
                                maxLength={5}
                                className="font-mono uppercase"
                                autoFocus
                            />
                        )}
                        <div className="mt-1 text-right text-xs text-zinc-500">
                            Auto ID Preview: <span className="font-mono font-bold text-blue-600">{(isCustom ? customPrefix : prefix) || "?"}-001</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <Label>電話 (Tel)</Label>
                            <Input value={phone} onChange={e => setPhone(e.target.value)} className="h-8" />
                        </div>
                        <div>
                            <Label>住所 (Addr)</Label>
                            <Input value={address} onChange={e => setAddress(e.target.value)} className="h-8" />
                        </div>
                    </div>
                </div>
                <div className="p-3 bg-zinc-50 border-t flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">登録 (Register)</Button>
                </div>
            </div>
        </div>
    );
};

// 3. Advanced Combobox (Reused)
interface AdvancedComboboxProps {
    value: string;
    onChange: (value: string) => void;
    onUpsert?: (value: string) => void;
    placeholder?: string;
    options: { label: string, value: string }[];
    disabled?: boolean;
    validator?: (value: string) => boolean;
    validationMessage?: string;
}

const AdvancedCombobox: React.FC<AdvancedComboboxProps> = ({ value, onChange, onUpsert, placeholder, options, disabled, validator, validationMessage }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const safeOptions = Array.isArray(options) ? options : [];
    const filtered = safeOptions.filter(opt => opt.label && opt.label.toLowerCase().includes(search.toLowerCase()));
    const exactMatch = safeOptions.some(opt => opt.value === search || opt.label === search);
    const selectedLabel = safeOptions.find(o => o.value === value)?.label || value;

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setSearch("");
            setError(null);
            setHighlightedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
    };

    const handleCreateNew = () => {
        if (validator && !validator(search)) { if (!confirm(`警告: ${validationMessage}\n登録しますか？`)) return; }
        if (onUpsert) { onUpsert(search); setIsOpen(false); setSearch(""); }
        else { onChange(search); setIsOpen(false); }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === "Enter" || e.key === "ArrowDown") { setIsOpen(true); e.preventDefault(); }
            return;
        }

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setHighlightedIndex(prev => (prev + 1) % filtered.length);
                break;
            case "ArrowUp":
                e.preventDefault();
                setHighlightedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
                break;
            case "Enter":
                e.preventDefault();
                if (filtered.length > 0) {
                    handleSelect(filtered[highlightedIndex].value);
                } else if (search && onUpsert) {
                    handleCreateNew();
                }
                break;
            case "Escape":
                setIsOpen(false);
                break;
        }
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <div
                className={cn("flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm cursor-pointer hover:bg-zinc-50 transition-colors", disabled ? "opacity-50 pointer-events-none bg-zinc-100" : "", value ? "font-bold text-zinc-900" : "text-muted-foreground")}
                onClick={(e) => {
                    if (disabled) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(prev => !prev);
                }}
            >
                <div className="truncate pr-4">{selectedLabel ? selectedLabel : (placeholder || "Select...")}</div>
                <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
            </div>
            {isOpen && (
                <div className="absolute z-[999] mt-1 w-full rounded-md border bg-popover shadow-md bg-white dark:bg-zinc-800 p-1 min-w-[300px]">
                    <Input
                        ref={inputRef}
                        autoFocus
                        className="h-8 mb-1"
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setHighlightedIndex(0); }}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                    />
                    {error && <p className="text-xs text-red-500 pl-1 font-bold">{error}</p>}
                    <div className="max-h-[300px] overflow-auto">
                        {!exactMatch && search && onUpsert && (
                            <div className="p-2 text-sm text-blue-600 cursor-pointer hover:bg-blue-50 font-bold" onClick={handleCreateNew}>+ "{search}" を新規登録</div>
                        )}
                        {filtered.map((opt, idx) => (
                            <div
                                key={opt.value}
                                className={cn("p-1.5 text-sm cursor-pointer rounded-sm border-b border-zinc-50 last:border-0", highlightedIndex === idx ? "bg-blue-100 text-blue-900 font-bold" : "hover:bg-accent")}
                                onClick={() => handleSelect(opt.value)}
                                onMouseEnter={() => setHighlightedIndex(idx)}
                            >
                                {opt.label}
                            </div>
                        ))}
                        {filtered.length === 0 && !search && <div className="p-2 text-xs text-muted-foreground">Type to search...</div>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default function RepairEntryPage() {
    // --- Core State ---
    const [status, setStatus] = useState<RepairStatus>("estimate");
    const [statusLog, setStatusLog] = useState<Record<string, string>>({ "estimate": new Date().toLocaleDateString("ja-JP") });

    // --- Partner & Customer Info (F-01) ---
    const [partners, setPartners] = useState<Partner[]>([]);

    // Partner Register Dialog State
    const [partnerDialog, setPartnerDialog] = useState<{
        isOpen: boolean;
        initialName: string;
    }>({ isOpen: false, initialName: "" });

    // Fetch Partners from API
    useEffect(() => {
        fetch('/api/partners')
            .then(res => res.json())
            .then(data => {
                if (data.partners) setPartners(data.partners);
            })
            .catch(err => console.error("Failed to fetch partners", err));
    }, []);

    // Derived options for Combobox
    const partnerOptions = useMemo(() => partners.map(p => ({ label: p.name, value: p.name })), [partners]);

    const [customerCategory, setCustomerCategory] = useState<"B2B" | "B2C">("B2B");
    const [customerName, setCustomerName] = useState("");
    const [contactPerson, setContactPerson] = useState("");
    const [endUserName, setEndUserName] = useState("");
    const [lineId, setLineId] = useState("");
    const [address, setAddress] = useState("");
    const [email, setEmail] = useState("");

    // --- Watch Specs (F-02) ---
    const [brand, setBrand] = useState("");
    const [model, setModel] = useState("");
    const [refName, setRefName] = useState("");
    const [caliber, setCaliber] = useState("");
    const [serial, setSerial] = useState("");
    const [accessories, setAccessories] = useState("");

    // --- Quote & Parts (F-12) ---
    const [repairType, setRepairType] = useState<"internal" | "external">("internal");
    const [selectedWorks, setSelectedWorks] = useState<WorkItem[]>([]);
    const [selectedParts, setSelectedParts] = useState<PartItem[]>([]);

    // --- Request & Notes ---
    const [requestContent, setRequestContent] = useState("");
    const [internalNotes, setInternalNotes] = useState("");
    const [customerComm, setCustomerComm] = useState("");

    // IDs (F-01 refined)
    // Calc Management No (Our Ref) logic:
    // If B2B, Prefix + (Seq + 1). But this is only confirmed AFTER we select the partner.
    // So we display a placeholder or the PREVIEW based on selected partner.
    const selectedPartnerData = useMemo(() => partners.find(p => p.name === customerName), [partners, customerName]);
    const inquiryIdPreview = useMemo(() => {
        if (customerCategory === "B2B" && selectedPartnerData) {
            const nextSeq = (selectedPartnerData.currentSeq || 0) + 1;
            return `${selectedPartnerData.prefix || "?"}-${String(nextSeq).padStart(3, '0')} (Preview)`;
        }
        return "Auto-Generated (R-202X-...)";
    }, [customerCategory, selectedPartnerData]);

    const [partnerRef, setPartnerRef] = useState(""); // Their Ref (Manual)

    const router = useRouter(); // Need import from next/navigation
    const [isSaving, setIsSaving] = useState(false);

    // --- Photos (Fixed) ---
    const [uploadedPhotos, setUploadedPhotos] = useState<Array<{ storageKey: string, fileName: string, mimeType: string }>>([]);

    const handleSave = async () => {
        if (!brand) {
            alert("必須項目（ブランド）が入力されていません。");
            return;
        }

        setIsSaving(true);
        try {
            // Find Partner ID if B2B
            const partner = customerCategory === "B2B" ? partners.find(p => p.name === customerName) : null;

            // If ID is a timestamp (local only), send null to backend so it looks up by Name
            const isValidId = partner && partner.id.length < 10;

            const payload = {
                customer: {
                    id: isValidId ? partner?.id : null,
                    name: customerName,
                    type: customerCategory === "B2B" ? "business" : "individual",
                    phone: lineId, // Using lineId field as phone/contact for now for B2C matching
                    address: address,
                    email: email,
                    endUserName: endUserName, // B2B End User Name
                },
                watch: {
                    brand,
                    model,
                    ref: refName, // Might need to pass if we want to save it
                    serial,
                    caliber
                },
                request: {
                    partnerRef,
                    accessories: accessories.split(",").map(s => s.trim()), // Simple CSV split
                    diagnosis: requestContent,
                    internalNotes
                },
                estimate: {
                    items: [
                        ...selectedWorks.map(w => ({ type: "labor", name: w.name, price: w.price })),
                        ...selectedParts.map(p => ({ type: "part", name: p.name, price: p.retailPrice }))
                    ]
                },
                status, // Send selected status
                statusLog, // Send all completed status dates
                photos: uploadedPhotos // Pass uploaded photo keys
            };

            const res = await fetch("/api/repairs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Save failed on server");
            }

            const result = await res.json();

            // Auto-Print Tag
            try {
                await fetch('/api/print-tag', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ repairId: result.repair.id })
                });
            } catch (printErr) {
                console.error("Auto-print failed:", printErr);
                // Non-blocking: Don't stop the redirect even if print fails
            }

            // Redirect to Detail Page
            router.push(`/repairs/${result.repair.id}`);

        } catch (error: any) {
            console.error(error);
            alert(`保存に失敗しました。\nエラー: ${error.message}`);
            setIsSaving(false);
        }
    };


    // --- F-06 / F-13 State ---
    const [isPdfOpen, setIsPdfOpen] = useState(false);
    const [pdfReady, setPdfReady] = useState(false);

    // F-13 Mock State
    const [linePreview, setLinePreview] = useState<{
        isOpen: boolean;
        recipient: string;
        message: string;
        attachType?: "pdf" | null;
    }>({ isOpen: false, recipient: "", message: "", attachType: null });

    // --- Options ---
    const [brandOptions, setBrandOptions] = useState<any[]>([]);
    const [modelOptions, setModelOptions] = useState<any[]>([]);
    const [refOptions, setRefOptions] = useState<any[]>([]);
    const [workOptions, setWorkOptions] = useState<any[]>([]);
    const [partsOptions, setPartsOptions] = useState<any[]>([]);

    // --- Effects ---
    useEffect(() => {
        const loadBrands = async () => {
            const brandsRaw = await getBrands();
            setBrandOptions(brandsRaw.map(b => ({ label: b.name, value: b.name })));
        };
        loadBrands();
    }, []);

    const [allRefsList, setAllRefsList] = useState<any[]>([]);

    // 1. Load Models & Refs based on Brand/Model
    useEffect(() => {
        const loadModelsAndRefs = async () => {
            if (!brand) {
                setModelOptions([]);
                setRefOptions([]);
                setAllRefsList([]);
                return;
            }

            const brandsList = await getBrands();
            const b = brandsList.find(x => x.name === brand);
            if (!b) return;

            // Load Models
            const mRaw = await getModels(b.id);
            setModelOptions(mRaw.map(m => ({ label: m.nameJp, value: m.nameJp })));

            // Load Refs narrowed by Model
            const m = model ? mRaw.find(x => x.nameJp === model) : null;
            if (m) {
                const rRaw = await getRefsByModel(m.id);
                setRefOptions(rRaw.map(r => ({ label: r.name, value: r.name })));
                setAllRefsList(rRaw);
            } else {
                setRefOptions([]);
                setAllRefsList([]);
            }
        };
        loadModelsAndRefs();
    }, [brand, model]);

    // 2. Load Calibers - Narrowed by Ref No. primarily
    useEffect(() => {
        const loadCalibersNarrowed = async () => {
            if (!brand) {
                const allCals = await getCalibers();
                setCalOptions(allCals.map(c => ({ label: c.name, value: c.name })));
                return;
            }

            const brandsList = await getBrands();
            const b = brandsList.find(x => x.name === brand);
            if (!b) return;

            // If Ref is selected, narrow Caliber options by Ref
            if (refName && allRefsList.length > 0) {
                const match = allRefsList.find(r => r.name === refName);
                if (match) {
                    const refCals = await getCalibersForRef(match.id);
                    if (refCals.length > 0) {
                        setCalOptions(refCals.map(c => ({ label: c.name, value: c.name })));
                        return;
                    }
                }
            }

            // Otherwise, show all calibers for the brand (per user request to NOT narrow by Model directly)
            const allBrandCals = await getCalibers(b.id);
            setCalOptions(allBrandCals.map(c => ({ label: c.name, value: c.name })));
        };
        loadCalibersNarrowed();
    }, [brand, refName, allRefsList, model]);

    const [calOptions, setCalOptions] = useState<{ label: string, value: string }[]>([]);

    // Sync work/parts
    useEffect(() => {
        const loadPricingAndParts = async () => {
            const brandsList = await getBrands();
            const b = brandsList.find(x => x.name === brand);
            if (!b) return;

            const mRaw = await getModels(b.id);
            const m = model ? mRaw.find(x => x.nameJp === model) : null;

            const calsList = await getCalibers();
            const c = caliber ? calsList.find(x => x.name === caliber) : null;

            const [rules, parts] = await Promise.all([
                getPricingRules(b.id, m?.id, c?.id),
                getPartsMatched(b.id, m?.id, c?.id)
            ]);

            setWorkOptions(rules.map(r => ({
                id: String(r.id),
                name: r.suggestedWorkName,
                price: r.minPrice
            })));

            setPartsOptions(parts.map(p => ({
                id: String(p.id),
                name: p.name,
                retailPrice: p.retailPrice,
                supplier: p.supplier,
                notes: p.notes
            })));
        };

        if (brand) {
            loadPricingAndParts();
        }
    }, [brand, model, caliber]);

    // --- Handlers ---
    const handlePartnerUpsert = (val: string) => {
        setPartnerDialog({ isOpen: true, initialName: val });
    };

    const handlePartnerRegisterSubmit = async (data: { name: string; prefix: string; address?: string; phone?: string }) => {
        try {
            const res = await fetch("/api/partners", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            if (!res.ok) {
                const errData = await res.json();
                // Enhanced Error Handling
                if (res.status === 409) {
                    // Conflict: Partner Already Exists
                    // In this case, we should probably just select the existing one.
                    alert(`「${data.name}」は既に登録されています。既存のデータをセットします。`);

                    // Re-fetch partners to make sure we have the latest data
                    const partnersRes = await fetch('/api/partners');
                    const partnersData = await partnersRes.json();
                    if (partnersData.partners) {
                        setPartners(partnersData.partners);
                        // Find the partner
                        const existing = partnersData.partners.find((p: any) => p.name === data.name);
                        if (existing) {
                            setCustomerName(existing.name);
                            if (data.address && !existing.address) setAddress(data.address);
                        }
                    }
                    setPartnerDialog({ isOpen: false, initialName: "" });
                    return;
                }
                throw new Error(errData.error || "Failed to register partner");
            }

            const result = await res.json();
            const newPartner = result.partner;

            // Update State
            setPartners(prev => [...prev, newPartner]);
            setCustomerName(newPartner.name); // Auto Select
            if (data.address) setAddress(data.address);
            setPartnerDialog({ isOpen: false, initialName: "" });

        } catch (e: any) {
            alert(`登録エラー: ${e.message}`);
        }
    };


    const handleBrandUpsert = async (val: string) => {
        await upsertBrand(val);
        const brands = await getBrands();
        setBrandOptions(brands.map(b => ({ label: b.name, value: b.name })));
        setBrand(val);
    };

    const handleModelUpsert = async (val: string) => {
        if (!brand) {
            alert("ブランドを先に選択または入力してください。");
            return;
        }
        await upsertModel(brand, val);
        const brandsList = await getBrands();
        const b = brandsList.find(x => x.name === brand);
        if (b) {
            const models = await getModels(b.id);
            setModelOptions(models.map(m => ({ label: m.nameJp, value: m.nameJp })));
        }
        setModel(val);
    };

    const handleCaliberUpsert = async (val: string) => {
        const brandsList = await getBrands();
        const b = brandsList.find(x => x.name === brand);
        await upsertCaliber(val, b?.id);

        const allCals = await getCalibers();
        setCalOptions(allCals.map(c => ({ label: c.name, value: c.name })));
        setCaliber(val);
    };

    const handleRefUpsert = async (val: string) => {
        if (!brand || !model) {
            alert("ブランドとモデルを先に選択または入力してください。");
            return;
        }
        await upsertRef(model, brand, val, caliber);

        // Refresh Ref list
        const brandsList = await getBrands();
        const b = brandsList.find(x => x.name === brand);
        if (b) {
            const mRaw = await getModels(b.id);
            const m = mRaw.find(x => x.nameJp === model);
            if (m) {
                const rRaw = await getRefsByModel(m.id);
                setRefOptions(rRaw.map(r => ({ label: r.name, value: r.name })));
                setAllRefsList(rRaw);
            }
        }
        setRefName(val);
    };


    const handleStatusToggle = (stepId: RepairStatus) => {
        const isAlreadyDone = !!statusLog[stepId];

        if (isAlreadyDone) {
            if (confirm(`ステータス「${STATUS_STEPS.find(s => s.id === stepId)?.label}」の日付リセットしますか？\n（履歴から削除されます）`)) {
                const newLog = { ...statusLog };
                delete newLog[stepId];
                setStatusLog(newLog);
            }
        } else {
            setStatus(stepId);
            setStatusLog({ ...statusLog, [stepId]: new Date().toLocaleDateString("ja-JP") });
        }
    };

    const handleStatusDateChange = (stepId: RepairStatus, dateStr: string) => {
        if (!dateStr) {
            const newLog = { ...statusLog };
            delete newLog[stepId];
            setStatusLog(newLog);
            return;
        }
        // Format YYYY-MM-DD -> Locale String (JP format usually YYYY/MM/DD)
        const d = new Date(dateStr);
        setStatusLog({ ...statusLog, [stepId]: d.toLocaleDateString("ja-JP") });
    };

    const handleLineNotify = () => {
        if (!lineId && !email && !customerName) {
            alert("LINE送信先（LINE ID, TEL, または顧客名）が見つかりません。");
            return;
        }

        const recipient = lineId || customerName || "お客様";
        const currentStatusLabel = STATUS_STEPS.find(s => s.id === status)?.label;
        const msg = `お世話になっております。\n\nお預かりしている時計のステータスが「${currentStatusLabel}」に更新されました。\n\nご確認のほどよろしくお願いいたします。`;

        setLinePreview({
            isOpen: true,
            recipient: recipient,
            message: msg,
            attachType: null
        });
    };

    const handlePdfLineSend = () => {
        const recipient = lineId || customerName || "お客様";
        const msg = `お世話になっております。\n\n修理のお見積書を作成いたしました。\nPDFファイルを送付いたしますので、内容をご確認ください。\n\nご不明な点がございましたらお気軽にご連絡ください。`;

        setLinePreview({
            isOpen: true,
            recipient: recipient,
            message: msg,
            attachType: "pdf"
        });
    };

    // --- Register Dialog State (F-12) ---
    const [registerDialog, setRegisterDialog] = useState<{
        isOpen: boolean;
        mode: "work" | "part";
        initialName: string;
    }>({ isOpen: false, mode: "work", initialName: "" });

    const openRegisterDialog = (mode: "work" | "part", name: string) => {
        setRegisterDialog({ isOpen: true, mode, initialName: name });
    };

    const handleRegisterSubmit = (data: RegisterData) => {
        if (registerDialog.mode === "work") {
            const newWork = MasterService.upsertWork({
                name: data.name,
                price: data.price,
                category: repairType,
                targetId: repairType === "internal" ? (caliber || "c2") : (refName || "r1")
            });

            // Refresh Options
            let wCS: any[] = [];
            if (repairType === "internal" && caliber) wCS = MasterService.getInternalWorkOptions(caliber);
            else if (repairType === "external" && refName) wCS = MasterService.getExternalWorkOptions(refName);
            setWorkOptions(wCS);

            // Select it
            if (newWork) {
                setSelectedWorks(prev => [...prev, { id: newWork.id, name: newWork.name, price: newWork.price }]);
            }

        } else {
            const newPart = MasterService.upsertPart({
                type: repairType,
                brandId: "b1",
                targetId: repairType === "internal" ? (caliber || "c2") : (refName ? "r1" : "unknown"),
                name: data.name,
                ref: `${data.name}-NEW`,
                costPrice: data.cost || 0,
                retailPrice: data.price,
                stock: 0,
                supplier: data.supplier,
                notes: "Manual Entry"
            });

            // Refresh options
            let updatedOptions = [...partsOptions];
            if (repairType === "internal" && caliber) updatedOptions = MasterService.getPartsForCaliber(caliber);
            else if (repairType === "external" && refName) updatedOptions = MasterService.getPartsForRef(refName);
            setPartsOptions(updatedOptions);

            // Select it
            if (newPart) {
                setSelectedParts(prev => [...prev, { id: newPart.id, name: newPart.name, retailPrice: newPart.retailPrice, supplier: newPart.supplier, notes: newPart.notes }]);
            }
        }
    };

    // --- PDF Data Prep (F-06 Integration) ---
    const pdfData = useMemo(() => {
        const items = [
            ...selectedWorks.map(w => ({ name: w.name, qty: 1, price: w.price })),
            ...selectedParts.map(p => ({ name: p.name, qty: 1, price: p.retailPrice }))
        ];

        // Totals for Invoice (Calculated inside memo to ensure consistency)
        const total = items.reduce((s, i) => s + i.price, 0);
        const tax = Math.floor(total * 0.1);
        const totalWithTax = total + tax;

        // Mock Delivery Data for B2B Invoice
        const deliveryData = customerCategory === "B2B" ? [{
            date: new Date().toLocaleDateString("ja-JP"),
            slipNo: `Dep-${Date.now().toString().slice(-6)}`,
            count: items.length,
            amount: totalWithTax // Tax Inc
        }] : undefined;

        // Auto ID logic based on Preview (or fallback)
        const finalInquiryId = (customerCategory === "B2B" && selectedPartnerData)
            ? `${selectedPartnerData.prefix}-${selectedPartnerData.currentSeq + 1}`
            : `Rep-${Date.now().toString().slice(-6)}`;

        return {
            id: `Est-${Date.now()}`,
            date: new Date().toLocaleDateString("ja-JP"),
            customer: {
                name: customerName || "お客様",
                type: (customerCategory === "B2B" ? "business" : "individual") as "business" | "individual",
                address: address
            },
            jobs: [{
                inquiryId: finalInquiryId,
                partnerRef: partnerRef,
                endUser: endUserName,
                watch: { brand, model, ref: refName, serial },
                items: items,
                photos: []
            }],
            deliveries: deliveryData
        };
    }, [customerName, customerCategory, address, endUserName, brand, model, refName, serial, selectedWorks, selectedParts, partnerRef, selectedPartnerData]);

    // Totals
    const techTotal = selectedWorks.reduce((s, w) => s + w.price, 0);
    const partsTotal = selectedParts.reduce((s, p) => s + p.retailPrice, 0);
    const grandTotal = techTotal + partsTotal;

    return (
        <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 p-2 font-sans text-zinc-900 dark:text-zinc-100">
            {/* Top Bar */}
            <div className="mb-2">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-8 gap-1"><ArrowLeft className="w-4 h-4" /> Back</Button>
                        <h1 className="text-lg font-bold tracking-tight text-zinc-700 dark:text-zinc-200">新規修理受付</h1>
                    </div>
                    {/* F-06 & F-13 Actions */}
                    <div className="flex items-center gap-2">
                        {/* F-13: LINE Notify */}
                        <Button variant="outline" size="sm" className="h-8 gap-1 border-green-500 text-green-600 hover:bg-green-50" onClick={handleLineNotify}>
                            <MessageCircle className="w-4 h-4" /> LINE通知
                        </Button>

                        {/* F-06: PDF Estimate (Isolated Component) */}
                        <PDFPreviewDialog
                            data={{
                                ...pdfData,
                                estimateNumber: `EST-${Date.now()}`
                            }}
                            mode="estimate"
                            className="h-8 gap-1 border-zinc-400 text-zinc-600"
                            onLineSend={handlePdfLineSend}
                        />

                        {/* F-08: Tag Print */}
                        <TagPreviewDialog
                            data={{
                                repairId: pdfData.id, // Use same ID or specific Repair ID
                                id: pdfData.id,
                                customerName: customerName || "Customer",
                                modelName: model || brand || "-",

                                date: new Date().toLocaleDateString("ja-JP")
                            }}
                            className="h-8 gap-1 border-zinc-400 text-zinc-600"
                        />

                        {/* Request: Invoice Generation (Corrected) */}
                        <PDFPreviewDialog
                            data={{
                                ...pdfData,
                                estimateNumber: `INV-${Date.now()}`
                            }}
                            mode="invoice"
                            className="h-8 gap-1 border-zinc-400 text-zinc-600"
                            onLineSend={handlePdfLineSend}
                        />

                        {/* F-07: Warranty */}
                        <PDFPreviewDialog
                            data={{
                                id: `WAR-${Date.now()}`,
                                repairId: pdfData.jobs[0].inquiryId || "",
                                customerName: endUserName || customerName || "お客様",
                                watch: { brand, model, ref: refName, serial },
                                repairDate: new Date().toLocaleDateString("ja-JP"),
                                expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString("ja-JP"),
                                guaranteeContent: "オーバーホール"
                            }}
                            mode="warranty"
                            className="h-8 gap-1 border-amber-400 text-amber-700 hover:bg-amber-50"
                        />


                        <Button size="sm" className="h-8 gap-1 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={isSaving}>
                            <Save className="w-4 h-4" /> {isSaving ? "Saving..." : "保存"}
                        </Button>
                    </div>
                </div>

                {/* Status Timeline (Full Width) - Restored */}
                <StatusTimeline
                    currentStatus={status}
                    statusLog={statusLog}
                    onStatusClick={handleStatusToggle}
                    onDateChange={handleStatusDateChange} // NEW PROP
                />

                {/* Line Preview Modal */}
                <LinePreviewModal
                    isOpen={linePreview.isOpen}
                    onClose={() => setLinePreview(prev => ({ ...prev, isOpen: false }))}
                    recipientName={linePreview.recipient}
                    messageText={linePreview.message}
                    attachmentType={linePreview.attachType}
                    attachmentTitle="御見積書.pdf"
                    onSend={() => {
                        alert("✅ LINE送信完了 (Mock)\n\n実際に連携するにはMessaging APIの設定が必要です。");
                        setLinePreview(prev => ({ ...prev, isOpen: false }));
                    }}
                />

                <div className="grid grid-cols-12 gap-2 h-[calc(100vh-140px)]">
                    {/* Left Column: Input Forms */}
                    <div className="col-span-3 flex flex-col gap-2 overflow-y-auto">
                        <Card className="p-2 bg-white border-zinc-300 rounded-sm space-y-2">
                            {/* F-01: Customer Info */}
                            <div>
                                <h3 className="text-xs font-bold text-zinc-500 mb-1 flex items-center gap-1">
                                    <User className="w-3 h-3" /> 顧客情報 (Customer)
                                </h3>
                                <div className="space-y-2">
                                    {/* Category Toggle */}
                                    <div className="flex bg-zinc-100 p-0.5 rounded border">
                                        <button onClick={() => setCustomerCategory("B2B")} className={cn("flex-1 text-xs font-bold py-1 rounded transition-all", customerCategory === "B2B" ? "bg-white shadow-sm text-blue-600" : "text-zinc-400")}>業者 (B2B)</button>
                                        <button onClick={() => setCustomerCategory("B2C")} className={cn("flex-1 text-xs font-bold py-1 rounded transition-all", customerCategory === "B2C" ? "bg-white shadow-sm text-green-600" : "text-zinc-400")}>一般 (B2C)</button>
                                    </div>

                                    {/* Dynamic Inputs */}
                                    {customerCategory === "B2B" ? (
                                        <>
                                            <div>
                                                <Label className="label-dense mb-0.5">得意先 (Partner)</Label>
                                                <AdvancedCombobox
                                                    value={customerName}
                                                    onChange={async (val) => {
                                                        setCustomerName(val);
                                                        // Auto-fill address/phone if exists in registered partners (mock)
                                                        const p = partners.find(x => x.name === val);
                                                        if (p) {
                                                            if (p.prefix) setAddress(`${p.prefix}-${(p.currentSeq || 0) + 1}`); // Just as debug info really
                                                        }
                                                    }}
                                                    onUpsert={handlePartnerUpsert}
                                                    options={partnerOptions}
                                                    placeholder="得意先を選択..."
                                                    validationMessage="新しい取引先を登録します。"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <Label className="label-dense mb-0.5">担当者 (Contact)</Label>
                                                    <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="h-7 text-xs" />
                                                </div>
                                                <div>
                                                    {/* Partner Ref = Their Slip No */}
                                                    <Label className="label-dense mb-0.5 text-blue-600">貴社伝票番号</Label>
                                                    <Input value={partnerRef} onChange={e => setPartnerRef(e.target.value)} className="h-7 text-xs font-mono border-blue-200 bg-blue-50/50" placeholder="1234..." />
                                                </div>
                                            </div>
                                            <div>
                                                <Label className="label-dense mb-0.5">自社管理番号 (Our Ref)</Label>
                                                <div className="h-7 text-xs bg-zinc-100 border rounded flex items-center px-2 font-mono text-zinc-600">
                                                    {inquiryIdPreview}
                                                </div>
                                            </div>
                                            <div>
                                                <Label className="label-dense mb-0.5">エンドユーザー (EndUser)</Label>
                                                <Input value={endUserName} onChange={e => setEndUserName(e.target.value)} className="h-7 text-xs" placeholder="氏名のみ" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <Label className="label-dense mb-0.5">氏名 (Name)</Label>
                                                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-7 text-xs font-bold" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <Label className="label-dense mb-0.5">電話 (Tel)</Label>
                                                    <Input value={lineId} onChange={e => setLineId(e.target.value)} className="h-7 text-xs" />
                                                </div>
                                                <div>
                                                    <Label className="label-dense mb-0.5">LINE ID</Label>
                                                    <Input value={lineId} onChange={e => setLineId(e.target.value)} className="h-7 text-xs" placeholder="Optional" />
                                                </div>
                                            </div>
                                            <div>
                                                <Label className="label-dense mb-0.5">住所 (Address)</Label>
                                                <Input value={address} onChange={e => setAddress(e.target.value)} className="h-7 text-xs" />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </Card>

                        <Card className="p-2 bg-white border-zinc-300 rounded-sm space-y-2">
                            {/* F-02: Watch Specs */}
                            <div>
                                <h3 className="text-xs font-bold text-zinc-500 mb-1 flex items-center gap-1">
                                    <Watch className="w-3 h-3" /> 時計情報 (Watch)
                                </h3>
                                <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="label-dense mb-0.5">ブランド (Brand)</Label>
                                            <AdvancedCombobox value={brand} onChange={setBrand} onUpsert={handleBrandUpsert} options={brandOptions} placeholder="Rolex..." />
                                        </div>
                                        <div>
                                            <Label className="label-dense mb-0.5">モデル (Model)</Label>
                                            <AdvancedCombobox value={model} onChange={setModel} onUpsert={handleModelUpsert} options={modelOptions} placeholder="Submariner..." />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="label-dense mb-0.5">Ref No.</Label>
                                            <AdvancedCombobox value={refName} onChange={setRefName} onUpsert={handleRefUpsert} options={refOptions} placeholder="126610LN..." />
                                        </div>
                                        <div>
                                            <Label className="label-dense mb-0.5">Caliber</Label>
                                            <AdvancedCombobox value={caliber} onChange={setCaliber} onUpsert={handleCaliberUpsert} options={calOptions} placeholder="Cal..." />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="label-dense mb-0.5">Serial No.</Label>
                                            <Input value={serial} onChange={e => setSerial(e.target.value)} className="h-7 text-xs font-mono" />
                                        </div>
                                        <div>
                                            <Label className="label-dense mb-0.5">付属品 (Acc)</Label>
                                            <Input value={accessories} onChange={e => setAccessories(e.target.value)} className="h-7 text-xs" placeholder="箱, 保証書..." />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Center Column: Quote & Request (F-03/F-12) */}
                    <div className="col-span-5 flex flex-col gap-2">
                        <Card className="flex-1 p-0 bg-white border-zinc-300 rounded-sm flex flex-col overflow-hidden">
                            <div className="p-2 bg-zinc-50 border-b flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-zinc-500" />
                                    <h2 className="font-bold text-sm text-zinc-700">数理見積 / Quote</h2>
                                </div>
                                <div className="flex bg-white border rounded p-0.5 scale-90">
                                    <button onClick={() => setRepairType("internal")} className={cn("px-2 py-0.5 text-xs font-bold rounded transition-all", repairType === "internal" ? "bg-blue-100 text-blue-700" : "text-zinc-500")}>内装</button>
                                    <button onClick={() => setRepairType("external")} className={cn("px-2 py-0.5 text-xs font-bold rounded transition-all", repairType === "external" ? "bg-green-100 text-green-700" : "text-zinc-500")}>外装</button>
                                </div>
                            </div>

                            <div className="p-2 flex-1 overflow-y-auto space-y-4">
                                {/* Tech Fee */}
                                <div>
                                    <h3 className="text-xs font-bold text-zinc-500 mb-1 border-b border-zinc-100 pb-1">1. 技術料</h3>
                                    <div className="mb-2">
                                        <AdvancedCombobox
                                            value=""
                                            options={workOptions.map(w => ({ label: `${w.name} (¥${w.price.toLocaleString()})`, value: w.id }))}
                                            onChange={(id) => { const w = workOptions.find(o => o.id === id); if (w && !selectedWorks.some(sw => sw.id === w.id)) setSelectedWorks([...selectedWorks, w]); }}
                                            onUpsert={(val) => openRegisterDialog("work", val)}
                                            placeholder="作業項目を選択..."
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        {selectedWorks.map((work, idx) => (
                                            <div key={idx} className="flex gap-1 items-center bg-zinc-50 p-1 rounded">
                                                <span className="text-xs flex-1">{work.name}</span>
                                                <span className="text-xs font-mono">¥{work.price.toLocaleString()}</span>
                                                <button onClick={() => { const n = [...selectedWorks]; n.splice(idx, 1); setSelectedWorks(n); }} className="text-zinc-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Parts */}
                                <div>
                                    <h3 className="text-xs font-bold text-zinc-500 mb-1 border-b border-zinc-100 pb-1 flex justify-between">
                                        <span>2. 部品</span>
                                        <span>Tgt: {repairType === "internal" ? caliber : refName}</span>
                                    </h3>
                                    <div className="mb-2">
                                        <AdvancedCombobox
                                            value=""
                                            options={partsOptions.map(p => ({ label: formatPartOption(p), value: p.id }))}
                                            onChange={(id) => { const p = partsOptions.find(o => o.id === id); if (p && !selectedParts.some(sp => sp.id === p.id)) setSelectedParts([...selectedParts, p]); }}
                                            onUpsert={(val) => openRegisterDialog("part", val)}
                                            placeholder={partsOptions.length > 0 ? "部品を選択..." : "該当なし(新規登録可)"}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        {selectedParts.map((part, idx) => (
                                            <div key={idx} className="flex gap-1 items-center bg-blue-50/30 p-1 rounded border border-blue-100">
                                                <div className="flex-1">
                                                    <div className="text-xs font-bold flex items-center gap-1">
                                                        {part.name}
                                                        {part.supplier && <span className="bg-white border rounded px-1 text-[10px] text-zinc-500">{part.supplier}</span>}
                                                    </div>
                                                    {part.notes && <div className="text-[10px] text-zinc-400">{part.notes}</div>}
                                                </div>
                                                <div className="text-xs font-mono font-bold">¥{part.retailPrice.toLocaleString()}</div>
                                                <button onClick={() => { const n = [...selectedParts]; n.splice(idx, 1); setSelectedParts(n); }} className="text-zinc-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <QuickRegisterDialog
                                    isOpen={registerDialog.isOpen}
                                    mode={registerDialog.mode}
                                    initialName={registerDialog.initialName}
                                    onClose={() => setRegisterDialog(prev => ({ ...prev, isOpen: false }))}
                                    onRegister={handleRegisterSubmit}
                                />

                                <PartnerRegisterDialog
                                    isOpen={partnerDialog.isOpen}
                                    initialName={partnerDialog.initialName}
                                    onClose={() => setPartnerDialog(prev => ({ ...prev, isOpen: false }))}
                                    onRegister={handlePartnerRegisterSubmit}
                                />
                            </div>

                            <div className="p-2 bg-zinc-50 border-t flex justify-between items-center text-sm font-bold text-zinc-700">
                                <span>合計</span>
                                <span className="text-lg">¥{grandTotal.toLocaleString()}</span>
                            </div>
                        </Card>

                        {/* Notes & Request Split */}
                        <Card className="p-2 bg-white border-zinc-300 rounded-sm space-y-2">
                            <div>
                                <Label className="label-dense mb-1">依頼内容 (Request)</Label>
                                <textarea value={requestContent} onChange={e => setRequestContent(e.target.value)} className="w-full p-2 text-xs border rounded-md resize-none h-16 bg-zinc-50" placeholder="修理依頼内容..."></textarea>
                            </div>
                            <div>
                                <Label className="label-dense mb-1">備考 (Notes)</Label>
                                <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} className="w-full p-2 text-xs border rounded-md resize-none h-12 bg-zinc-50" placeholder="社内備考..."></textarea>
                            </div>
                            <div>
                                <Label className="label-dense mb-1 text-blue-600">お客様連絡事項 (Customer Comm)</Label>
                                <textarea value={customerComm} onChange={e => setCustomerComm(e.target.value)} className="w-full p-2 text-xs border border-blue-100 rounded-md resize-none h-12 bg-blue-50/50" placeholder="見積時の連絡事項など..."></textarea>
                            </div>
                        </Card>
                    </div>

                    {/* Right Column: Photos */}
                    <div className="col-span-4 flex flex-col gap-2">
                        <Card className="flex-1 bg-zinc-200 border-zinc-300 rounded-sm overflow-hidden flex flex-col">
                            <div className="flex-1 flex items-center justify-center p-4">
                                <label className="text-center cursor-pointer hover:opacity-80 transition-opacity">
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                            if (!e.target.files?.length) return;
                                            const files = Array.from(e.target.files);

                                            for (const file of files) {
                                                const formData = new FormData();
                                                formData.append("file", file);
                                                // No repairId yet -> handled by API as temp/optional

                                                try {
                                                    const res = await fetch("/api/upload", {
                                                        method: "POST",
                                                        body: formData
                                                    });
                                                    if (!res.ok) throw new Error("Upload failed");
                                                    const data = await res.json();
                                                    if (data.success) {
                                                        setUploadedPhotos(prev => [...prev, {
                                                            storageKey: data.storageKey,
                                                            fileName: data.fileName,
                                                            mimeType: data.mimeType
                                                        }]);
                                                    }
                                                } catch (err) {
                                                    console.error("Upload Error", err);
                                                    alert("画像のアップロードに失敗しました");
                                                }
                                            }
                                        }}
                                    />
                                    <Camera className="w-10 h-10 text-zinc-400 mx-auto mb-2" />
                                    <p className="text-xs text-zinc-500 font-bold">クリックして写真を追加</p>
                                    <p className="text-[10px] text-zinc-400">Drag & Drop (Supported soon)</p>
                                </label>
                            </div>
                            <div className="bg-white p-2 border-t grid grid-cols-3 gap-2 h-32 overflow-y-auto">
                                {uploadedPhotos.map((photo, idx) => (
                                    <div key={idx} className="aspect-square bg-zinc-100 rounded-sm border border-zinc-200 relative group">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={photo.storageKey} alt="Uploaded" className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => {
                                                const n = [...uploadedPhotos];
                                                n.splice(idx, 1);
                                                setUploadedPhotos(n);
                                            }}
                                            className="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                                <label className="aspect-square bg-zinc-50 border border-dashed border-zinc-300 rounded-sm flex items-center justify-center cursor-pointer hover:bg-zinc-100">
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                            if (!e.target.files?.length) return;
                                            const files = Array.from(e.target.files);

                                            for (const file of files) {
                                                const formData = new FormData();
                                                formData.append("file", file);

                                                try {
                                                    const res = await fetch("/api/upload", {
                                                        method: "POST",
                                                        body: formData
                                                    });
                                                    if (!res.ok) throw new Error("Upload failed");
                                                    const data = await res.json();
                                                    if (data.success) {
                                                        setUploadedPhotos(prev => [...prev, {
                                                            storageKey: data.storageKey,
                                                            fileName: data.fileName,
                                                            mimeType: data.mimeType
                                                        }]);
                                                    }
                                                } catch (err) {
                                                    console.error("Upload Error", err);
                                                }
                                            }
                                        }}
                                    />
                                    <Plus className="w-5 h-5 text-zinc-400" />
                                </label>
                            </div>
                        </Card>
                    </div>

                </div>
            </div>
        </div>
    );
}
