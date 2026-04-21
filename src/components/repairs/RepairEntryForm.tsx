"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import imageCompression from 'browser-image-compression';
import {
    ArrowLeft, Camera, Printer, Save, Search, Check, ChevronDown, User, Watch,
    Settings, Trash2, Plus, Image as ImageIcon, MapPin, Phone, Mail, MessageCircle,
    Clock, CheckCircle, Smartphone, FileText, RefreshCw, AlertTriangle, ExternalLink, Calendar,
    Eye, Truck
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getShippingFeeByAddress } from "@/lib/shipping";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

// --- ACTIONS (Server) ---
import {
    getBrands, getModels, getCalibers, getCalibersForModel, getCalibersForRef,
    getPricingRules, getPartsMatched, upsertBrand, upsertModel, upsertCaliber,
    getRefsByModel, upsertRef
} from "@/actions/master-actions";
import { getCustomers } from "@/actions/customer-actions";

// --- COMPONENTS ---
import { QuickRegisterDialog } from "@/components/repairs/QuickRegisterDialog";
import { MobileConnectDialog } from "@/components/repairs/MobileConnectDialog";

// Dynamically import PDF Dialog (Client only)
const PDFPreviewDialog = dynamic(() => import("@/components/repairs/PDFPreviewDialog"), { ssr: false });

// Define Status Steps (FMP Style Linear Flow)
const STATUS_STEPS: { id: string; label: string }[] = [
    { id: "reception", label: "受付" },
    { id: "diagnosing", label: "見積中" },
    { id: "parts_wait", label: "部品待" },
    { id: "in_progress", label: "作業中" },
    { id: "completed", label: "完了" },
    { id: "delivered", label: "納品済" },
];

/**
 * INTELLIGENCE CACHE & COMBOBOX
 * Independent, highly-optimized component for fast lookups.
 */
