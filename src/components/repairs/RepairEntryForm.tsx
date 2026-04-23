"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import imageCompression from 'browser-image-compression';
import {
    ArrowLeft, Camera, Printer, Save, Search, Check, ChevronDown, ChevronRight, User, Watch,
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
import PartsSearchPanel from "@/components/parts/PartsSearchPanel";

// Dynamically import PDF Dialog (Client only)
const PDFPreviewDialog = dynamic(() => import("@/components/repairs/PDFPreviewDialog"), { ssr: false });

// §12 確定ステータス定義（2026/04/22）
const STATUS_STEPS: { id: string; label: string }[] = [
    { id: "受付",             label: "受付" },
    { id: "見積中",           label: "見積中" },
    { id: "承認待ち",         label: "承認待ち" },
    { id: "部品待ち(未注文)", label: "部品待ち(未注文)" },
    { id: "部品待ち(注文済み)", label: "部品待ち(注文済み)" },
    { id: "部品入荷済み",     label: "部品入荷済み" },
    { id: "作業待ち",         label: "作業待ち" },
    { id: "作業中",           label: "作業中" },
    { id: "作業完了",         label: "作業完了" },
    { id: "納品済み",         label: "納品済み" },
    { id: "キャンセル",       label: "キャンセル" },
    { id: "保留",             label: "保留" },
];

// ステータスバーに横並び表示するメインフロー（保留・キャンセルは除外）
const MAIN_STATUS_STEPS = STATUS_STEPS.filter(s => s.id !== 'キャンセル' && s.id !== '保留');

// "YYYY/M/D" ↔ "YYYY-MM-DD" 変換ヘルパー
function toInputDate(localeDate: string): string {
    if (!localeDate) return '';
    const parts = localeDate.split('/');
    if (parts.length !== 3) return '';
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
}
function toLocaleDate(isoDate: string): string {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    return `${parseInt(y)}/${parseInt(m)}/${parseInt(d)}`;
}

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
    const [openUpward, setOpenUpward] = useState(false);
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

    // 画面外はみ出し防止：開いた直後にドロップダウンが下にはみ出すか判定
    useEffect(() => {
        if (isOpen && wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            setOpenUpward(spaceBelow < 220);
        }
    }, [isOpen]);

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
                <div className={`absolute z-50 w-full bg-white border border-zinc-200 rounded-sm shadow-xl min-w-[200px] overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${openUpward ? 'bottom-full mb-1 origin-bottom-left' : 'top-full mt-1 origin-top-left'}`}>
                    <div className="overflow-y-auto p-1 max-h-[200px]">
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

    // 新規作成時のstatusLog初期化（useEffectでクライアント確定後に実行してHydrationエラーを防ぐ）
    useEffect(() => {
        if (!initialData?.statusLog) {
            setStatusLog({ "受付": new Date().toLocaleDateString('ja-JP') });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // --- 1. CORE DATA ---
    const [status, setStatus] = useState<string>(initialData?.status || "受付");
    const [statusLog, setStatusLog] = useState<Record<string, string>>(initialData?.statusLog ?? {});
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
        price: number;   // 上代
        cost?: number;   // 仕入値（管理者のみ）
        quantity: number; // 個数
        partRef?: string;
        spec?: string;
        status?: 'pending' | 'ordered' | 'arrived';
        partsMasterId?: number | null;
    }
    const [lineItems, setLineItems] = useState<LineItem[]>(() => {
        if (!initialData?.estimate?.items) return [];
        return initialData.estimate.items.map((i: any) => ({
            id: String(i.id),
            category: i.type === 'labor' ? (i.category || 'internal') : 'part_external',
            name: i.itemName,
            price: i.unitPrice,
            quantity: i.quantity || 1,
            spec: i.notes
        }));
    });

    // Inputs for adding new items
    const [addItemCategory, setAddItemCategory] = useState<'internal' | 'part_external'>('internal');
    const [newItemName, setNewItemName] = useState("");
    const [newItemCost, setNewItemCost] = useState("");
    const [newItemPrice, setNewItemPrice] = useState("");
    const [newItemQty, setNewItemQty] = useState("1");
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

    // --- 7. STATUS BAR ---
    const [showHistory, setShowHistory] = useState(false);
    const [editingDateFor, setEditingDateFor] = useState<string | null>(null);

    // --- 8. TABS ---
    const [activeTab, setActiveTab] = useState<'main' | 'photo' | 'document'>('main');

    // --- 9. PARTS PANEL ---
    const [partsPanelOpen, setPartsPanelOpen] = useState(false);
    const [partsPanelRowIdx, setPartsPanelRowIdx] = useState<number | null>(null);
    const [partsSearchQuery, setPartsSearchQuery] = useState('');

    // --- 10. AI CHAT ---
    const [aiChatOpen, setAiChatOpen] = useState(false);
    const [aiChatInput, setAiChatInput] = useState('');

    // --- 11. 在庫警告 ---
    type StockWarning = { partName: string; required: number; stock: number; orderRequestId: number }
    const [stockWarnings, setStockWarnings] = useState<StockWarning[]>([]);

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
                    sub: p.partRefs ? `Ref: ${p.partRefs} (${p.category})` : p.category
                })));
                console.log(`Fetched ${parts.length} matching parts for brand ${b.id}`);
            });
        }
    }, [brand, model, caliber, brandOpts, modelOpts, calOpts, addItemCategory]);

    // --- CALCULATIONS ---
    const totalAmount = lineItems.reduce((sum, i) => sum + i.price * (i.quantity || 1), 0);
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
                        notes: i.spec,
                        partsMasterId: i.partsMasterId ?? null,
                        quantity: i.quantity ?? 1,
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

            // 在庫警告があればダイアログ表示
            if (json.stockWarnings && json.stockWarnings.length > 0) {
                setStockWarnings(json.stockWarnings);
            }

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
                            {isSaving ? "保存中..." : "保存"}
                        </Button>
                    )}
                </div>
            </div>


            {/* --- STATUS BAR --- */}
            <div className="bg-white border-b border-zinc-200 px-4 py-3 shadow-sm w-full">
                {/* メインフロー：横一列・画面幅いっぱい */}
                <div className="flex items-stretch w-full overflow-x-auto">
                    {MAIN_STATUS_STEPS.map((step, idx) => {
                        const isCurrent = status === step.id;
                        const hasDate = !!statusLog[step.id];
                        const isEditing = editingDateFor === step.id;
                        return (
                            <React.Fragment key={step.id}>
                                {idx > 0 && (
                                    <div className="flex items-center self-center shrink-0 px-0.5">
                                        <ChevronRight className="w-4 h-4 text-zinc-300" />
                                    </div>
                                )}
                                <div className={cn(
                                    "flex flex-col items-center justify-center flex-1 px-2 py-2.5 rounded-lg shrink-0 transition-all",
                                    isCurrent
                                        ? "bg-blue-600 shadow-md ring-2 ring-blue-400 ring-offset-1"
                                        : hasDate
                                        ? "bg-zinc-100 hover:bg-zinc-200"
                                        : "hover:bg-zinc-50"
                                )}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isReadOnly) return;
                                            setStatus(step.id);
                                            if (!statusLog[step.id]) {
                                                setStatusLog(prev => ({
                                                    ...prev,
                                                    [step.id]: new Date().toLocaleDateString('ja-JP')
                                                }));
                                            }
                                        }}
                                        className={cn(
                                            "text-xs font-bold leading-snug text-center w-full whitespace-nowrap",
                                            isCurrent ? "text-white" : hasDate ? "text-zinc-700" : "text-zinc-400 hover:text-zinc-600"
                                        )}
                                    >
                                        {step.label}
                                    </button>
                                    <div className="mt-1.5 w-full flex justify-center">
                                        {isEditing ? (
                                            <input
                                                type="date"
                                                className="text-xs border border-blue-300 rounded px-1 py-0.5 w-full max-w-[110px] text-center"
                                                defaultValue={toInputDate(statusLog[step.id] || '')}
                                                onChange={e => {
                                                    setStatusLog(prev => ({
                                                        ...prev,
                                                        [step.id]: toLocaleDate(e.target.value)
                                                    }));
                                                }}
                                                onBlur={() => setEditingDateFor(null)}
                                                autoFocus
                                            />
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => { if (!isReadOnly) setEditingDateFor(step.id); }}
                                                className={cn(
                                                    "text-xs font-mono px-1 py-0.5 rounded transition-colors",
                                                    isCurrent
                                                        ? "text-blue-100 hover:text-white hover:bg-blue-500"
                                                        : "text-zinc-400 hover:text-blue-600 hover:bg-blue-50"
                                                )}
                                            >
                                                {statusLog[step.id] || "―"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}

                    {/* 保留・キャンセルボタン */}
                    <div className="flex flex-col gap-2 self-center ml-4 shrink-0 border-l-2 border-zinc-200 pl-4">
                        <button
                            type="button"
                            onClick={() => { if (!isReadOnly) setStatus('保留'); }}
                            className={cn(
                                "text-sm px-3 py-1.5 rounded-lg border-2 font-bold transition-all",
                                status === '保留'
                                    ? "bg-yellow-100 border-yellow-400 text-yellow-700 shadow"
                                    : "border-zinc-300 text-zinc-400 hover:border-yellow-400 hover:text-yellow-600"
                            )}
                        >
                            保留
                        </button>
                        <button
                            type="button"
                            onClick={() => { if (!isReadOnly) setStatus('キャンセル'); }}
                            className={cn(
                                "text-sm px-3 py-1.5 rounded-lg border-2 font-bold transition-all",
                                status === 'キャンセル'
                                    ? "bg-red-100 border-red-500 text-red-700 shadow"
                                    : "border-zinc-300 text-zinc-400 hover:border-red-400 hover:text-red-600"
                            )}
                        >
                            キャンセル
                        </button>
                    </div>
                </div>

                {/* 履歴トグル */}
                <div className="mt-2">
                    <button
                        type="button"
                        onClick={() => setShowHistory(prev => !prev)}
                        className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                    >
                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", showHistory && "rotate-180")} />
                        履歴を見る
                    </button>
                    {showHistory && (
                        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto pl-3 border-l-2 border-zinc-100">
                            {(initialData?.logs || []).length === 0 ? (
                                <div className="text-xs text-zinc-400 italic py-1">変更履歴がありません</div>
                            ) : (
                                [...(initialData?.logs || [])].reverse().map((log: any, i: number) => (
                                    <div key={i} className="flex items-center gap-4 text-xs">
                                        <span className="text-zinc-400 font-mono">
                                            {new Date(log.changedAt).toLocaleDateString('ja-JP')}
                                        </span>
                                        <span className="text-zinc-600 font-medium">{log.status}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* --- TAB NAV --- */}
            <div className="bg-white border-b border-zinc-200 flex shrink-0">
                {([
                    { id: 'main',     label: 'メイン' },
                    { id: 'photo',    label: '写真' },
                    { id: 'document', label: '書類' },
                ] as const).map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "px-8 py-2.5 text-sm font-bold border-b-2 transition-colors",
                            activeTab === tab.id
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* --- MAIN CONTENT --- */}
            <div className="flex-1 overflow-y-auto">
                <fieldset disabled={isReadOnly} className="contents">

                {/* メインタブ */}
                {activeTab === 'main' && (
                <div className="p-3 flex flex-col gap-3">

                    {/* 上段：3カラム均等幅 */}
                    <div className="grid grid-cols-3 gap-3">

                        {/* ①顧客情報 */}
                        <Card className="p-3 shadow-sm border-t-4 border-t-zinc-500 bg-white">
                            <div className="flex justify-between items-center mb-2">
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
                                            <Label className="text-[9px] text-zinc-400 uppercase">パートナー管理番号</Label>
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

                        {/* ②時計情報 */}
                        <Card className="p-3 shadow-sm border-t-4 border-t-blue-600 bg-white">
                            <h3 className="text-xs font-bold flex items-center gap-1.5 text-zinc-700 uppercase tracking-wider mb-2">
                                <Watch className="w-3.5 h-3.5" /> 時計情報
                            </h3>
                            <div className="space-y-2">
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
                                        <Label className="text-[9px] text-zinc-400">リファレンス</Label>
                                        <AdvancedCombobox value={refName} onChange={setRefName} options={refOpts} placeholder="Ref.No..." />
                                    </div>
                                    <div>
                                        <Label className="text-[9px] text-zinc-400">キャリバー</Label>
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

                        {/* ③依頼内容・社内メモ・連絡事項 */}
                        <Card className="p-3 shadow-sm bg-white flex flex-col gap-2">
                            <div>
                                <Label className="text-[9px] text-zinc-400">依頼内容 / 症状</Label>
                                <Textarea className="min-h-[70px] text-xs resize-none bg-yellow-50/50" value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
                            </div>
                            <div>
                                <Label className="text-[9px] text-zinc-400">社内メモ</Label>
                                <Textarea className="min-h-[50px] text-xs resize-none bg-zinc-50" value={internalNotes} onChange={e => setInternalNotes(e.target.value)} />
                            </div>
                            <div>
                                <Label className="text-[9px] text-blue-500 font-semibold">お客様連絡事項（見積書に記載）</Label>
                                <Textarea className="min-h-[50px] text-xs resize-none bg-blue-50/40 border-blue-200" value={customerNote} onChange={e => setCustomerNote(e.target.value)} placeholder="お客様へお伝えする事項を入力（見積書のご連絡事項欄に印字されます）" />
                            </div>
                        </Card>
                    </div>

                    {/* 下段：左右 50:50 */}
                    <div className="grid grid-cols-2 gap-3">

                        {/* ④見積・修理明細テーブル */}
                        <Card className="p-0 shadow-sm border-t-4 border-t-emerald-600 bg-white flex flex-col overflow-hidden">
                            <div className="p-2 border-b bg-zinc-50 flex justify-between items-center">
                                <h3 className="text-xs font-bold flex items-center gap-1.5 text-zinc-700 uppercase">
                                    <Settings className="w-3.5 h-3.5" /> 見積・修理明細
                                </h3>
                                <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold text-[10px]">合計: ¥{grandTotal.toLocaleString()}</span>
                            </div>
                            <div className="overflow-y-auto p-2 space-y-2">
                                {/* ヘッダー */}
                                <div className="grid grid-cols-12 text-[9px] text-zinc-400 font-bold border-b pb-1 px-1">
                                    <div className="col-span-6">項目 / 部品</div>
                                    <div className="col-span-1 text-right">仕入値</div>
                                    <div className="col-span-2 text-right">上代</div>
                                    <div className="col-span-1 text-center">個数</div>
                                    <div className="col-span-1 text-center">🔍</div>
                                    <div className="col-span-1 text-right">操作</div>
                                </div>
                                {/* 明細行 */}
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
                                        <div className="col-span-1">
                                            <input
                                                type="number"
                                                className="w-full text-right text-[10px] bg-zinc-50 border border-zinc-200 rounded px-1 py-0.5 font-mono"
                                                value={item.cost ?? ""}
                                                placeholder="―"
                                                onChange={e => setLineItems(lineItems.map((li, i) =>
                                                    i === idx ? { ...li, cost: parseInt(e.target.value) || 0 } : li
                                                ))}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <input
                                                type="number"
                                                className="w-full text-right text-[10px] border border-zinc-200 rounded px-1 py-0.5 font-mono"
                                                value={item.price}
                                                onChange={e => setLineItems(lineItems.map((li, i) =>
                                                    i === idx ? { ...li, price: parseInt(e.target.value) || 0 } : li
                                                ))}
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <input
                                                type="number"
                                                className="w-full text-center text-[10px] border border-zinc-200 rounded px-1 py-0.5"
                                                value={item.quantity}
                                                min={1}
                                                onChange={e => setLineItems(lineItems.map((li, i) =>
                                                    i === idx ? { ...li, quantity: parseInt(e.target.value) || 1 } : li
                                                ))}
                                            />
                                        </div>
                                        {/* 🔍 部品検索 */}
                                        <div className="col-span-1 text-center">
                                            <button
                                                type="button"
                                                className={`transition-colors text-sm ${partsPanelRowIdx === idx && partsPanelOpen ? 'text-blue-500' : 'text-zinc-400 hover:text-blue-500'}`}
                                                title="部品検索"
                                                onClick={() => {
                                                    setPartsPanelRowIdx(idx);
                                                    setPartsSearchQuery('');
                                                    setPartsPanelOpen(true);
                                                }}
                                            >
                                                🔍
                                            </button>
                                        </div>
                                        <div className="col-span-1 text-right">
                                            <button type="button" onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))} className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {/* 入力行 */}
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
                                        <Input className="h-7 text-xs flex-1" placeholder="備考/仕様" value={newItemSpec} onChange={e => setNewItemSpec(e.target.value)} />
                                        <div className="relative w-16">
                                            <span className="absolute left-1.5 top-1.5 text-[9px] text-zinc-400">仕入</span>
                                            <Input className="h-7 text-xs pl-6 font-mono text-right" placeholder="0" value={newItemCost} onChange={e => setNewItemCost(e.target.value)} />
                                        </div>
                                        <div className="relative w-20">
                                            <span className="absolute left-1.5 top-1.5 text-[9px]">¥</span>
                                            <Input className="h-7 text-xs pl-4 font-mono text-right" placeholder="0" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} />
                                        </div>
                                        <Input className="h-7 text-xs w-12 text-center font-mono" placeholder="1" value={newItemQty} onChange={e => setNewItemQty(e.target.value)} type="number" min={1} />
                                        <Button size="sm" className="h-7 w-8 p-0 bg-blue-600 hover:bg-blue-700" onClick={() => {
                                            if (!newItemName) return;
                                            setLineItems([...lineItems, {
                                                id: `auto-${Date.now()}`,
                                                category: addItemCategory,
                                                name: newItemName,
                                                cost: parseInt(newItemCost) || undefined,
                                                price: parseInt(newItemPrice) || 0,
                                                quantity: parseInt(newItemQty) || 1,
                                                spec: newItemSpec
                                            }]);
                                            setNewItemName("");
                                            setNewItemCost("");
                                            setNewItemPrice("");
                                            setNewItemQty("1");
                                            setNewItemSpec("");
                                        }}>
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* 部品パネル */}
                        <div className="flex flex-col border border-zinc-200 rounded-lg bg-white overflow-hidden shadow-sm">
                            <div className="p-2 border-b bg-zinc-50 flex justify-between items-center">
                                <h3 className="text-xs font-bold text-zinc-700">🔍 部品パネル</h3>
                                {partsPanelOpen && (
                                    <button
                                        type="button"
                                        className="text-[10px] text-zinc-400 hover:text-zinc-600"
                                        onClick={() => { setPartsPanelOpen(false); setPartsPanelRowIdx(null); }}
                                    >
                                        閉じる ✕
                                    </button>
                                )}
                            </div>
                            <div className="flex-1 p-3 overflow-y-auto">
                                {!partsPanelOpen ? (
                                    <div className="h-40 flex flex-col items-center justify-center text-zinc-300 gap-2">
                                        <span className="text-3xl">🔍</span>
                                        <p className="text-xs text-center">明細行の 🔍 ボタンを押して<br />部品を検索してください</p>
                                    </div>
                                ) : (
                                    <div className="text-xs text-zinc-500 mb-2 px-1">
                                        {partsPanelRowIdx !== null && lineItems[partsPanelRowIdx]
                                            ? `「${lineItems[partsPanelRowIdx].name || '（未入力）'}」の部品を検索`
                                            : '部品を検索'}
                                    </div>
                                )}
                                {partsPanelOpen && (
                                    <PartsSearchPanel
                                        mode="panel"
                                        onSelect={(part) => {
                                            if (partsPanelRowIdx === null) return;
                                            setLineItems(lineItems.map((li, i) =>
                                                i === partsPanelRowIdx
                                                    ? {
                                                        ...li,
                                                        name: part.nameJp,
                                                        price: part.retailPrice,
                                                        cost: part.latestCostYen,
                                                        spec: part.grade || li.spec,
                                                        partsMasterId: (part as any).id ?? null,
                                                        category: 'part_external',
                                                    }
                                                    : li
                                            ));
                                            setPartsPanelOpen(false);
                                            setPartsPanelRowIdx(null);
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                </div>
                )}

                {/* 写真タブ */}
                {activeTab === 'photo' && (
                <div className="p-3">
                <div>
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
                        <div className="bg-zinc-100 rounded-md p-2 grid grid-cols-3 gap-2 auto-rows-min content-start min-h-[200px]">
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
                </div>
                )}

                {/* 書類タブ */}
                {activeTab === 'document' && (
                <div className="p-3">
                <div>
                    {/* 保証書 */}
                    <Card className="p-4 shadow-sm border-t-4 border-t-purple-500 bg-white max-w-sm">
                        <h3 className="text-sm font-bold text-zinc-700 mb-1">修理保証書</h3>
                        {initialData?.issuedWarranty ? (
                            <p className="text-[10px] text-zinc-400 mb-3">発行済: {initialData.issuedWarranty.number}</p>
                        ) : (
                            <p className="text-[10px] text-zinc-400 mb-3">未発行</p>
                        )}
                        <Button
                            size="sm"
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold"
                            onClick={() => {
                                if (warrantyDocumentUrl) {
                                    window.open(warrantyDocumentUrl, '_blank', 'noopener,noreferrer');
                                }
                            }}
                            disabled={!warrantyDocumentUrl}
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            保証書発行
                        </Button>
                    </Card>
                </div>
                </div>
                )}

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

            {/* ── AIチャット入力（固定UI） ── */}
            {/* 🤖 AI入力 フローティングボタン */}
            <button
                type="button"
                onClick={() => setAiChatOpen(v => !v)}
                className="fixed bottom-6 z-50 flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-900 active:scale-95 text-white text-sm font-bold px-4 py-2.5 rounded-full shadow-xl transition-all select-none" style={{ right: '76px' }}
            >
                🤖 <span>AI入力</span>
            </button>

            {/* スライドアップ チャット欄 */}
            <div
                className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-in-out ${aiChatOpen ? 'translate-y-0' : 'translate-y-full'}`}
            >
                <div className="bg-white border-t border-zinc-200 shadow-2xl px-4 py-3 flex flex-col gap-2">
                    {/* ヘッダー */}
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-zinc-700 flex items-center gap-1.5">
                            🤖 <span>AI入力</span>
                        </span>
                        <button
                            type="button"
                            onClick={() => setAiChatOpen(false)}
                            className="text-zinc-400 hover:text-zinc-700 text-xl leading-none px-1"
                            aria-label="閉じる"
                        >
                            ×
                        </button>
                    </div>
                    {/* 入力エリア */}
                    <div className="flex gap-2 items-center">
                        <Input
                            className="flex-1 text-sm"
                            placeholder="例：オーバーホール15,000円、リューズ交換 部品代3,000円..."
                            value={aiChatInput}
                            onChange={e => setAiChatInput(e.target.value)}
                        />
                        <button
                            type="button"
                            className="text-xl leading-none text-zinc-500 hover:text-blue-500 transition-colors shrink-0"
                            title="音声入力（後工程で実装）"
                        >
                            🎤
                        </button>
                        <Button
                            type="button"
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 shrink-0"
                            disabled
                        >
                            送信
                        </Button>
                    </div>
                    <p className="text-[9px] text-zinc-400 text-center">AI連携機能は後工程で実装予定です</p>
                </div>
            </div>


        {/* 在庫不足警告ダイアログ */}
        {stockWarnings.length > 0 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
                    <h2 className="text-lg font-bold text-red-600">在庫不足の部品があります</h2>
                    <div className="border rounded divide-y text-sm">
                        {stockWarnings.map((w, i) => (
                            <div key={i} className="px-3 py-2 flex justify-between">
                                <span className="font-medium">{w.partName}</span>
                                <span className="text-gray-500">
                                    必要: <span className="font-bold text-red-500">{w.required}</span>　在庫: {w.stock}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500">不足分は自動的に発注リストに追加されました。</p>
                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setStockWarnings([])}>
                            このまま続ける
                        </Button>
                        <Button onClick={() => router.push('/orders')}
                            className="bg-blue-600 hover:bg-blue-700 text-white">
                            発注リストを確認する
                        </Button>
                    </div>
                </div>
            </div>
        )}
        </div>
    );
}