const AdvancedCombobox: React.FC<{
    value: string;
    onChange: (v: string) => void;
    onSearchChange?: (s: string) => void;
    onUpsert?: (v: string) => void;
    placeholder?: string;
    options: { label: string, value: string, sub?: string, price?: number }[];
    disabled?: boolean;
    className?: string;
}> = ({ value, onChange, onSearchChange, onUpsert, placeholder, options, disabled, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Filter options client-side for speed
    const filtered = useMemo(() => {
        if (!search) return options;
        const low = search.toLowerCase();
        return options.filter(opt =>
            (opt.label || "").toLowerCase().includes(low) ||
            (opt.value || "").toLowerCase().includes(low)
        );
    }, [options, search]);

    const displayValue = isOpen ? search : value;

    // Handle outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Sync input when closing
    useEffect(() => { if (!isOpen) setSearch(""); }, [isOpen]);

    return (
        <div className={cn("relative w-full", className)} ref={wrapperRef}>
            <div
                className={cn(
                    "flex h-8 w-full items-center justify-between rounded-sm border border-zinc-300 bg-white px-2 py-1 text-xs cursor-text focus-within:ring-1 focus-within:ring-blue-500 font-medium transition-all shadow-sm",
                    disabled ? "opacity-50 bg-zinc-50 cursor-not-allowed" : "hover:border-zinc-400"
                )}
                onClick={() => {
                    if (!disabled) {
                        setIsOpen(true);
                        setTimeout(() => inputRef.current?.focus(), 0);
                    }
                }}
            >
                <input
                    ref={inputRef}
                    className="bg-transparent border-0 p-0 text-xs w-full focus:outline-none placeholder:text-zinc-400 text-zinc-900"
                    placeholder={placeholder}
                    value={displayValue}
                    onChange={(e) => {
                        const val = e.target.value;
                        setSearch(val);
                        onChange(val); // Real-time value update for free input
                        if (!isOpen) setIsOpen(true);
                        if (onSearchChange) onSearchChange(val);
                    }}
                    onFocus={() => setIsOpen(true)}
                    disabled={disabled}
                />
                <ChevronDown className="h-3 w-3 opacity-50 cursor-pointer text-zinc-600" />
            </div>
            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-sm shadow-xl min-w-[200px] max-h-60 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100 origin-top-left">
                    <div className="overflow-y-auto flex-1 p-1">
                        {onUpsert && search && !options.some(o => o.value === search) && (
                            <div className="p-1.5 px-2 text-xs text-blue-600 font-bold hover:bg-blue-50 cursor-pointer rounded-sm mb-1 flex items-center" onClick={() => {
                                onUpsert(search);
                                onChange(search);
                                setIsOpen(false);
                            }}>
                                <Plus className="w-3 h-3 mr-1" />新規登録: "{search}"
                            </div>
                        )}
                        {filtered.length === 0 && !onUpsert && (
                            <div className="p-2 text-xs text-zinc-400 italic text-center">候補なし</div>
                        )}
                        {filtered.map((opt, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "p-1.5 px-2 text-xs hover:bg-blue-50 hover:text-blue-700 cursor-pointer rounded-sm flex justify-between items-center transition-colors",
                                    value === opt.value ? "bg-blue-100 text-blue-800 font-bold" : "text-zinc-700"
                                )}
                                onClick={() => {
                                    onChange(opt.value);
                                    setSearch(""); // Reset search on select
                                    setIsOpen(false);
                                }}
                            >
                                <div className="flex justify-between items-center w-full">
                                    <div className="flex flex-col">
                                        <span>{opt.label}</span>
                                        {opt.sub && <span className="text-[9px] text-zinc-400 font-normal">{opt.sub}</span>}
                                    </div>
                                    {opt.price !== undefined && (
                                        <span className="text-[10px] font-mono bg-zinc-100 px-1 rounded text-zinc-500 ml-2 truncate max-w-[80px]">¥{opt.price.toLocaleString()}</span>
                                    )}
                                </div>
                                {value === opt.value && <Check className="w-3 h-3" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- MAIN FORM ---
interface Props {
    initialData?: any;
    mode?: 'create' | 'edit' | 'view';
}
export function RepairEntryForm({ initialData, mode = 'create' }: Props) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [isEditingEnabled, setIsEditingEnabled] = useState(mode !== 'view');
    const isReadOnly = mode === 'view' && !isEditingEnabled;

    useEffect(() => {
        setIsEditingEnabled(mode !== 'view');
    }, [mode, initialData?.id]);

    // --- 1. CORE DATA ---
    const [status, setStatus] = useState<string>(initialData?.status || "reception");
    const [statusLog, setStatusLog] = useState<Record<string, string>>(initialData?.statusLog || { "reception": new Date().toISOString() });
    const [customerId, setCustomerId] = useState<number | null>(initialData?.customer?.id || null);
    const [isB2B, setIsB2B] = useState<boolean>(initialData?.customer?.type === 'business');
    const [customerName, setCustomerName] = useState(initialData?.customer?.name || "");
    const [endUserName, setEndUserName] = useState(initialData?.endUserName || "");
    const [partnerRef, setPartnerRef] = useState(initialData?.partnerRef || ""); // 貴社管理No
    const [customerPhone, setCustomerPhone] = useState(initialData?.customer?.phone || "");
    const [lineId, setLineId] = useState(initialData?.customer?.lineId || "");
    const [address, setAddress] = useState(initialData?.customer?.address || "");
    const [email, setEmail] = useState(initialData?.customer?.email || "");
    const [shippingFee, setShippingFee] = useState(0);

    // --- 2. WATCH DATA ---
    const [brand, setBrand] = useState(initialData?.watch?.brand?.name || "");
    const [model, setModel] = useState(initialData?.watch?.model?.name || "");
    const [refName, setRefName] = useState(initialData?.watch?.reference?.name || "");
    const [caliber, setCaliber] = useState(initialData?.watch?.caliber?.name || "");
    const [serial, setSerial] = useState(initialData?.watch?.serialNumber || "");
    const [accessories, setAccessories] = useState<string>(() => {
        try {
            return JSON.parse(initialData?.accessories || "[]").join(", ");
        } catch { return initialData?.accessories || ""; }
    });

    // --- 3. REPAIR CONTENT (Internal/External) ---
    // Unified list with 'category' flag
    interface LineItem {
        id: string;
        category: 'internal' | 'external' | 'part_internal' | 'part_external' | 'part_generic';
        name: string;
        price: number;
        cost?: number; // Cost price (hidden from customer)
        partRef?: string; // Part number
        spec?: string; // Note/Spec (e.g. "Genuine", "31.5mm")
        status?: 'pending' | 'ordered' | 'arrived'; // For parts
    }
    const [lineItems, setLineItems] = useState<LineItem[]>(() => {
        if (!initialData?.estimate?.items) return [];
        return initialData.estimate.items.map((i: any) => ({
            id: String(i.id),
            category: i.type === 'labor' ? (i.category || 'internal') : 'part_external', // simplified mapping
            name: i.itemName,
            price: i.unitPrice,
            spec: i.notes
        }));
    });

    // Inputs for adding new items
    const [addItemCategory, setAddItemCategory] = useState<'internal' | 'part_external'>('internal');
    const [newItemName, setNewItemName] = useState("");
    const [newItemPrice, setNewItemPrice] = useState("");
    const [newItemSpec, setNewItemSpec] = useState("");

    const [diagnosis, setDiagnosis] = useState(initialData?.workSummary || ""); // Diagnosis/Request details
    const [internalNotes, setInternalNotes] = useState(initialData?.internalNotes || "");
    const [customerNote, setCustomerNote] = useState(initialData?.customerNote || "");

    // --- 4. PHOTOS ---
    const [photos, setPhotos] = useState<any[]>(initialData?.photos || []);
    const [isUploading, setIsUploading] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [isCapturing, setIsCapturing] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    // --- 5. MASTERS & OPTIONS ---
    const [brandOpts, setBrandOpts] = useState<any[]>([]);
    const [modelOpts, setModelOpts] = useState<any[]>([]);
    const [refOpts, setRefOpts] = useState<any[]>([]);
    const [calOpts, setCalOpts] = useState<any[]>([]);
    const [customerOpts, setCustomerOpts] = useState<any[]>([]);
    const [workOpts, setWorkOpts] = useState<any[]>([]);

    // --- 6. DIALOGS ---
    const [quickRegOpen, setQuickRegOpen] = useState(false);
    const [mobileQR, setMobileQR] = useState(false);
    const [showPdfDialog, setShowPdfDialog] = useState(false);

    // Construct current data object for PDF
    const currentDataForPdf = {
        id: initialData?.id,
        inquiryNumber: initialData?.inquiryNumber,
        customer: { name: customerName, type: isB2B ? 'business' : 'individual', address, phone: customerPhone },
        endUserName,
        partnerRef,
        watch: { brand, model, ref: refName, serial },
        estimate: { items: lineItems.map(i => ({ name: i.name, price: i.price })) },
        shippingFee,
        status
    };
    const warrantyDocumentUrl = initialData?.issuedWarranty
        ? `/documents/warranty/${initialData.issuedWarranty.id}`
        : null;

    // --- AUTOMATION: Shipping Fee ---
    useEffect(() => {
        const fee = getShippingFeeByAddress(address);
        setShippingFee(fee);
    }, [address]);

    useEffect(() => {
        return () => {
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
                mediaStreamRef.current = null;
            }
        };
    }, []);

    // --- INITIAL LOAD ---
    useEffect(() => {
        getBrands().then(d => setBrandOpts(d.map(b => ({ label: b.name, value: b.name, id: b.id }))));
    }, []);

    // --- LOOKUP CHAINS ---
    // 1. Brand -> Models
    useEffect(() => {
        if (!brand) return;
        const b = brandOpts.find(o => o.value === brand);
        if (b) getModels(b.id).then(d => setModelOpts(d.map((m: any) => ({ label: m.nameJp || m.name, value: m.name, id: m.id }))));
    }, [brand, brandOpts]);

    // 2. Model -> Refs & Calibers
    useEffect(() => {
        if (!model) return;
        const m = modelOpts.find(o => o.value === model);
        if (m) {
            getRefsByModel(m.id).then(d => setRefOpts(d.map((r: any) => ({ label: r.name, value: r.name, sub: r.caliber?.name, caliber: r.caliber?.name }))));
            // Also fetch calibers linked to model
            if (brand) {
                const b = brandOpts.find(o => o.value === brand);
                if (b) getCalibersForModel(b.id, m.id).then(d => setCalOpts(d.map((c: any) => ({ label: c.name, value: c.name }))));
            }
        }
    }, [model, modelOpts, brand, brandOpts]);

    // 3. Ref -> Caliber Auto-fill
    useEffect(() => {
        const r = refOpts.find(o => o.value === refName);
        if (r && r.caliber) setCaliber(r.caliber);
    }, [refName, refOpts]);

    // 4. Intelligence Cache (Pricing Rules & Parts Master)
    useEffect(() => {
        const b = brandOpts.find(o => o.value === brand || o.label === brand);
        if (!b) {
            setWorkOpts([]);
            return;
        }

        const m = modelOpts.find(o => o.value === model || o.label === model);
        const c = calOpts.find(o => o.value === caliber || o.label === caliber);

        if (addItemCategory === 'internal') {
            // Fetch labor/work rules
            getPricingRules(b.id, m?.id, c?.id).then(rules => {
                const safeRules = Array.isArray(rules) ? rules : [];
                setWorkOpts(safeRules.map(r => ({
                    label: r.suggestedWorkName,
                    value: r.suggestedWorkName,
                    price: r.minPrice
                })));
            });
        } else {
            // Fetch parts master data
            getPartsMatched(b.id, m?.id, c?.id).then(parts => {
                setWorkOpts(parts.map(p => ({
                    label: p.nameJp || p.name,
                    value: p.nameJp || p.name,
                    price: p.retailPrice,
                    sub: p.partNumber ? `Ref: ${p.partNumber} (${p.category})` : p.category
                })));
                console.log(`Fetched ${parts.length} matching parts for brand ${b.id}`);
            });
        }
    }, [brand, model, caliber, brandOpts, modelOpts, calOpts, addItemCategory]);

    // --- CALCULATIONS ---
    const totalAmount = lineItems.reduce((sum, i) => sum + i.price, 0);
    const taxAmount = Math.floor(totalAmount * 0.1);
    const grandTotal = totalAmount + taxAmount;

    // --- ACTIONS ---
    const handleSave = async () => {
        if (isReadOnly) return;
        if (!brand || !customerName) {
            alert("「ブランド」と「顧客名」は必須です。");
            return;
        }
        setIsSaving(true);
        try {
            const payload = {
                customer: {
                    id: customerId,
                    name: customerName,
                    type: isB2B ? 'business' : 'individual',
                    phone: customerPhone,
                    lineId: lineId,
                    address: address,
                    prefix: isB2B ? 'P' : 'C' // Simple logic
                },
                watch: { brand, model, ref: refName, serial, caliber },
                request: {
                    diagnosis,
                    partnerRef,
                    internalNotes,
                    customerNote,
                    accessories: accessories.split(',').map(s => s.trim()).filter(Boolean),
                    endUserName
                },
                estimate: {
                    items: lineItems.map(i => ({
                        type: i.category.includes('part') ? 'part' : 'labor',
                        category: i.category,
                        name: i.name,
                        price: i.price,
                        notes: i.spec
                    }))
                },
                status,
                statusLog,
                photos
            };

            const url = mode !== 'create' ? `/api/repairs/${initialData.id}` : "/api/repairs";
            const res = await fetch(url, {
                method: mode !== 'create' ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Save failed");
            const json = await res.json();

            // Redirect or Notify
            if (mode === 'create') {
                router.push(`/repairs/${json.repair.id}`);
            } else {
                if (mode === 'view') setIsEditingEnabled(false);
                router.refresh();
            }

        } catch (e) {
            console.error(e);
            alert("保存に失敗しました。");
        } finally {
            setIsSaving(false);
        }
    };

    const uploadPhotoFile = async (file: File) => {
        setIsUploading(true);
        try {
            const compressed = await imageCompression(file, { maxSizeMB: 1, useWebWorker: true });
            const fd = new FormData();
            fd.append("file", compressed);
            if (initialData?.id) fd.append("repairId", initialData.id);

            const res = await fetch("/api/upload", { method: "POST", body: fd });
            const data = await res.json();
            if (data.success) {
                setPhotos(prev => [...prev, { storageKey: data.storageKey, fileName: data.fileName, mimeType: data.mimeType }]);
            }
        } catch (err) {
            console.error(err);
            alert("画像アップロードエラー");
        } finally {
            setIsUploading(false);
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isReadOnly) return;
        const file = e.target.files?.[0];
        if (!file) return;
        await uploadPhotoFile(file);
        e.target.value = "";
    };

    const stopCameraStream = () => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
    };

    const closeCameraDialog = () => {
        stopCameraStream();
        setIsCameraOpen(false);
        setIsCameraReady(false);
        setCapturedPreview(null);
        setCameraError(null);
        setIsCapturing(false);
    };

    const openCameraDialog = async () => {
        if (isReadOnly) return;
        if (isCapturing) return;

        const isSecureContextAvailable = typeof window !== "undefined" &&
            (window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

        if (!isSecureContextAvailable) {
            setCameraError("カメラ機能は HTTPS または localhost でのみ利用できます。");
            setIsCameraOpen(true);
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError("このブラウザではカメラ機能を利用できません。");
            setIsCameraOpen(true);
            return;
        }

        setIsCameraOpen(true);
        setIsCameraReady(false);
        setCapturedPreview(null);
        setCameraError(null);

        try {
            stopCameraStream();
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
                audio: false
            });
            mediaStreamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            setIsCameraReady(true);
        } catch (error) {
            console.error(error);
            setCameraError("カメラを起動できませんでした。ブラウザの権限設定をご確認ください。");
        }
    };

    const captureCameraPhoto = () => {
        if (!videoRef.current || !canvasRef.current || !isCameraReady) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;

        const context = canvas.getContext("2d");
        if (!context) {
            setCameraError("撮影画像の生成に失敗しました。");
            return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        setCapturedPreview(canvas.toDataURL("image/jpeg", 0.92));
        stopCameraStream();
        setIsCameraReady(false);
    };

    const saveCapturedPhoto = async () => {
        if (!canvasRef.current || isCapturing) return;

        setIsCapturing(true);
        try {
            const blob = await new Promise<Blob | null>((resolve) => {
                canvasRef.current?.toBlob(resolve, "image/jpeg", 0.92);
            });

            if (!blob) {
                throw new Error("capture_failed");
            }

            const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
            await uploadPhotoFile(file);
            closeCameraDialog();
        } catch (error) {
            console.error(error);
            setCameraError("撮影画像の保存に失敗しました。");
        } finally {
            setIsCapturing(false);
        }
    };

    // --- LINE SEND ---
    const handleLineSend = (type: 'status' | 'estimate' | 'complete') => {
        // Fallback to Clipboard + URL Scheme if no API
        let text = "";
        const shopName = "ヨシダ時計修理工房";

        if (type === 'status') {
            text = `
【ステータス更新】
現在の状況: ${STATUS_STEPS.find(s => s.id === status)?.label}
機種: ${brand} ${model}
管理No: ${initialData?.inquiryNumber || ""}

現在、順調に進行しております。今しばらくお待ちください。
${shopName}
            `.trim();
        } else if (type === 'estimate') {
            text = `
【お見積りのご案内】
機種: ${brand} ${model}
修理合計: ¥${grandTotal.toLocaleString()} (税込)

詳細は添付のPDF、またはお電話にてご確認ください。
${shopName}
            `.trim();
        }

        navigator.clipboard.writeText(text).then(() => {
            alert("LINE用メッセージをコピーしました。\nLINEを開きます。");
            window.location.href = "line://"; // Try to open app
        });
    };

    return (
        <div className="min-h-screen bg-zinc-100 font-sans text-zinc-800 flex flex-col">
            {/* --- TOP BAR (FMP Style) --- */}
            <div className="bg-[#e8e8e8] border-b border-zinc-300 px-4 py-2 flex items-center justify-between sticky top-0 z-30 h-14 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.back()} className="h-9 hover:bg-zinc-200">
                        <ArrowLeft className="w-4 h-4 mr-1 text-zinc-600" /> 一覧へ戻る
                    </Button>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-zinc-500 font-bold tracking-wider">修理受付システム</span>
                        <h1 className="text-lg font-bold leading-none text-zinc-800">
                            {mode !== 'create' ? `修理番号: ${initialData?.inquiryNumber}` : "新規修理登録"}
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {mode === 'view' && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsEditingEnabled(prev => !prev)}
                            className="h-9 px-4 font-bold"
                        >
                            {isReadOnly ? "編集する" : "閲覧に戻る"}
                        </Button>
                    )}
                    {shippingFee > 0 && (
                        <div className="hidden lg:flex items-center gap-1.5 px-3 h-8 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200">
                            <Truck className="w-3.5 h-3.5" />
                            送料目安: ¥{shippingFee.toLocaleString()}
                        </div>
                    )}
                    {mode !== 'create' && (
                        <div className="flex bg-white rounded-md border border-zinc-300 overflow-hidden shadow-sm mr-2">
                            <button onClick={() => handleLineSend('status')} className="px-3 py-1.5 hover:bg-green-50 text-[10px] border-r flex items-center gap-1 text-green-700 font-bold transition-colors">
                                <MessageCircle className="w-3.5 h-3.5" /> LINE連絡
                            </button>
                            <button
                                onClick={() => {
                                    if (warrantyDocumentUrl) {
                                        window.open(warrantyDocumentUrl, "_blank", "noopener,noreferrer");
                                    }
                                }}
                                disabled={!warrantyDocumentUrl}
                                className="px-3 py-1.5 hover:bg-zinc-100 text-[10px] flex items-center gap-1 text-zinc-700 font-bold transition-colors disabled:text-zinc-400 disabled:hover:bg-transparent"
                            >
                                <FileText className="w-3.5 h-3.5" /> 保証書
                            </button>
                        </div>
                    )}
                    {!isReadOnly && (
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={isSaving}
                            className={cn("h-9 px-6 font-bold shadow-md transition-all active:scale-95", isSaving ? "bg-zinc-400" : "bg-blue-600 hover:bg-blue-500")}
                        >
                            {isSaving ? "保存中..." : "保存 (Save)"}
                        </Button>
                    )}
                </div>
            </div>


            {/* --- MAIN CONTENT (Simple Vertical Layout) --- */}
            <div className="flex-1 p-3 overflow-y-auto">
                <fieldset disabled={isReadOnly} className="contents">
                <div className="flex flex-col gap-4 max-w-4xl mx-auto h-full">

                    {/* LEFT COL: CUSTOMER & WATCH (4/12) */}
                    {/* CUSTOMER & WATCH */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Customer Card */}
                        <Card className="p-3 shadow-sm border-t-4 border-t-zinc-500 bg-white">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-xs font-bold flex items-center gap-1.5 text-zinc-700 uppercase tracking-wider">
                                    <User className="w-3.5 h-3.5" /> 顧客情報
                                </h3>
                                <div className="flex bg-zinc-100 p-0.5 rounded">
                                    <button onClick={() => setIsB2B(true)} className={cn("px-2 py-0.5 text-[10px] rounded-sm font-bold", isB2B ? "bg-white shadow text-blue-600" : "text-zinc-400")}>業者</button>
                                    <button onClick={() => setIsB2B(false)} className={cn("px-2 py-0.5 text-[10px] rounded-sm font-bold", !isB2B ? "bg-white shadow text-green-600" : "text-zinc-400")}>一般</button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex gap-1">
                                    <AdvancedCombobox
                                        placeholder="名前検索 / 新規入力..."
                                        value={customerName}
                                        onChange={setCustomerName}
                                        onSearchChange={async (s) => {
                                            const res = await getCustomers(s);
                                            setCustomerOpts(res.map(c => ({ label: c.name, value: c.name, sub: c.phone || "No phone" })));
                                        }}
                                        options={customerOpts}
                                    />
                                    <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => setQuickRegOpen(true)}><Plus className="w-4 h-4" /></Button>
                                </div>
                                {isB2B && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[9px] text-zinc-400 uppercase">エンドユーザー</Label>
                                            <Input className="h-7 text-xs" value={endUserName} onChange={e => setEndUserName(e.target.value)} />
                                        </div>
                                        <div>
                                            <Label className="text-[9px] text-zinc-400 uppercase">管理番号(Partner)</Label>
                                            <Input className="h-7 text-xs font-mono" value={partnerRef} onChange={e => setPartnerRef(e.target.value)} />
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                    <div><Label className="text-[9px] text-zinc-400">TEL</Label><Input className="h-7 text-xs" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></div>
                                    <div><Label className="text-[9px] text-zinc-400">LINE ID</Label><Input className="h-7 text-xs" value={lineId} onChange={e => setLineId(e.target.value)} /></div>
                                </div>
                                <div><Label className="text-[9px] text-zinc-400">住所</Label><Input className="h-7 text-xs" value={address} onChange={e => setAddress(e.target.value)} /></div>
                            </div>
                        </Card>

                        {/* Watch Card */}
                        <Card className="p-3 shadow-sm border-t-4 border-t-blue-600 bg-white flex-1">
                            <h3 className="text-xs font-bold flex items-center gap-1.5 text-zinc-700 uppercase tracking-wider mb-3">
                                <Watch className="w-3.5 h-3.5" /> 時計情報
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <Label className="text-[9px] text-zinc-400">ブランド</Label>
                                    <AdvancedCombobox value={brand} onChange={setBrand} options={brandOpts} placeholder="ブランド名..." onUpsert={(v) => setBrandOpts([...brandOpts, { label: v, value: v }])} />
                                </div>
                                <div>
                                    <Label className="text-[9px] text-zinc-400">モデル</Label>
                                    <AdvancedCombobox value={model} onChange={setModel} options={modelOpts} placeholder="モデル名..." />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-[9px] text-zinc-400">リファレンス (Ref)</Label>
                                        <AdvancedCombobox value={refName} onChange={setRefName} options={refOpts} placeholder="Ref.No..." />
                                    </div>
                                    <div>
                                        <Label className="text-[9px] text-zinc-400">キャリバー (Cal)</Label>
                                        <AdvancedCombobox value={caliber} onChange={setCaliber} options={calOpts} placeholder="機械番号..." />
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-[9px] text-zinc-400">シリアル番号</Label>
                                    <Input className="h-7 text-xs font-mono" value={serial} onChange={e => setSerial(e.target.value)} placeholder="X123456" />
                                </div>
                                <div>
                                    <Label className="text-[9px] text-zinc-400">付属品</Label>
                                    <Input className="h-7 text-xs" value={accessories} onChange={e => setAccessories(e.target.value)} placeholder="箱、保証書等..." />
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* REPAIR CONTENT & ESTIMATE */}
                    <div className="flex flex-col gap-4">
                        {/* Text Areas */}
                        <Card className="p-3 shadow-sm bg-white">
                            <div className="grid grid-cols-1 gap-2">
                                <div>
                                    <Label className="text-[9px] text-zinc-400">依頼内容 / 症状</Label>
                                    <Textarea className="min-h-[80px] text-xs resize-none bg-yellow-50/50" value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
                                </div>
                                <div>
                                    <Label className="text-[9px] text-zinc-400">社内メモ</Label>
                                    <Textarea className="min-h-[60px] text-xs resize-none bg-zinc-50" value={internalNotes} onChange={e => setInternalNotes(e.target.value)} />
                                </div>
                                <div>
                                    <Label className="text-[9px] text-blue-500 font-semibold">お客様連絡事項（見積書に記載）</Label>
                                    <Textarea className="min-h-[60px] text-xs resize-none bg-blue-50/40 border-blue-200" value={customerNote} onChange={e => setCustomerNote(e.target.value)} placeholder="お客様へお伝えする事項を入力（見積書のご連絡事項欄に印字されます）" />
                                </div>
                            </div>
                        </Card>

                        {/* Estimate List */}
                        <Card className="flex-1 p-0 shadow-sm border-t-4 border-t-emerald-600 bg-white flex flex-col overflow-hidden">
                            <div className="p-2 border-b bg-zinc-50 flex justify-between items-center">
                                <h3 className="text-xs font-bold flex items-center gap-1.5 text-zinc-700 uppercase">
                                    <Settings className="w-3.5 h-3.5" /> 見積・修理明細
                                </h3>
                                <div className="flex gap-1 text-[10px]">
                                    <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">合計: ¥{grandTotal.toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                {/* List Header */}
                                <div className="grid grid-cols-12 text-[9px] text-zinc-400 font-bold border-b pb-1 px-1">
                                    <div className="col-span-6">項目 / 部品</div>
                                    <div className="col-span-3 text-right">単価</div>
                                    <div className="col-span-3 text-right">操作</div>
                                </div>

                                {/* Items */}
                                {lineItems.map((item, idx) => (
                                    <div key={item.id} className="grid grid-cols-12 items-center text-xs p-1.5 hover:bg-zinc-50 border-b border-zinc-100 last:border-0 group">
                                        <div className="col-span-6 flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setLineItems(lineItems.map((li, i) =>
                                                        i === idx ? { ...li, category: li.category.includes('part') ? 'internal' : 'part_external' } : li
                                                    ))}
                                                    className={`text-[9px] px-1 py-0.5 rounded border shrink-0 ${item.category.includes('part') ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}
                                                >
                                                    {item.category.includes('part') ? '交換部品' : '技術料'}
                                                </button>
                                                <span className="font-medium truncate">{item.name}</span>
                                            </div>
                                            {item.spec && <span className="text-[9px] text-zinc-400 pl-0.5">{item.spec}</span>}
                                        </div>
                                        <div className="col-span-3 text-right font-mono table-nums">¥{item.price.toLocaleString()}</div>
                                        <div className="col-span-3 text-right">
                                            <button type="button" onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))} className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Input Row */}
                                <div className="bg-zinc-50 p-2 rounded border border-zinc-200 mt-2">
                                    <div className="flex gap-1 mb-1">
                                        <select className="h-7 text-[10px] rounded border-zinc-300 bg-white" value={addItemCategory} onChange={(e) => setAddItemCategory(e.target.value as any)}>
                                            <option value="internal">技術料</option>
                                            <option value="part_external">交換部品</option>
                                        </select>
                                        <AdvancedCombobox
                                            className="flex-1"
                                            placeholder="作業名 / 部品名を入力..."
                                            value={newItemName}
                                            onChange={(v) => {
                                                setNewItemName(v);
                                                const match = workOpts.find(w => w.value === v);
                                                if (match) setNewItemPrice(String(match.price));
                                            }}
                                            options={workOpts}
                                        />
                                    </div>
                                    <div className="flex gap-1">
                                        <Input className="h-7 text-xs flex-1" placeholder="備考/仕様 (Spec)" value={newItemSpec} onChange={e => setNewItemSpec(e.target.value)} />
                                        <div className="relative w-20">
                                            <span className="absolute left-1.5 top-1.5 text-[9px]">¥</span>
                                            <Input className="h-7 text-xs pl-4 font-mono text-right" placeholder="0" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} />
                                        </div>
                                        <Button size="sm" className="h-7 w-8 p-0 bg-blue-600 hover:bg-blue-700" onClick={() => {
                                            if (!newItemName) return;
                                            setLineItems([...lineItems, {
                                                id: `auto-${Date.now()}`,
                                                category: addItemCategory,
                                                name: newItemName,
                                                price: parseInt(newItemPrice) || 0,
                                                spec: newItemSpec
                                            }]);
                                            setNewItemName("");
                                            setNewItemPrice("");
                                            setNewItemSpec("");
                                        }}>
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>

                </div>

                {/* PHOTOS */}
                <div className="flex flex-col gap-4">
                    <Card className="shadow-sm border-t-4 border-t-purple-600 bg-white p-3 flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-xs font-bold flex items-center gap-1.5 text-zinc-700 uppercase">
                                <ImageIcon className="w-3.5 h-3.5" /> 写真
                            </h3>
                            <div className="flex items-center gap-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-7 px-2 text-[10px] font-bold text-zinc-700"
                                    onClick={openCameraDialog}
                                    disabled={isUploading || isCapturing}
                                >
                                    <Camera className="w-4 h-4 mr-1 text-zinc-600" />
                                    カメラで撮影
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { if (isReadOnly) return; setMobileQR(true); }}>
                                    <Smartphone className="w-4 h-4 text-blue-500" />
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 bg-zinc-100 rounded-md inner-shadow overflow-y-auto p-2 grid grid-cols-2 gap-2 auto-rows-min content-start">
                            {/* Upload Button */}
                            <label className="aspect-square border-2 border-dashed border-zinc-300 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-white transition-all group min-h-[100px]">
                                <Camera className="w-6 h-6 text-zinc-400 group-hover:text-blue-500 mb-1" />
                                <span className="text-[9px] text-zinc-400 group-hover:text-blue-500">写真を追加</span>
                                <input type="file" className="hidden" accept="image/*" multiple onChange={handlePhotoUpload} />
                            </label>

                            {photos.map((p, i) => (
                                <div key={i} className="aspect-square relative rounded-md overflow-hidden bg-black group border border-zinc-200 shadow-sm">
                                    <img src={`https://pub-2775f284e3d34d8095ad7161bcca2432.r2.dev/${p.storageKey}`} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button className="text-white hover:text-blue-300"><Eye className="w-4 h-4" /></button>
                                        <button onClick={() => { if (isReadOnly) return; setPhotos(photos.filter((_, x) => x !== i)); }} className="text-white hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
                </fieldset>
            </div>

            {/* --- DIALOGS --- */}
            <QuickRegisterDialog
                isOpen={quickRegOpen}
                onClose={() => setQuickRegOpen(false)}
                mode="customer"
                initialName={customerName}
                onRegister={(d) => {
                    setCustomerName(d.name);
                    setIsB2B(d.type === 'business');
                    setCustomerPhone(d.phone || "");
                    setLineId(d.lineId || "");
                    setAddress(d.address || "");
                }}
            />

            <MobileConnectDialog
                isOpen={mobileQR}
                onClose={() => setMobileQR(false)}
                repairId={initialData?.id || "new"}
                onPhotosUploaded={() => {
                    // Trigger refresh of photos from server if needed
                    console.log("Photos uploaded from mobile");
                }}
            />

            <Dialog open={isCameraOpen} onOpenChange={(open) => { if (!open) closeCameraDialog(); }}>
                <DialogContent className="h-[95vh] w-[95vw] max-w-none p-0">
                    <DialogHeader>
                        <div className="border-b bg-white px-6 py-4">
                            <DialogTitle>カメラで撮影</DialogTitle>
                            <DialogDescription>撮影した画像をそのまま写真一覧へ追加します。</DialogDescription>
                        </div>
                    </DialogHeader>

                    <div className="flex h-[calc(95vh-140px)] flex-col bg-zinc-950">
                        {cameraError && (
                            <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {cameraError}
                            </div>
                        )}

                        <div className="min-h-0 flex-1 overflow-hidden bg-zinc-950">
                            {capturedPreview ? (
                                <img src={capturedPreview} alt="撮影プレビュー" className="h-full w-full object-cover" />
                            ) : (
                                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                            )}
                        </div>

                        <canvas ref={canvasRef} className="hidden" />
                    </div>

                    <DialogFooter className="border-t bg-white px-6 py-4 sm:justify-between">
                        <Button type="button" variant="outline" onClick={closeCameraDialog}>
                            閉じる
                        </Button>
                        <div className="flex gap-2">
                            {capturedPreview ? (
                                <>
                                    <Button type="button" variant="outline" onClick={openCameraDialog} disabled={isCapturing || isUploading}>
                                        再撮影
                                    </Button>
                                    <Button type="button" onClick={saveCapturedPhoto} disabled={isCapturing || isUploading}>
                                        {isCapturing || isUploading ? "保存中..." : "この写真を追加"}
                                    </Button>
                                </>
                            ) : (
                                <Button type="button" onClick={captureCameraPhoto} disabled={!isCameraReady || isCapturing}>
                                    撮影
                                </Button>
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <PDFPreviewDialog
                isOpen={showPdfDialog}
                onClose={() => setShowPdfDialog(false)}
                repairData={currentDataForPdf}
            />

        </div>
    );
}
