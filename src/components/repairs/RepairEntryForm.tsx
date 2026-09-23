"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
    ArrowLeft, Camera, Printer, Save, Search, Check, ChevronDown, ChevronRight, User, Watch,
    Settings, Trash2, Plus, Image as ImageIcon, MapPin, Phone, Mail, MessageCircle,
    Clock, CheckCircle, Smartphone, FileText, RefreshCw, AlertTriangle, ExternalLink, Calendar,
    Eye, Truck
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getShippingFeeByAddress } from "@/lib/shipping";
import { matchesBrandSearch } from "@/lib/master-normalize";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatPartDisplay } from "@/lib/formatPartDisplay";
import { createEstimateItemFromPart } from "@/lib/estimate-item";
import { canApplyPartsOrderStatus, getRepairStatusFromActiveOrderStatuses } from "@/lib/repair-parts-status";
import { getRepairStatusForSave } from "@/lib/repair-status-transition";
import {
    PART_INPUT_TYPES,
    type PartInputType,
    getPartCategoriesByType,
    getPartNameOptionByKey,
    getPartNamesByCategory,
} from "@/lib/part-input-options";
import {
    DEFAULT_PART_SEARCH_SITES,
    buildEnglishPartQueries,
    buildJapanesePartQueries,
    buildSearchUrls,
    normalizeSearchSites,
    type SearchSite,
} from "@/lib/part-search";
import {
    getTargetPartKeysForRepairWorkCategory,
    hasTargetPartMappingForRepairWorkCategory,
} from "@/lib/repair-work-target-part-filter";
import { useAutoRefreshOnReturn } from "@/hooks/use-auto-refresh-on-return";
import { toast } from "@/components/ui/use-toast";
import { RepairLineConversation } from "./RepairLineConversation";
import {
    photoSharingFallbacks,
    repairPhotoCategories,
    repairPhotoCategoryLabels,
    repairPhotoStageLabels,
    repairPhotoStages,
    type PhotoSharingValues,
} from "@/lib/repair-photo-sharing";

// --- ACTIONS (Server) ---
import {
    getWatchBrands, getMovementMakers, getModels, getCalibers, getCalibersForModel, getCalibersForRef,
    getPricingRules, getPartsMatched, upsertBrand, upsertModel, upsertCaliber,
    getRefsByModel, upsertRef, getRepairWorkCategories, getRepairWorkActions, getInternalPartNameMasters,
    getExternalRepairPricingRules
} from "@/actions/master-actions";
import { getCustomers } from "@/actions/customer-actions";

// --- COMPONENTS ---
import { QuickRegisterDialog } from "@/components/repairs/QuickRegisterDialog";
import { MobileConnectDialog } from "@/components/repairs/MobileConnectDialog";
import PartsSearchPanel from "@/components/parts/PartsSearchPanel";

// Dynamically import PDF Dialog (Client only)
const PDFPreviewDialog = dynamic(() => import("@/components/repairs/PDFPreviewDialog"), { ssr: false });
type RepairWorkSelectOption = {
    id: number;
    name: string;
    key?: string | null;
    repairType?: "INTERNAL" | "EXTERNAL" | string | null;
    sortOrder?: number | null;
};
type WorkTargetPartOption = {
    id: string;
    name: string;
    key?: string | null;
    partType?: string | null;
    categoryKey?: string | null;
    sortOrder?: number | null;
    categoryName?: string | null;
};
type AddItemCategory = 'internal' | 'external_labor' | 'part_external';

const toLineItemPartType = (partInputType: PartInputType): "interior" | "exterior" =>
    partInputType === "part_internal" ? "interior" : "exterior";

const INTERNAL_REPAIR_WORK_ACTION_KEYS = new Set([
    "exchange",
    "repair",
    "adjust",
    "correction",
    "polish",
    "clean",
    "oil",
    "make",
    "install",
    "remove",
    "hole_tightening",
    "staking",
    "overhaul",
    "inspection",
]);

const EXTERNAL_REPAIR_WORK_ACTION_KEYS = new Set([
    "exchange",
    "install",
    "repair",
    "correction",
    "adjust",
    "processing",
    "make",
    "bonding",
    "polish",
    "finishing",
    "light_finishing",
    "clean",
    "inspection",
    "painting",
    "rust_removal",
    "drying",
    "remove",
    "welding",
    "brazing",
]);

function FormRow({
    label,
    children,
    className,
}: {
    label: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("grid grid-cols-1 gap-1 sm:grid-cols-[104px_1fr] sm:items-center", className)}>
            <Label className="text-xs font-semibold text-zinc-500">{label}</Label>
            {children}
        </div>
    );
}

// §12 確定ステータス定義（2026/04/22）
const STATUS_STEPS: { id: string; label: string }[] = [
    { id: "送付待ち",         label: "送付待ち" },
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
const PART_SEARCH_SITES_STORAGE_KEY = "repair-part-search-sites:v1";

const repairPhotoStageFromStatus = (repairStatus: string) => {
    if (repairStatus === "作業中") return "WORK" as const;
    if (repairStatus === "作業完了" || repairStatus === "納品済み") return "COMPLETION" as const;
    if (["受付", "見積中", "承認待ち", "部品待ち(未注文)", "部品待ち(注文済み)", "部品入荷済み", "作業待ち"].includes(repairStatus)) {
        return "RECEPTION" as const;
    }
    return null;
};

function getRepairPhotoSrc(photo?: { id?: number; storageKey?: string | null } | null): string | null {
    const storageKey = photo?.storageKey?.trim();
    if (!storageKey) return null;
    if (/^(https?:|data:|blob:)/i.test(storageKey)) return storageKey;
    if (/^repairs\/\d+\/\d{6}\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(storageKey) && Number.isInteger(photo?.id)) return `/api/repair-photos/${photo!.id}`;
    return null;
}

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

function normalizePricingCandidateKeyText(value?: string | null): string {
    return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePricingCandidateCustomerType(value?: string | null): string {
    const normalized = normalizePricingCandidateKeyText(value).toLowerCase();
    if (normalized === "b2b" || normalized === "business") return "business";
    if (normalized === "b2c" || normalized === "individual") return "individual";
    return normalized;
}

function normalizePricingCandidateKeyNumber(value?: number | null): string {
    if (value == null) return "";
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? String(numberValue) : "";
}

function pricingCandidateNumberMatches(ruleValue: number | string | null | undefined, lookupValue?: number | null): boolean {
    if (!lookupValue) return true;
    if (ruleValue == null) return false;
    return Number(ruleValue) === Number(lookupValue);
}

function pricingCandidateTextMatches(ruleValue: string | null | undefined, lookupValue?: string | null): boolean {
    const normalizedLookup = normalizePricingCandidateKeyText(lookupValue);
    if (!normalizedLookup) return true;
    return normalizePricingCandidateKeyText(ruleValue) === normalizedLookup;
}

function buildPricingRuleCandidateKey(rule: {
    suggestedWorkName?: string | null;
    minPrice?: number | null;
}) {
    return JSON.stringify([
        normalizePricingCandidateKeyText(rule.suggestedWorkName),
        normalizePricingCandidateKeyNumber(rule.minPrice),
    ]);
}

type PricingRuleCandidateLookup = {
    repairWorkCategoryId?: number | null;
    targetPartNameId?: string | null;
    repairWorkActionId?: number | null;
    detailLabel?: string | null;
    customerType?: string | null;
    expectedWorkName?: string | null;
};

type CustomerTypeSelection = "business" | "individual" | null;

function normalizeCustomerTypeSelection(value?: string | null): CustomerTypeSelection {
    const normalized = normalizePricingCandidateKeyText(value).toLowerCase();
    if (normalized === "business" || normalized === "b2b") return "business";
    if (normalized === "individual" || normalized === "b2c") return "individual";
    return null;
}

type PricingRuleCandidateForCollapse = Parameters<typeof buildPricingRuleCandidateKey>[0] & {
    repairWorkCategoryId?: number | null;
    targetPartNameId?: string | null;
    repairWorkActionId?: number | null;
    detailLabel?: string | null;
    customerType?: string | null;
};

function scorePricingRuleCandidateRepresentative(
    rule: PricingRuleCandidateForCollapse,
    lookup: PricingRuleCandidateLookup
): number {
    let score = 0;
    if (lookup.repairWorkCategoryId && rule.repairWorkCategoryId === lookup.repairWorkCategoryId) score += 100;
    if (lookup.targetPartNameId && rule.targetPartNameId === lookup.targetPartNameId) score += 120;
    if (lookup.repairWorkActionId && rule.repairWorkActionId === lookup.repairWorkActionId) score += 100;

    const lookupDetail = normalizePricingCandidateKeyText(lookup.detailLabel);
    if (lookupDetail && normalizePricingCandidateKeyText(rule.detailLabel) === lookupDetail) score += 40;

    const lookupCustomerType = normalizePricingCandidateCustomerType(lookup.customerType);
    const ruleCustomerType = normalizePricingCandidateCustomerType(rule.customerType);
    if (lookupCustomerType && ruleCustomerType === lookupCustomerType) score += 30;
    if (lookupCustomerType && !ruleCustomerType) score += 5;

    return score;
}

function collapseDuplicatePricingRuleCandidates<T extends PricingRuleCandidateForCollapse>(
    rules: T[],
    lookup: PricingRuleCandidateLookup
): T[] {
    const candidateByKey = new Map<string, { index: number; rule: T; score: number }>();
    rules.forEach((rule, index) => {
        const key = buildPricingRuleCandidateKey(rule);
        const score = scorePricingRuleCandidateRepresentative(rule, lookup);
        const current = candidateByKey.get(key);
        if (!current || score > current.score) {
            candidateByKey.set(key, { index: current?.index ?? index, rule, score });
        }
    });

    return Array.from(candidateByKey.values())
        .sort((a, b) => a.index - b.index)
        .map((candidate) => candidate.rule);
}

function filterPricingRuleCandidatesForDisplay<T extends PricingRuleCandidateForCollapse>(
    rules: T[],
    lookup: PricingRuleCandidateLookup
): T[] {
    const lookupDetail = normalizePricingCandidateKeyText(lookup.detailLabel);
    const lookupCustomerType = normalizePricingCandidateCustomerType(lookup.customerType);
    const expectedWorkName = normalizePricingCandidateKeyText(lookup.expectedWorkName);

    const structurallyFiltered = rules.filter((rule) => {
        const isLegacyStructuredRule = !rule.repairWorkCategoryId
            && !rule.targetPartNameId
            && !rule.repairWorkActionId
            && !normalizePricingCandidateKeyText(rule.detailLabel);
        const matchesExpectedLegacyName = Boolean(expectedWorkName)
            && normalizePricingCandidateKeyText(rule.suggestedWorkName) === expectedWorkName;

        if (isLegacyStructuredRule && matchesExpectedLegacyName) return true;

        if (!pricingCandidateNumberMatches(rule.repairWorkCategoryId, lookup.repairWorkCategoryId)) return false;
        if (!pricingCandidateTextMatches(rule.targetPartNameId, lookup.targetPartNameId)) return false;
        if (!pricingCandidateNumberMatches(rule.repairWorkActionId, lookup.repairWorkActionId)) return false;
        if (lookupDetail && !pricingCandidateTextMatches(rule.detailLabel, lookupDetail)) return false;

        return true;
    });

    return structurallyFiltered.filter((rule) => {
        const ruleCustomerType = normalizePricingCandidateCustomerType(rule.customerType);
        return Boolean(lookupCustomerType) && ruleCustomerType === lookupCustomerType;
    });
}

function dedupePricingRuleCandidatesForAutoFill<T extends Parameters<typeof buildPricingRuleCandidateKey>[0]>(rules: T[]): T[] {
    const seenKeys = new Set<string>();
    return rules.filter((rule) => {
        const key = buildPricingRuleCandidateKey(rule);
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
    });
}

/**
 * INTELLIGENCE CACHE & COMBOBOX
 * Independent, highly-optimized component for fast lookups.
 */
const AdvancedCombobox: React.FC<{
    onSelectOption?: (option: {
        label: string,
        value: string,
        name?: string,
        sub?: string,
        inlineTag?: string,
        meta?: string,
        notes?: string,
        price?: number,
        cost?: number,
        partRef?: string,
        partId?: number,
        partsMasterId?: number,
        grade?: string,
        note1?: string,
        note2?: string,
        partRefs?: string,
        cousinsNumber?: string,
        stockQuantity?: number,
        supplierName?: string,
        repairWorkCategoryId?: number | null,
        repairWorkActionId?: number | null,
        id?: number,
        type?: string | null,
        prefix?: string | null,
        phone?: string | null,
        lineId?: string | null,
        address?: string | null,
        searchText?: string,
        searchKeys?: string[],
    }) => void;
    value: string;
    onChange: (v: string) => void;
    onSearchChange?: (s: string) => void;
    onUpsert?: (v: string) => void;
    placeholder?: string;
    options: {
        label: string,
        value: string,
        name?: string,
        sub?: string,
        inlineTag?: string,
        meta?: string,
        notes?: string,
        price?: number,
        cost?: number,
        partRef?: string,
        partId?: number,
        partsMasterId?: number,
        grade?: string,
        note1?: string,
        note2?: string,
        partRefs?: string,
        cousinsNumber?: string,
        stockQuantity?: number,
        supplierName?: string,
        repairWorkCategoryId?: number | null,
        repairWorkActionId?: number | null,
        id?: number,
        type?: string | null,
        prefix?: string | null,
        phone?: string | null,
        lineId?: string | null,
        address?: string | null,
        searchText?: string,
        searchKeys?: string[],
    }[];
    disabled?: boolean;
    requireSelection?: boolean;
    className?: string;
}> = ({ value, onChange, onSearchChange, onSelectOption, onUpsert, placeholder, options, disabled, requireSelection = false, className }) => {
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
            (opt.value || "").toLowerCase().includes(low) ||
            (opt.searchText || "").toLowerCase().includes(low) ||
            matchesBrandSearch(search, opt.searchKeys ?? [opt.searchText, opt.label, opt.value])
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
                        if (!requireSelection) onChange(val);
                        if (!isOpen) setIsOpen(true);
                        if (onSearchChange) onSearchChange(val);
                    }}
                    onFocus={() => setIsOpen(true)}
                    disabled={disabled}
                />
                <ChevronDown className="h-3 w-3 opacity-50 cursor-pointer text-zinc-600" />
            </div>
            {isOpen && (
                <div className={cn(
                    "absolute top-full z-50 mt-1 w-full min-w-[200px] overflow-visible rounded-sm border border-zinc-200 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-100 origin-top-left",
                    filtered.length === 0 && !onUpsert && "pointer-events-none"
                )}>
                    <div className="overflow-y-auto p-1 max-h-80">
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
                                key={`${opt.partsMasterId ?? opt.partId ?? "opt"}-${opt.value}-${i}`}
                                className={cn(
                                    "min-h-[64px] px-2.5 py-2 text-xs leading-snug hover:bg-blue-50 hover:text-blue-700 cursor-pointer rounded-sm transition-colors",
                                    value === opt.value ? "bg-blue-100 text-blue-800 font-bold" : "text-zinc-700"
                                )}
                                onClick={() => {
                                    onChange(opt.value);
                                    onSelectOption?.(opt);
                                    setSearch(""); // Reset search on select
                                    setIsOpen(false);
                                }}
                            >
                                <div className="flex w-full items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                                    <span className="break-words text-xs leading-snug">{opt.label}</span>
                                                    {opt.inlineTag && (
                                                        <span className="text-xs leading-snug font-medium text-zinc-500">({opt.inlineTag})</span>
                                                    )}
                                                </div>
                                            </div>
                                            {opt.price !== undefined && (
                                                <span className="shrink-0 text-[10px] font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-500">
                                                    ¥{opt.price.toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                        {opt.meta && (
                                            <div className="mt-0.5 break-words text-xs leading-snug text-zinc-500 font-normal">
                                                {opt.meta}
                                            </div>
                                        )}
                                        {opt.notes && (
                                            <div className="mt-0.5 break-words text-xs leading-snug text-zinc-400 font-normal">
                                                {opt.notes}
                                            </div>
                                        )}
                                        {!opt.meta && !opt.notes && opt.sub && (
                                            <span className="mt-0.5 block break-words text-xs leading-snug text-zinc-400 font-normal">{opt.sub}</span>
                                        )}
                                    </div>
                                    {value === opt.value && <Check className="mt-0.5 h-3 w-3 shrink-0" />}
                                </div>
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

function getServerStateSyncKey(initialData: any): string {
    return JSON.stringify({
        repairId: initialData?.id ?? null,
        status: initialData?.status ?? null,
        statusLog: Object.entries(initialData?.statusLog ?? {})
            .sort(([left], [right]) => left.localeCompare(right)),
        orderRequests: (initialData?.orderRequests ?? [])
            .map((order: any) => ({
                id: order.id ?? null,
                partsMasterId: order.partsMasterId ?? null,
                quantity: order.quantity ?? null,
                status: order.status ?? null,
            }))
            .sort((left: { id: number | null }, right: { id: number | null }) => (left.id ?? 0) - (right.id ?? 0)),
    });
}

export function RepairEntryForm({ initialData, mode = 'create' }: Props) {
    const router = useRouter();
    useAutoRefreshOnReturn({ refreshOnFocus: false, refreshOnVisibility: false });
    const [isSaving, setIsSaving] = useState(false);
    const [isCreatingPublicCase, setIsCreatingPublicCase] = useState(false);
    const [isEditingEnabled, setIsEditingEnabled] = useState(mode !== 'view');
    const isReadOnly = mode === 'view' && !isEditingEnabled;

    useEffect(() => {
        setIsEditingEnabled(mode !== 'view');
    }, [mode, initialData?.id]);

    // 新規作成時のstatusLog初期化（useEffectでクライアント確定後に実行してHydrationエラーを防ぐ）
    useEffect(() => {
        if (!initialData?.statusLog?.["受付"] && (initialData?.status ?? "受付") === "受付") {
            const receptionDate = initialData?.createdAt
                ? new Date(initialData.createdAt).toLocaleDateString('ja-JP')
                : new Date().toLocaleDateString('ja-JP');
            setStatusLog(prev => prev["受付"] ? prev : { ...prev, "受付": receptionDate });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // --- 1. CORE DATA ---
    const [status, setStatus] = useState<string>(initialData?.status || "受付");
    const [persistedStatus, setPersistedStatus] = useState<string>(initialData?.status || "受付");
    const [statusLog, setStatusLog] = useState<Record<string, string>>(initialData?.statusLog ?? {});
    const [customerId, setCustomerId] = useState<number | null>(initialData?.customer?.id || null);
    const [customerTypeSelection, setCustomerTypeSelection] = useState<CustomerTypeSelection>(
        normalizeCustomerTypeSelection(initialData?.customer?.type)
    );
    const isB2B = customerTypeSelection === 'business';
    const [customerName, setCustomerName] = useState(initialData?.customer?.name || "");
    const [customerPrefix, setCustomerPrefix] = useState(initialData?.customer?.prefix || "");
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
    const [movementMaker, setMovementMaker] = useState(initialData?.movementMaker?.name || "");
    const [movementCaliber, setMovementCaliber] = useState(initialData?.movementCaliber?.name || "");
    const [baseMovementMaker, setBaseMovementMaker] = useState(initialData?.baseMovementMaker?.name || "");
    const [baseMovementCaliber, setBaseMovementCaliber] = useState(initialData?.baseMovementCaliber?.name || "");
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
        category: AddItemCategory | 'external' | 'part_internal' | 'part_generic';
        partType?: string;
        name: string;
        partNameEn?: string;
        price: number;   // 上代
        cost?: number;   // 仕入値（管理者のみ）
        quantity: number; // 個数
        partRef?: string;
        spec?: string;
        grade?: string;
        note1?: string;
        note2?: string;
        cousinsNumber?: string;
        stockQuantity?: number;
        supplierName?: string;
        status?: 'pending' | 'ordered' | 'arrived';
        partsMasterId?: number | null;
        repairWorkCategoryId?: number | null;
        repairWorkActionId?: number | null;
        targetPartNameId?: string | null;
        detailLabelSnapshot?: string | null;
        categoryNameSnapshot?: string | null;
        targetPartNameSnapshot?: string | null;
        actionNameSnapshot?: string | null;
        b2cDisplayNameSnapshot?: string | null;
        sourceAreaSnapshot?: string | null;
    }
    type OrderListItem = { id?: number; partId: number; quantity: number; status: 'pending' | 'ordered' | 'received' | 'assigned' };
    const [lineItems, setLineItems] = useState<LineItem[]>(() => {
        if (!initialData?.estimate?.items) return [];
        return initialData.estimate.items.map((i: any) => (
            i.type === 'labor'
                ? {
                    id: String(i.id),
                    category: i.category || (i.sourceAreaSnapshot === 'external' ? 'external_labor' : 'internal'),
                    sourceAreaSnapshot: i.sourceAreaSnapshot ?? null,
                    b2cDisplayNameSnapshot: i.b2cDisplayNameSnapshot ?? null,
                    grade: i.gradeNameSnapshot ?? undefined,
                    name: i.itemName,
                    price: i.unitPrice,
                    quantity: i.quantity || 1,
                    spec: i.notes,
                    repairWorkCategoryId: i.repairWorkCategoryId ?? null,
                    repairWorkActionId: i.repairWorkActionId ?? null,
                    targetPartNameId: i.targetPartNameId ?? null,
                    detailLabelSnapshot: i.detailLabelSnapshot ?? null,
                    categoryNameSnapshot: i.categoryNameSnapshot ?? null,
                    targetPartNameSnapshot: i.targetPartNameSnapshot ?? null,
                    actionNameSnapshot: i.actionNameSnapshot ?? null,
                }
                : createEstimateItemFromPart(i.partsMaster ?? {}, {
                    id: String(i.id),
                    category: i.sourceAreaSnapshot === 'internal' ? 'part_internal' : 'part_external',
                    sourceAreaSnapshot: i.sourceAreaSnapshot ?? null,
                    b2cDisplayNameSnapshot: i.b2cDisplayNameSnapshot ?? null,
                    ...(i.gradeNameSnapshot != null ? { grade: i.gradeNameSnapshot } : {}),
                    name: i.itemName,
                    price: i.unitPrice,
                    quantity: i.quantity || 1,
                    spec: i.notes,
                    partsMasterId: i.partsMasterId ?? null,
                    repairWorkCategoryId: null,
                    repairWorkActionId: null,
                    targetPartNameId: null,
                    detailLabelSnapshot: i.detailLabelSnapshot ?? null,
                    categoryNameSnapshot: i.categoryNameSnapshot ?? null,
                    targetPartNameSnapshot: i.targetPartNameSnapshot ?? null,
                    actionNameSnapshot: i.actionNameSnapshot ?? null,
                }) as LineItem
        ));
    });
    const [orderList, setOrderList] = useState<OrderListItem[]>(() =>
        (initialData?.orderRequests ?? []).map((order: any) => ({
            id: order.id,
            partId: order.partsMasterId,
            quantity: order.quantity,
            status: order.status,
        })).filter((order: OrderListItem) => Boolean(order.partId))
    );
    const serverStateSyncKey = getServerStateSyncKey(initialData);
    const lastSyncedServerStateKeyRef = useRef(serverStateSyncKey);

    useEffect(() => {
        const serverStatus = initialData?.status;
        if (!initialData?.id || typeof serverStatus !== 'string') return;
        if (lastSyncedServerStateKeyRef.current === serverStateSyncKey) return;

        lastSyncedServerStateKeyRef.current = serverStateSyncKey;
        setStatus(serverStatus);
        setPersistedStatus(serverStatus);
        setStatusLog(initialData.statusLog ?? {});
        setOrderList((initialData.orderRequests ?? []).map((order: any) => ({
            id: order.id,
            partId: order.partsMasterId,
            quantity: order.quantity,
            status: order.status,
        })).filter((order: OrderListItem) => Boolean(order.partId)));
    }, [initialData?.id, serverStateSyncKey]);

    // Inputs for adding new items
    const [addItemCategory, setAddItemCategory] = useState<AddItemCategory>('internal');
    const [newItemName, setNewItemName] = useState("");
    const [newItemCost, setNewItemCost] = useState("");
    const [newItemPrice, setNewItemPrice] = useState("");
    const [newItemQty, setNewItemQty] = useState("1");
    const [newItemSpec, setNewItemSpec] = useState("");
    const [selectedWorkOption, setSelectedWorkOption] = useState<any | null>(null);
    const [newItemPriceManuallyEdited, setNewItemPriceManuallyEdited] = useState(false);
    const autoFilledPricingRuleIdRef = useRef<number | null>(null);
    const [structuredWorkOpen, setStructuredWorkOpen] = useState(false);
    const [repairWorkCategoryOptions, setRepairWorkCategoryOptions] = useState<RepairWorkSelectOption[]>([]);
    const [repairWorkActionOptions, setRepairWorkActionOptions] = useState<RepairWorkSelectOption[]>([]);
    const [workTargetPartOptions, setWorkTargetPartOptions] = useState<WorkTargetPartOption[]>([]);
    const [newWorkCategoryId, setNewWorkCategoryId] = useState("");
    const [newWorkCategorySnapshot, setNewWorkCategorySnapshot] = useState("");
    const [newTargetPartNameId, setNewTargetPartNameId] = useState("");
    const [newTargetPartNameSnapshot, setNewTargetPartNameSnapshot] = useState("");
    const [newWorkActionId, setNewWorkActionId] = useState("");
    const [newWorkActionSnapshot, setNewWorkActionSnapshot] = useState("");
    const [newWorkDetailLabel, setNewWorkDetailLabel] = useState("");
    const [selectedPartInputType, setSelectedPartInputType] = useState<PartInputType>("part_external");
    const [selectedPartCategoryKey, setSelectedPartCategoryKey] = useState("");
    const [selectedPartNameKey, setSelectedPartNameKey] = useState("");

    const isAddingPartItem = addItemCategory.includes("part");
    const isAddingExternalLaborItem = addItemCategory === "external_labor";
    const isAddingLaborItem = !isAddingPartItem;
    const cleanOptionalText = useCallback((value?: string | null) => {
        const normalized = (value ?? "").replace(/\s+/g, " ").trim();
        return normalized || null;
    }, []);
    const displayValueOrDash = useCallback((value?: string | null) => {
        const normalized = (value ?? "").trim();
        return normalized || "-";
    }, []);
    const displayCalMaker = movementMaker || (!movementCaliber && caliber ? brand : "");
    const displayCalName = movementCaliber || caliber;
    const resetStructuredWorkInputs = useCallback(() => {
        setNewWorkCategoryId("");
        setNewWorkCategorySnapshot("");
        setNewTargetPartNameId("");
        setNewTargetPartNameSnapshot("");
        setNewWorkActionId("");
        setNewWorkActionSnapshot("");
        setNewWorkDetailLabel("");
    }, []);
    const partCategoryOptions = useMemo(
        () => getPartCategoriesByType(selectedPartInputType),
        [selectedPartInputType]
    );
    const partNameOptions = useMemo(
        () => selectedPartCategoryKey ? getPartNamesByCategory(selectedPartCategoryKey) : [],
        [selectedPartCategoryKey]
    );
    const selectedPartNameOption = useMemo(
        () => selectedPartNameKey ? getPartNameOptionByKey(selectedPartNameKey) : undefined,
        [selectedPartNameKey]
    );
    const selectedRepairWorkCategoryKey = useMemo(() => {
        if (!newWorkCategoryId) return null;
        return repairWorkCategoryOptions.find((option) => String(option.id) === newWorkCategoryId)?.key ?? null;
    }, [newWorkCategoryId, repairWorkCategoryOptions]);
    const visibleRepairWorkCategoryOptions = useMemo(() => {
        const expectedRepairType = isAddingExternalLaborItem ? "EXTERNAL" : "INTERNAL";
        return repairWorkCategoryOptions.filter((option) => !option.repairType || option.repairType === expectedRepairType);
    }, [isAddingExternalLaborItem, repairWorkCategoryOptions]);
    const visibleRepairWorkActionOptions = useMemo(() => {
        const allowedKeys = isAddingExternalLaborItem
            ? EXTERNAL_REPAIR_WORK_ACTION_KEYS
            : INTERNAL_REPAIR_WORK_ACTION_KEYS;

        return repairWorkActionOptions.filter((option) => Boolean(option.key && allowedKeys.has(option.key)));
    }, [isAddingExternalLaborItem, repairWorkActionOptions]);
    const visibleWorkTargetPartOptions = useMemo(() => {
        const externalPartTypes = new Set(["part_external", "external", "exterior"]);
        const internalPartTypes = new Set(["part_internal", "internal", "interior"]);
        const allowedPartTypes = isAddingExternalLaborItem ? externalPartTypes : internalPartTypes;

        return workTargetPartOptions.filter((option) => {
            if (!option.partType) return !isAddingExternalLaborItem;
            return allowedPartTypes.has(option.partType);
        });
    }, [isAddingExternalLaborItem, workTargetPartOptions]);
    const filteredWorkTargetPartOptions = useMemo(() => {
        if (!newWorkCategoryId) return visibleWorkTargetPartOptions;

        const targetPartKeys = getTargetPartKeysForRepairWorkCategory(selectedRepairWorkCategoryKey);
        if (!targetPartKeys) {
            if (!isAddingExternalLaborItem || !selectedRepairWorkCategoryKey) return [];
            return visibleWorkTargetPartOptions.filter((option) => option.categoryKey === selectedRepairWorkCategoryKey);
        }

        const keySet = new Set(targetPartKeys);
        return visibleWorkTargetPartOptions.filter((option) => option.key ? keySet.has(option.key) : false);
    }, [isAddingExternalLaborItem, newWorkCategoryId, selectedRepairWorkCategoryKey, visibleWorkTargetPartOptions]);
    const targetPartCandidateMessage = useMemo(() => {
        if (!newWorkCategoryId) return "";
        if (!hasTargetPartMappingForRepairWorkCategory(selectedRepairWorkCategoryKey) && !isAddingExternalLaborItem) {
            return "このカテゴリの対象部品候補は未設定です";
        }
        if (filteredWorkTargetPartOptions.length === 0) {
            return "対象部品候補が未設定です。seed未投入、またはmapping未設定の可能性があります。";
        }
        return "";
    }, [filteredWorkTargetPartOptions.length, isAddingExternalLaborItem, newWorkCategoryId, selectedRepairWorkCategoryKey]);
    const handleRepairWorkCategoryChange = useCallback((nextId: string) => {
        setNewWorkCategoryId(nextId);
        const selected = repairWorkCategoryOptions.find((option) => String(option.id) === nextId);
        setNewWorkCategorySnapshot(selected?.name ?? "");
        if (!nextId) return;

        const targetPartKeys = getTargetPartKeysForRepairWorkCategory(selected?.key);
        if (!targetPartKeys) {
            const currentTargetPart = visibleWorkTargetPartOptions.find((option) => option.id === newTargetPartNameId);
            if (isAddingExternalLaborItem && currentTargetPart?.categoryKey === selected?.key) return;
            setNewTargetPartNameId("");
            setNewTargetPartNameSnapshot("");
            return;
        }

        const currentTargetPart = visibleWorkTargetPartOptions.find((option) => option.id === newTargetPartNameId);
        if (currentTargetPart?.key && targetPartKeys.includes(currentTargetPart.key)) return;

        setNewTargetPartNameId("");
        setNewTargetPartNameSnapshot("");
    }, [isAddingExternalLaborItem, newTargetPartNameId, repairWorkCategoryOptions, visibleWorkTargetPartOptions]);
    const handleRepairWorkActionChange = useCallback((nextId: string) => {
        setNewWorkActionId(nextId);
        const selected = visibleRepairWorkActionOptions.find((option) => String(option.id) === nextId);
        setNewWorkActionSnapshot(selected?.name ?? "");
    }, [visibleRepairWorkActionOptions]);
    const handleTargetPartNameChange = useCallback((nextId: string) => {
        setNewTargetPartNameId(nextId);
        const selected = filteredWorkTargetPartOptions.find((option) => option.id === nextId);
        setNewTargetPartNameSnapshot(selected?.name ?? "");
    }, [filteredWorkTargetPartOptions]);

    const handlePartInputTypeChange = useCallback((nextType: PartInputType) => {
        setSelectedPartInputType(nextType);
        setSelectedPartCategoryKey("");
        setSelectedPartNameKey("");
        setNewItemName("");
        setSelectedWorkOption(null);
    }, []);

    const handlePartCategoryChange = useCallback((nextCategoryKey: string) => {
        setSelectedPartCategoryKey(nextCategoryKey);
        setSelectedPartNameKey("");
        setNewItemName("");
        setSelectedWorkOption(null);
    }, []);

    const handlePartNameChange = useCallback((nextPartNameKey: string) => {
        setSelectedPartNameKey(nextPartNameKey);
        const selected = getPartNameOptionByKey(nextPartNameKey);
        if (selected) {
            setNewItemName(selected.displayJa ?? selected.nameJa);
            setSelectedWorkOption(null);
        } else {
            setNewItemName("");
        }
    }, []);

    const buildSelectedPartName = useCallback((baseName: string, part: any) => {
        const selectedName = [part.name, part.nameJp, part.itemName]
            .find((value) => typeof value === "string" && value.trim().length > 0)
            ?.trim();
        const stripGradeText = (name: string) =>
            name
                .replace(/（(純正|FIT|合わせ|中古)）/g, "")
                .replace(/\((純正|FIT|合わせ|中古)\)/g, "")
                .trim();
        const name = stripGradeText(selectedName ?? baseName);
        return name;
    }, []);

    const buildPartLineItem = useCallback((base: LineItem, part: any): LineItem => {
        const resolvedPartType = part.partType === "interior" || part.partType === "exterior"
            ? part.partType
            : base.partType;
        const resolvedCategory = resolvedPartType === "interior"
            ? "part_internal"
            : resolvedPartType === "exterior"
                ? "part_external"
                : base.category;

        return createEstimateItemFromPart(part, {
            ...base,
            name: buildSelectedPartName(base.name, part),
            price: part.price ?? part.retailPrice ?? base.price,
            cost: part.cost ?? part.latestCostYen ?? base.cost,
            grade: part.grade ?? base.grade,
            spec: part.grade || base.spec,
            category: resolvedCategory,
            partType: resolvedPartType,
            partsMasterId: part.partsMasterId ?? part.partId ?? part.id ?? base.partsMasterId ?? null,
        }) as LineItem
    }, [buildSelectedPartName]);

    const queuePartForOrderList = useCallback((partId: number, quantity = 1) => {
        if (quantity <= 0) return false;
        let changed = false;
        setOrderList(prev => {
            const existing = prev.find(order => order.partId === partId && ['pending', 'ordered'].includes(order.status));
            if (existing) {
                changed = true;
                return prev.map(order =>
                    order === existing ? { ...order, quantity: (order.quantity || 1) + quantity } : order
                );
            }
            changed = true;
            return [...prev, { partId, quantity, status: "pending" }];
        });
        return changed;
    }, []);

    const getOrderQuantitiesForPart = useCallback((partId?: number | null) => {
        if (!partId) return { pending: 0, ordered: 0, received: 0 };
        return orderList.reduce((acc, order) => {
            if (order.partId !== partId) return acc;
            const qty = Number(order.quantity) || 1;
            if (order.status === 'pending') acc.pending += qty;
            else if (order.status === 'ordered') acc.ordered += qty;
            else if (order.status === 'received') acc.received += qty;
            return acc;
        }, { pending: 0, ordered: 0, received: 0 });
    }, [orderList]);

    const getTotalRequiredQuantityForPart = useCallback((partId?: number | null, items: LineItem[] = lineItems) => {
        if (!partId) return 0;
        return items.reduce((sum, item) => (
            item.category.includes('part') && item.partsMasterId === partId
                ? sum + (Number(item.quantity) || 1)
                : sum
        ), 0);
    }, [lineItems]);

    const getMissingOrderQuantityForPart = useCallback((partId?: number | null, items: LineItem[] = lineItems, stockQuantity?: number) => {
        if (!partId) return 0;
        const totalRequired = getTotalRequiredQuantityForPart(partId, items);
        const fallbackStock = items.find(item => item.partsMasterId === partId)?.stockQuantity ?? 0;
        const stock = Math.max(0, stockQuantity ?? fallbackStock ?? 0);
        const shortage = Math.max(0, totalRequired - stock);
        const covered = (() => {
            const quantities = getOrderQuantitiesForPart(partId);
            return quantities.pending + quantities.ordered;
        })();
        return Math.max(0, shortage - covered);
    }, [getOrderQuantitiesForPart, getTotalRequiredQuantityForPart, lineItems]);

    const getStatusLabelForLineItem = useCallback((item: LineItem, idx: number) => {
        if (!item.category.includes('part') || !item.partsMasterId) return null;

        const stock = Math.max(0, item.stockQuantity ?? 0);
        const quantities = getOrderQuantitiesForPart(item.partsMasterId);
        const consumedBefore = lineItems.reduce((sum, current, currentIdx) => {
            if (currentIdx >= idx) return sum;
            if (!current.category.includes('part') || current.partsMasterId !== item.partsMasterId) return sum;
            return sum + (Number(current.quantity) || 1);
        }, 0);
        const lineQty = Number(item.quantity) || 1;
        const remainingStockBefore = Math.max(0, stock - consumedBefore);
        const stockCovered = Math.min(remainingStockBefore, lineQty);
        const shortage = lineQty - stockCovered;

        if (shortage <= 0) return '在庫あり';

        const shortageBefore = Math.max(0, consumedBefore - stock);
        const pendingCovered = Math.max(0, Math.min(quantities.pending - shortageBefore, shortage));
        if (pendingCovered > 0) return '発注リスト追加済み';

        const orderedOffset = Math.max(0, shortageBefore - quantities.pending);
        const orderedCovered = Math.max(0, Math.min(quantities.ordered - orderedOffset, shortage));
        if (orderedCovered > 0) return '注文済み';

        const receivedOffset = Math.max(0, shortageBefore - quantities.pending - quantities.ordered);
        const receivedCovered = Math.max(0, Math.min(quantities.received - receivedOffset, shortage));
        if (receivedCovered > 0) return '入荷済み';

        return '発注リスト追加済み';
    }, [getOrderQuantitiesForPart, lineItems]);

    const getActiveOrderForPart = useCallback((partId?: number | null) => {
        if (!partId) return undefined;
        const orders = orderList.filter(order => order.partId === partId);
        if (orders.length === 0) return undefined;

        const pending = orders.find(order => order.status === 'pending');
        if (pending) return pending;

        const ordered = orders.find(order => order.status === 'ordered');
        if (ordered) return ordered;

        const received = orders
            .filter(order => order.status === 'received')
            .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
        return received;
    }, [orderList]);

    const upsertOrderListEntry = useCallback((order: any) => {
        if (!order?.partsMasterId) return;
        setOrderList(prev => {
            const next: OrderListItem = {
                id: order.id,
                partId: order.partsMasterId,
                quantity: order.quantity ?? 1,
                status: order.status,
            };
            const exists = prev.some(entry => entry.id === next.id);
            return exists
                ? prev.map(entry => entry.id === next.id ? next : entry)
                : [...prev, next];
        });
    }, []);

    const fetchRepairOrders = useCallback(async () => {
        if (!initialData?.id) return;
        const res = await fetch(`/api/orders?repairId=${initialData.id}`);
        if (!res.ok) return;
        const data = await res.json();
        setOrderList((Array.isArray(data) ? data : []).map((order: any) => ({
            id: order.id,
            partId: order.partsMasterId,
            quantity: order.quantity,
            status: order.status,
        })).filter((order: OrderListItem) => Boolean(order.partId)));
    }, [initialData?.id]);

    useEffect(() => {
        fetchRepairOrders();
    }, [fetchRepairOrders]);

    useEffect(() => {
        if (!initialData?.id) return;

        const handleFocus = () => { void fetchRepairOrders(); };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                void fetchRepairOrders();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [fetchRepairOrders, initialData?.id]);

    const ensureOrderRequest = useCallback(async (item: LineItem, showToast = false) => {
        if (!item.partsMasterId) return false;
        const quantity = Number(item.quantity) || 1;
        if (quantity <= 0) return false;

        if (!initialData?.id) {
            const added = queuePartForOrderList(item.partsMasterId, quantity);
            if (added && showToast) {
                toast({
                    title: "発注リストに追加しました",
                    description: item.supplierName ? `仕入先: ${item.supplierName}` : undefined,
                });
            }
            return added;
        }

        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                repairId: initialData.id,
                partsMasterId: item.partsMasterId,
                quantity,
            })
        });

        if (!res.ok) {
            throw new Error('failed to create order request');
        }

        const json = await res.json();
        if (json.order) {
            upsertOrderListEntry(json.order);
        }
        if (json.created && showToast) {
            toast({
                title: "発注リストに追加しました",
                description: item.supplierName ? `仕入先: ${item.supplierName}` : undefined,
            });
        }
        return Boolean(json.created || json.updated);
    }, [initialData?.id, orderList, queuePartForOrderList, upsertOrderListEntry]);

    const finalizePartLineItem = useCallback((item: LineItem, showToast = false) => {
        if (!item.category.includes('part') || !item.partsMasterId) return item;

        return { ...item, status: undefined };
    }, []);

    const handleOrderAction = useCallback((idx: number) => {
        const item = lineItems[idx];
        if (!item?.category.includes('part') || !item.partsMasterId) return;
        const partId = item.partsMasterId;

        const missingQty = getMissingOrderQuantityForPart(partId);

        if (missingQty <= 0) {
            toast({
                title: "在庫あり",
                description: "在庫があるため発注リスト追加は不要です。",
            });
            return;
        }

        setLineItems(prev => prev.map((li, i) =>
            i === idx ? { ...li, status: 'pending' as const } : li
        ));
        void ensureOrderRequest({ ...item, quantity: missingQty, status: 'pending' as const }, true);
    }, [lineItems, ensureOrderRequest, getMissingOrderQuantityForPart]);

    useEffect(() => {
        if (initialData?.id) return;
        const missingPartIds = lineItems
            .filter(item =>
                item.category.includes('part') &&
                item.partsMasterId &&
                (item.stockQuantity ?? 0) <= 0 &&
                getMissingOrderQuantityForPart(item.partsMasterId) > 0
            )
            .map(item => ({
                partId: item.partsMasterId as number,
                quantity: getMissingOrderQuantityForPart(item.partsMasterId),
            }))
            .filter(item => item.quantity > 0);

        if (missingPartIds.length === 0) return;

        setOrderList(prev => {
            let next = [...prev];
            for (const item of missingPartIds) {
                const existing = next.find(order => order.partId === item.partId && ['pending', 'ordered'].includes(order.status));
                if (existing) {
                    next = next.map(order =>
                        order === existing ? { ...order, quantity: item.quantity } : order
                    );
                } else {
                    next.push({ partId: item.partId, quantity: item.quantity, status: "pending" as const });
                }
            }
            return next;
        });
    }, [getMissingOrderQuantityForPart, initialData?.id, lineItems]);

    const [diagnosis, setDiagnosis] = useState(initialData?.workSummary || ""); // Diagnosis/Request details
    const [internalNotes, setInternalNotes] = useState(initialData?.internalNotes || "");
    const [customerNote, setCustomerNote] = useState(initialData?.customerNote || "");
    const [staffReply, setStaffReply] = useState("");
    const [isSendingStaffReply, setIsSendingStaffReply] = useState(false);
    const [showCustomerComments, setShowCustomerComments] = useState(false);
    const [userTouchedCustomerCommentsToggle, setUserTouchedCustomerCommentsToggle] = useState(false);
    const customerMessages = initialData?.customerMessages || [];
    const unreadCustomerMessageCount = customerMessages.filter((message: any) => !message.readAt).length;

    useEffect(() => {
        if (!userTouchedCustomerCommentsToggle && customerMessages.length > 0) {
            setShowCustomerComments(true);
        }
    }, [customerMessages.length, userTouchedCustomerCommentsToggle]);

    // --- 4. PHOTOS ---
    const [photos, setPhotos] = useState<any[]>(initialData?.photos || []);
    const [photoPostingOptOut, setPhotoPostingOptOut] = useState(Boolean(initialData?.photoPostingOptOut));
    const [isUpdatingPhotoPostingOptOut, setIsUpdatingPhotoPostingOptOut] = useState(false);
    const [newPhotoCategory, setNewPhotoCategory] = useState("FRONT");
    const [photoSettingsOpen, setPhotoSettingsOpen] = useState(false);
    const [photoSharingDefaults, setPhotoSharingDefaults] = useState<Record<string, PhotoSharingValues>>(photoSharingFallbacks);
    const primaryPhoto = photos[0];
    const primaryPhotoUrl = getRepairPhotoSrc(primaryPhoto);
    const [frontImageFailed, setFrontImageFailed] = useState(false);
    useEffect(() => {
        setFrontImageFailed(false);
    }, [primaryPhotoUrl]);
    const [isUploading, setIsUploading] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [isCapturing, setIsCapturing] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
    const [cameraInfo, setCameraInfo] = useState<string>('');
    const [expandedPhoto, setExpandedPhoto] = useState<any | null>(null);
    const [photoViewerZoom, setPhotoViewerZoom] = useState(1);
    const [photoViewerPan, setPhotoViewerPan] = useState({ x: 0, y: 0 });
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const photoFileInputRef = useRef<HTMLInputElement>(null);
    const photoViewerDragRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null);

    const resetPhotoViewer = useCallback(() => {
        setPhotoViewerZoom(1);
        setPhotoViewerPan({ x: 0, y: 0 });
    }, []);

    useEffect(() => {
        resetPhotoViewer();
    }, [expandedPhoto, resetPhotoViewer]);

    useEffect(() => {
        fetch("/api/photo-sharing-defaults")
            .then((response) => response.ok ? response.json() : null)
            .then((defaults) => {
                if (defaults && typeof defaults === "object") {
                    setPhotoSharingDefaults((current) => ({ ...current, ...defaults }));
                }
            })
            .catch(() => {
                // The typed fallback presets keep photo entry usable before the
                // settings table has been migrated in a local development DB.
            });
    }, []);

    // --- 5. MASTERS & OPTIONS ---
    const [brandOpts, setBrandOpts] = useState<any[]>([]);
    const [movementMakerOpts, setMovementMakerOpts] = useState<any[]>([]);
    const [modelOpts, setModelOpts] = useState<any[]>([]);
    const [refOpts, setRefOpts] = useState<any[]>([]);
    const [calOpts, setCalOpts] = useState<any[]>([]);
    const [masterCalOpts, setMasterCalOpts] = useState<any[]>([]);
    const [customerOpts, setCustomerOpts] = useState<any[]>([]);
    const [workOpts, setWorkOpts] = useState<any[]>([]);
    const [rawPricingRuleCandidates, setRawPricingRuleCandidates] = useState<any[]>([]);

    const handleCustomerTypeSelect = useCallback((nextType: Exclude<CustomerTypeSelection, null>) => {
        if (customerTypeSelection !== nextType) {
            setCustomerId(null);
            setCustomerName("");
            setCustomerOpts([]);
            setCustomerPhone("");
            setLineId("");
            setAddress("");
            setEndUserName("");
            setPartnerRef("");
        }
        setCustomerTypeSelection(nextType);
        setCustomerPrefix(nextType === "business" ? "" : "C");
    }, [customerTypeSelection]);
    const selectedCustomerTypeLabel = customerTypeSelection === "business"
        ? "業者（B2B）"
        : customerTypeSelection === "individual"
            ? "一般（B2C）"
            : "未選択";

    const getOptionIdByValue = useCallback((options: any[], value: string) => {
        const normalizedValue = value.trim();
        if (!normalizedValue) return null;
        return options.find((option) => option.value === normalizedValue || option.label === normalizedValue)?.id ?? null;
    }, []);

    const isValueInOptions = useCallback((value: string, options: any[]) => {
        const normalizedValue = value.trim();
        if (!normalizedValue) return true;
        return options.some((option) => option.value === normalizedValue || option.label === normalizedValue);
    }, []);

    const movementMakerId = useMemo(
        () => getOptionIdByValue(movementMakerOpts, movementMaker),
        [movementMakerOpts, getOptionIdByValue, movementMaker]
    );
    const selectedBrandId = useMemo(
        () => getOptionIdByValue(brandOpts, brand),
        [brand, brandOpts, getOptionIdByValue]
    );
    const selectedModelId = useMemo(
        () => getOptionIdByValue(modelOpts, model),
        [model, modelOpts, getOptionIdByValue]
    );
    const selectedWatchCaliberId = useMemo(
        () => getOptionIdByValue(calOpts, caliber),
        [caliber, calOpts, getOptionIdByValue]
    );
    const movementCaliberId = useMemo(
        () => getOptionIdByValue(masterCalOpts, movementCaliber),
        [masterCalOpts, getOptionIdByValue, movementCaliber]
    );
    const baseMovementMakerId = useMemo(
        () => getOptionIdByValue(movementMakerOpts, baseMovementMaker),
        [baseMovementMaker, movementMakerOpts, getOptionIdByValue]
    );
    const baseMovementCaliberId = useMemo(
        () => getOptionIdByValue(masterCalOpts, baseMovementCaliber),
        [baseMovementCaliber, masterCalOpts, getOptionIdByValue]
    );

    const filteredMovementCalOpts = useMemo(() => {
        if (!movementMakerId) return masterCalOpts;
        return masterCalOpts.filter((option) => option.brandId === movementMakerId);
    }, [masterCalOpts, movementMakerId]);

    const filteredBaseMovementCalOpts = useMemo(() => {
        if (!baseMovementMakerId) return masterCalOpts;
        return masterCalOpts.filter((option) => option.brandId === baseMovementMakerId);
    }, [baseMovementMakerId, masterCalOpts]);

    const handleMovementMakerChange = useCallback((nextMaker: string) => {
        setMovementMaker(nextMaker);
        const nextMakerId = getOptionIdByValue(movementMakerOpts, nextMaker);
        if (!nextMakerId || !movementCaliber) return;

        const nextCalOptions = masterCalOpts.filter((option) => option.brandId === nextMakerId);
        if (!isValueInOptions(movementCaliber, nextCalOptions)) {
            setMovementCaliber("");
        }
    }, [movementMakerOpts, getOptionIdByValue, isValueInOptions, masterCalOpts, movementCaliber]);

    const handleBaseMovementMakerChange = useCallback((nextMaker: string) => {
        setBaseMovementMaker(nextMaker);
        const nextMakerId = getOptionIdByValue(movementMakerOpts, nextMaker);
        if (!nextMakerId || !baseMovementCaliber) return;

        const nextCalOptions = masterCalOpts.filter((option) => option.brandId === nextMakerId);
        if (!isValueInOptions(baseMovementCaliber, nextCalOptions)) {
            setBaseMovementCaliber("");
        }
    }, [baseMovementCaliber, movementMakerOpts, getOptionIdByValue, isValueInOptions, masterCalOpts]);

    const handleWatchBrandChange = useCallback((nextBrand: string) => {
        setBrand(nextBrand);
        const nextBrandId = getOptionIdByValue(brandOpts, nextBrand);
        if (model && (!nextBrandId || !modelOpts.some((option) => option.brandId === nextBrandId && isValueInOptions(model, [option])))) {
            setModel("");
            setRefName("");
            setCaliber("");
        }
    }, [brandOpts, getOptionIdByValue, isValueInOptions, model, modelOpts]);

    // --- 6. DIALOGS ---
    const [quickRegOpen, setQuickRegOpen] = useState(false);
    const [mobileQR, setMobileQR] = useState(false);
    const canUseMobileQR = Boolean(initialData?.id);
    const [showPdfDialog, setShowPdfDialog] = useState(false);
    const [partSearchDialogOpen, setPartSearchDialogOpen] = useState(false);
    const [partSearchRowIdx, setPartSearchRowIdx] = useState<number | null>(null);
    const [searchSites, setSearchSites] = useState<SearchSite[]>(DEFAULT_PART_SEARCH_SITES);
    const [selectedSearchSiteId, setSelectedSearchSiteId] = useState<string | null>(DEFAULT_PART_SEARCH_SITES[0]?.id ?? null);

    // --- 7. STATUS BAR ---
    const [showHistory, setShowHistory] = useState(false);
    const [editingDateFor, setEditingDateFor] = useState<string | null>(null);

    // --- 8. TABS ---
    const [activeTab, setActiveTab] = useState<'main' | 'photo' | 'document' | 'line'>('main');

    // --- 9. PARTS PANEL ---
    const [partsPanelOpen, setPartsPanelOpen] = useState(false);
    const [partsPanelRowIdx, setPartsPanelRowIdx] = useState<number | null>(null);
    const [partsSearchQuery, setPartsSearchQuery] = useState('');
    const activePartsPanelLineItem = partsPanelRowIdx !== null ? lineItems[partsPanelRowIdx] : undefined;

    const partsPanelInitialKeyword = useMemo(() => {
        if (partsPanelRowIdx !== null) {
            return activePartsPanelLineItem?.name ?? "";
        }
        if (selectedPartNameOption) {
            return selectedPartNameOption.displayJa ?? selectedPartNameOption.nameJa;
        }
        return newItemName;
    }, [activePartsPanelLineItem?.name, newItemName, partsPanelRowIdx, selectedPartNameOption]);
    const partsPanelInitialPartNameEn = useMemo(() => {
        if (partsPanelRowIdx !== null) {
            return activePartsPanelLineItem?.partNameEn;
        }
        return selectedPartNameOption?.displayEn ?? selectedPartNameOption?.nameEn;
    }, [activePartsPanelLineItem?.partNameEn, partsPanelRowIdx, selectedPartNameOption]);
    const partsPanelTargetKey = partsPanelRowIdx !== null
        ? `line:${partsPanelRowIdx}:${activePartsPanelLineItem?.id ?? ""}:${activePartsPanelLineItem?.partsMasterId ?? ""}`
        : `new:${selectedPartInputType}:${selectedPartNameKey}`;
    const partsPanelStandardPartNameId = partsPanelRowIdx !== null
        ? activePartsPanelLineItem?.targetPartNameId ?? null
        : null;
    const partsPanelStandardPartNameKey = partsPanelRowIdx !== null
        ? null
        : selectedPartNameOption?.key ?? null;
    const partsPanelInitialPartType: "interior" | "exterior" =
        selectedPartInputType === "part_internal" ? "interior" : "exterior";
    const derivePartsSearchPartTypeFromLineItem = useCallback((item: LineItem | undefined): "interior" | "exterior" | undefined => {
        if (!item) return undefined;

        if (item.partType === "interior" || item.partType === "exterior") {
            return item.partType;
        }
        if (item.partType === "internal") return "interior";
        if (item.partType === "external") return "exterior";

        if (item.category === "internal" || item.category === "part_internal") return "interior";
        if (item.category === "external" || item.category === "part_external") return "exterior";

        return undefined;
    }, []);
    const existingLineInitialPartType = useMemo(
        () => derivePartsSearchPartTypeFromLineItem(activePartsPanelLineItem),
        [activePartsPanelLineItem, derivePartsSearchPartTypeFromLineItem]
    );
    const partsPanelEffectiveInitialPartType =
        partsPanelRowIdx !== null
            ? existingLineInitialPartType
            : isAddingPartItem
                ? partsPanelInitialPartType
                : undefined;

    const activePartSearchItem = partSearchRowIdx !== null ? lineItems[partSearchRowIdx] ?? null : null;
    const isInteriorPartSearchItem = activePartSearchItem
        ? activePartSearchItem.partType === 'interior'
            || activePartSearchItem.category === 'internal'
            || activePartSearchItem.category === 'part_internal'
        : false;
    const partSearchContexts = useMemo(() => {
        if (!isInteriorPartSearchItem) {
            return [{ brand, caliber }];
        }

        const contexts = [
            { brand: movementMaker, caliber: movementCaliber },
            { brand: baseMovementMaker, caliber: baseMovementCaliber },
        ].filter((context) => context.brand || context.caliber);

        return contexts.length > 0 ? contexts : [{ brand, caliber }];
    }, [isInteriorPartSearchItem, brand, caliber, movementMaker, movementCaliber, baseMovementMaker, baseMovementCaliber]);

    const japanesePartQueries = useMemo(() => {
        if (!activePartSearchItem) return [];
        return Array.from(new Set(partSearchContexts.flatMap((context) => buildJapanesePartQueries({
            brand: context.brand,
            watchRef: refName,
            caliber: context.caliber,
            partType: activePartSearchItem.partType,
            category: activePartSearchItem.category,
            partName: activePartSearchItem.name,
            partRef: activePartSearchItem.partRef,
        }))));
    }, [activePartSearchItem, partSearchContexts, refName]);
    const englishPartQueries = useMemo(() => {
        if (!activePartSearchItem) return [];
        return Array.from(new Set(partSearchContexts.flatMap((context) => buildEnglishPartQueries({
            brand: context.brand,
            watchRef: refName,
            caliber: context.caliber,
            partType: activePartSearchItem.partType,
            category: activePartSearchItem.category,
            partName: activePartSearchItem.name,
            partRef: activePartSearchItem.partRef,
        }))));
    }, [activePartSearchItem, partSearchContexts, refName]);

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
        customer: { name: customerName, type: customerTypeSelection, address, phone: customerPhone },
        endUserName,
        partnerRef,
        watch: { brand, model, ref: refName, serial, caliber, movementMaker, movementCaliber, baseMovementMaker, baseMovementCaliber },
        estimate: {
            items: lineItems.map(i => ({
                name: i.name,
                price: i.price,
                type: i.category.includes('part') ? 'part' : 'labor',
                grade: i.grade,
                note2: i.note2,
            }))
        },
        shippingFee,
        status
    };
    const warrantyDocumentUrl = initialData?.issuedWarranty
        ? `/documents/warranty/${initialData.issuedWarranty.id}`
        : null;

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(PART_SEARCH_SITES_STORAGE_KEY);
            if (!saved) return;
            const parsed = JSON.parse(saved);
            const normalized = normalizeSearchSites(parsed, []);
            if (normalized.length > 0) {
                setSearchSites(normalized);
                setSelectedSearchSiteId(normalized[0].id);
            }
        } catch {
            // Ignore invalid localStorage payloads and keep defaults.
        }
    }, []);

    useEffect(() => {
        window.localStorage.setItem(PART_SEARCH_SITES_STORAGE_KEY, JSON.stringify(searchSites));
        if (searchSites.length === 0) {
            setSelectedSearchSiteId(null);
            return;
        }
        if (!selectedSearchSiteId || !searchSites.some((site) => site.id === selectedSearchSiteId)) {
            setSelectedSearchSiteId(searchSites[0].id);
        }
    }, [searchSites, selectedSearchSiteId]);

    const handleOpenPartSearchDialog = useCallback((idx: number) => {
        setPartSearchRowIdx(idx);
        setPartSearchDialogOpen(true);
    }, []);

    const handleToggleSearchSite = useCallback((siteId: string, checked: boolean) => {
        setSearchSites((prev) => prev.map((site) => (
            site.id === siteId ? { ...site, enabled: checked } : site
        )));
    }, []);

    const handleAddSearchSite = useCallback(() => {
        const name = window.prompt("サイト名を入力してください");
        if (!name) return;
        const langInput = window.prompt("言語を入力してください（ja / en）", "ja");
        if (langInput !== "ja" && langInput !== "en") {
            toast({ title: "言語は ja か en を指定してください" });
            return;
        }
        const url = window.prompt("検索URLを入力してください（{query} を含めてください）");
        if (!url) return;
        if (!url.includes("{query}")) {
            toast({ title: "検索URLには {query} を含めてください" });
            return;
        }

        const nextSite: SearchSite = {
            id: `site-${Date.now()}`,
            name: name.trim(),
            lang: langInput,
            url: url.trim(),
            enabled: true,
        };

        setSearchSites((prev) => normalizeSearchSites([...prev, nextSite]));
        setSelectedSearchSiteId(nextSite.id);
    }, []);

    const handleDeleteSearchSite = useCallback(() => {
        if (!selectedSearchSiteId) return;
        const target = searchSites.find((site) => site.id === selectedSearchSiteId);
        if (!target) return;
        const confirmed = window.confirm(`「${target.name}」を削除しますか？`);
        if (!confirmed) return;
        setSearchSites((prev) => prev.filter((site) => site.id !== selectedSearchSiteId));
    }, [searchSites, selectedSearchSiteId]);

    const handleExecutePartSearch = useCallback(() => {
        const targets = searchSites.filter((site) => site.enabled);
        const urls = buildSearchUrls({
            sites: targets,
            japaneseQueries: japanesePartQueries,
            englishQueries: englishPartQueries,
        });

        if (urls.length === 0) {
            toast({ title: "検索できるサイトまたは検索語がありません" });
            return;
        }

        urls.forEach(({ url }) => {
            window.open(url, "_blank", "noopener,noreferrer");
        });
    }, [englishPartQueries, japanesePartQueries, searchSites]);

    const handleOpenPartsPanelFromSearch = useCallback(() => {
        if (partSearchRowIdx === null) return;
        setPartsPanelRowIdx(partSearchRowIdx);
        setPartsSearchQuery("");
        setPartsPanelOpen(true);
        setPartSearchDialogOpen(false);
    }, [partSearchRowIdx]);

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
        const toBrandOption = (b: any) => ({
            label: b.nameJp || b.name,
            value: b.name,
            id: b.id,
            searchKeys: [b.name, b.nameEn, b.nameJp, ...(b.aliases ?? []).map((alias: any) => alias.alias)].filter(Boolean),
        });
        getWatchBrands().then(d => setBrandOpts(d.map(toBrandOption)));
        getMovementMakers().then(d => setMovementMakerOpts(d.map(toBrandOption)));
        getCalibers().then(d => setMasterCalOpts(d.map((c: any) => ({ label: c.name, value: c.name, id: c.id, brandId: c.brandId ?? null }))));
    }, []);

    // --- LOOKUP CHAINS ---
    // 1. Brand -> Models
    useEffect(() => {
        if (!brand) return;
        const b = brandOpts.find(o => o.value === brand);
        if (b) getModels(b.id).then(d => setModelOpts(d.map((m: any) => ({ label: m.nameJp || m.name, value: m.name, id: m.id, brandId: m.brandId }))));
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
                if (b) getCalibersForModel(b.id, m.id).then(d => setCalOpts(d.map((c: any) => ({ label: c.name, value: c.name, id: c.id }))));
            }
        }
    }, [model, modelOpts, brand, brandOpts]);

    // 3. Ref -> Caliber Auto-fill
    useEffect(() => {
        const r = refOpts.find(o => o.value === refName);
        if (r && r.caliber) setCaliber(r.caliber);
    }, [refName, refOpts]);

    useEffect(() => {
        let cancelled = false;

        Promise.all([getRepairWorkCategories(), getRepairWorkActions(), getInternalPartNameMasters(true)])
            .then(([categories, actions, targetParts]) => {
                if (cancelled) return;
                setRepairWorkCategoryOptions(Array.isArray(categories) ? categories : []);
                setRepairWorkActionOptions(Array.isArray(actions) ? actions : []);
                setWorkTargetPartOptions(Array.isArray(targetParts) ? targetParts : []);
            })
            .catch((error) => {
                console.error("Failed to fetch repair work masters:", error);
                if (cancelled) return;
                setRepairWorkCategoryOptions([]);
                setRepairWorkActionOptions([]);
                setWorkTargetPartOptions([]);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    // 4. Intelligence Cache (Pricing Rules & Parts Master)
    useEffect(() => {
        const b = brandOpts.find(o => o.value === brand || o.label === brand);
        if (!b) {
            setWorkOpts([]);
            setRawPricingRuleCandidates([]);
            return;
        }

        if (isAddingLaborItem && !customerTypeSelection) {
            setWorkOpts([]);
            setRawPricingRuleCandidates([]);
            return;
        }

        const m = modelOpts.find(o => o.value === model || o.label === model);
        const c = calOpts.find(o => o.value === caliber || o.label === caliber);
        let cancelled = false;

        if (addItemCategory === 'internal') {
            setWorkOpts([]);
            setRawPricingRuleCandidates([]);
            const movementCaliberId = getOptionIdByValue(masterCalOpts, movementCaliber);
            const baseMovementCaliberId = getOptionIdByValue(masterCalOpts, baseMovementCaliber);
            const watchCaliberId = c?.id ?? null;
            const pricingCaliberIds = [movementCaliberId, baseMovementCaliberId, watchCaliberId]
                .filter((id): id is number => typeof id === 'number')
                .filter((id, index, ids) => ids.indexOf(id) === index);
            const pricingLookupOptions = {
                repairWorkCategoryId: newWorkCategoryId ? Number(newWorkCategoryId) : null,
                targetPartNameId: newTargetPartNameId || null,
                repairWorkActionId: newWorkActionId ? Number(newWorkActionId) : null,
                detailLabel: cleanOptionalText(newWorkDetailLabel),
                customerType: customerTypeSelection,
                expectedWorkName: [
                    cleanOptionalText(newTargetPartNameSnapshot) ?? cleanOptionalText(newWorkCategorySnapshot),
                    cleanOptionalText(newWorkActionSnapshot),
                    cleanOptionalText(newWorkDetailLabel),
                ].filter(Boolean).join(" ") || null,
            };

            // Fetch labor/work rules
            Promise.all([
                ...pricingCaliberIds.map((pricingCaliberId) => getPricingRules(b.id, m?.id, pricingCaliberId, pricingLookupOptions)),
                getPricingRules(b.id, m?.id, undefined, pricingLookupOptions),
            ]).then((ruleGroups) => {
                if (cancelled) return;
                const seenRuleIds = new Set<number>();
                const safeRules = ruleGroups.flatMap((rules, groupIndex) => {
                    const expectedCaliberId = groupIndex < pricingCaliberIds.length
                        ? pricingCaliberIds[groupIndex]
                        : null;

                    return (Array.isArray(rules) ? rules : []).filter((rule) => {
                        if (rule.caliberId !== expectedCaliberId) return false;
                        if (seenRuleIds.has(rule.id)) return false;
                        seenRuleIds.add(rule.id);
                        return true;
                    });
                });
                const filteredDisplayRules = filterPricingRuleCandidatesForDisplay(safeRules, pricingLookupOptions);
                const dedupedRules = collapseDuplicatePricingRuleCandidates(filteredDisplayRules, pricingLookupOptions);
                setRawPricingRuleCandidates(safeRules.map(r => ({
                    label: r.suggestedWorkName,
                    value: r.suggestedWorkName,
                    price: r.minPrice,
                    maxPrice: r.maxPrice,
                    pricingRuleId: r.id,
                    caliberId: r.caliberId,
                    customerType: r.customerType,
                    repairWorkCategoryId: r.repairWorkCategoryId,
                    targetPartNameId: r.targetPartNameId,
                    repairWorkActionId: r.repairWorkActionId,
                    detailLabel: r.detailLabel,
                })));

                setWorkOpts(dedupedRules.map(r => ({
                    label: r.suggestedWorkName,
                    value: r.suggestedWorkName,
                    price: r.minPrice,
                    maxPrice: r.maxPrice,
                    pricingRuleId: r.id,
                    caliberId: r.caliberId,
                    customerType: r.customerType,
                    repairWorkCategoryId: r.repairWorkCategoryId,
                    targetPartNameId: r.targetPartNameId,
                    repairWorkActionId: r.repairWorkActionId,
                    detailLabel: r.detailLabel,
                })));
            });
        } else if (addItemCategory === 'external_labor') {
            setWorkOpts([]);
            setRawPricingRuleCandidates([]);

            if (!customerTypeSelection || !newTargetPartNameId || !newWorkActionId) {
                return () => {
                    cancelled = true;
                };
            }

            const pricingLookupOptions = {
                repairWorkCategoryId: newWorkCategoryId ? Number(newWorkCategoryId) : null,
                targetPartNameId: newTargetPartNameId || null,
                repairWorkActionId: newWorkActionId ? Number(newWorkActionId) : null,
                detailLabel: cleanOptionalText(newWorkDetailLabel),
                customerType: customerTypeSelection,
                expectedWorkName: [
                    cleanOptionalText(newTargetPartNameSnapshot) ?? cleanOptionalText(newWorkCategorySnapshot),
                    cleanOptionalText(newWorkActionSnapshot),
                    cleanOptionalText(newWorkDetailLabel),
                ].filter(Boolean).join(" ") || null,
            };

            getExternalRepairPricingRules({
                customerType: customerTypeSelection,
                brandId: b.id,
                modelId: m?.id ?? null,
                targetPartNameId: newTargetPartNameId,
                repairWorkActionId: Number(newWorkActionId),
            }).then((rules) => {
                if (cancelled) return;
                const safeRules = Array.isArray(rules) ? rules : [];
                const filteredDisplayRules = filterPricingRuleCandidatesForDisplay(safeRules, pricingLookupOptions);
                const dedupedRules = collapseDuplicatePricingRuleCandidates(filteredDisplayRules, pricingLookupOptions);
                const toWorkOption = (r: any) => ({
                    label: r.suggestedWorkName,
                    value: r.suggestedWorkName,
                    price: r.minPrice,
                    maxPrice: r.maxPrice,
                    pricingRuleId: r.id,
                    caliberId: r.caliberId,
                    customerType: r.customerType,
                    repairWorkCategoryId: r.repairWorkCategoryId,
                    targetPartNameId: r.targetPartNameId,
                    repairWorkActionId: r.repairWorkActionId,
                    detailLabel: r.detailLabel,
                });
                setRawPricingRuleCandidates(safeRules.map(toWorkOption));
                setWorkOpts(dedupedRules.map(toWorkOption));
            });
        } else {
            setRawPricingRuleCandidates([]);
            // Fetch parts master data
                getPartsMatched(
                    b.id,
                    m?.id,
                    c?.id,
                    undefined,
                    movementMakerOpts.find(o => o.value === movementMaker || o.label === movementMaker)?.id,
                    masterCalOpts.find(o => o.value === movementCaliber || o.label === movementCaliber)?.id,
                    movementMakerOpts.find(o => o.value === baseMovementMaker || o.label === baseMovementMaker)?.id,
                    masterCalOpts.find(o => o.value === baseMovementCaliber || o.label === baseMovementCaliber)?.id,
                    newItemName
                ).then(parts => {
                    if (cancelled) return;
                    setWorkOpts(parts.map(p => ({
                        label: p.nameJp || p.name,
                        value: p.nameJp || p.name,
                        name: p.nameJp || p.name,
                        price: p.retailPrice,
                        cost: p.latestCostYen,
                        partsMasterId: p.id,
                        partId: p.id,
                        grade: p.grade || undefined,
                        note1: p.notes1 || undefined,
                        note2: p.notes2 || undefined,
                        partRef: p.partRefs || undefined,
                        partRefs: p.partRefs || undefined,
                        cousinsNumber: p.cousinsNumber || undefined,
                        stockQuantity: p.stockQuantity ?? 0,
                        supplierName: (p as any).supplier?.name || undefined,
                        partType: p.partType || undefined,
                        inlineTag: p.grade || undefined,
                        meta: [
                            `ID: ${p.id}`,
                            p.partRefs ? `Ref: ${p.partRefs}` : null,
                            p.cousinsNumber ? `Cousins: ${p.cousinsNumber}` : null,
                        ].filter(Boolean).join(' / '),
                        notes: [p.notes1, p.notes2].filter(Boolean).join(' / ') || undefined,
                    })));
                    console.log(`Fetched ${parts.length} matching parts for brand ${b.id}`);
                });
            }

        return () => {
            cancelled = true;
        };
    }, [brand, model, caliber, movementMaker, movementCaliber, baseMovementMaker, baseMovementCaliber, brandOpts, movementMakerOpts, modelOpts, calOpts, masterCalOpts, addItemCategory, isAddingLaborItem, newItemName, newWorkCategoryId, newTargetPartNameId, newWorkActionId, newWorkDetailLabel, newWorkCategorySnapshot, newTargetPartNameSnapshot, newWorkActionSnapshot, customerTypeSelection, getOptionIdByValue, cleanOptionalText]);

    useEffect(() => {
        if (!isAddingLaborItem) return;
        if (!customerTypeSelection) return;
        if (addItemCategory === 'internal' && !newWorkCategoryId) return;
        if (!newTargetPartNameId || !newWorkActionId) return;
        if (selectedWorkOption) return;
        if (newItemPriceManuallyEdited) return;
        if (newItemPrice && autoFilledPricingRuleIdRef.current == null) return;

        const detailLabel = cleanOptionalText(newWorkDetailLabel);
        const customerType = customerTypeSelection;
        const matchesStructure = (rule: any) => {
            if (addItemCategory === 'internal' && Number(rule.repairWorkCategoryId) !== Number(newWorkCategoryId)) return false;
            if (rule.targetPartNameId !== newTargetPartNameId) return false;
            if (Number(rule.repairWorkActionId) !== Number(newWorkActionId)) return false;
            if (detailLabel && cleanOptionalText(rule.detailLabel) !== detailLabel) return false;
            return normalizePricingCandidateCustomerType(rule.customerType) === customerType;
        };

        const structuralMatches = rawPricingRuleCandidates.filter(matchesStructure);
        const exactCustomerMatches = structuralMatches.filter((rule) => normalizePricingCandidateCustomerType(rule.customerType) === customerType);
        const highConfidenceMatches = exactCustomerMatches;
        const dedupedHighConfidenceMatches = dedupePricingRuleCandidatesForAutoFill(highConfidenceMatches);

        if (dedupedHighConfidenceMatches.length !== 1) return;

        const match = dedupedHighConfidenceMatches[0];
        if (match.price === undefined) return;

        setNewItemPrice(String(match.price));
        autoFilledPricingRuleIdRef.current = match.pricingRuleId ?? null;
    }, [
        addItemCategory,
        isAddingLaborItem,
        newWorkCategoryId,
        newTargetPartNameId,
        newWorkActionId,
        newWorkDetailLabel,
        customerTypeSelection,
        rawPricingRuleCandidates,
        selectedWorkOption,
        newItemPrice,
        newItemPriceManuallyEdited,
        cleanOptionalText,
    ]);

    useEffect(() => {
        if (!newWorkActionId) return;
        const selectedActionVisible = visibleRepairWorkActionOptions.some((option) => String(option.id) === newWorkActionId);
        if (selectedActionVisible) return;
        setNewWorkActionId("");
        setNewWorkActionSnapshot("");
    }, [newWorkActionId, visibleRepairWorkActionOptions]);

    // --- CALCULATIONS ---
    const totalAmount = lineItems.reduce((sum, i) => sum + i.price * (i.quantity || 1), 0);
    const taxAmount = Math.floor(totalAmount * 0.1);
    const grandTotal = totalAmount + taxAmount;

    useEffect(() => {
        if (!canApplyPartsOrderStatus(status)) return;

        const nextStatus = getRepairStatusFromActiveOrderStatuses(
            orderList.map(order => order.status)
        );

        if (nextStatus && status !== nextStatus) {
            setStatus(nextStatus);
        }
    }, [orderList, status]);

    // --- ACTIONS ---
    const handleSave = async () => {
        if (isReadOnly) return;
        if (!customerTypeSelection) {
            alert("顧客種別（業者/B2B または 一般/B2C）を選択してください。");
            return;
        }
        if (!brand || !customerName) {
            alert("「ブランド」と「顧客名」は必須です。");
            return;
        }
        setIsSaving(true);
        try {
            const hasEstimateItems = lineItems.length > 0;
            const nextStatus = getRepairStatusForSave(persistedStatus, status, hasEstimateItems);
            const nextStatusLog = { ...statusLog };
            if (hasEstimateItems && (nextStatus === "見積中" || status === "見積中")) {
                if (!nextStatusLog["受付"]) {
                    nextStatusLog["受付"] = initialData?.createdAt
                        ? new Date(initialData.createdAt).toLocaleDateString('ja-JP')
                        : new Date().toLocaleDateString('ja-JP');
                }
                if (!nextStatusLog["見積中"]) {
                    nextStatusLog["見積中"] = new Date().toLocaleDateString('ja-JP');
                }
            }

            const payload = {
                customer: {
                    id: customerId,
                    name: customerName,
                    companyName: isB2B ? customerName : undefined,
                    type: customerTypeSelection,
                    phone: customerPhone,
                    lineId: lineId,
                    address: address,
                    prefix: isB2B ? (customerPrefix || undefined) : 'C',
                },
                watch: {
                    brand,
                    model,
                    ref: refName,
                    serial,
                    caliber,
                    movementMaker,
                    movementCaliber,
                    baseMovementMaker,
                    baseMovementCaliber,
                },
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
                        partType: i.partType ?? null,
                        name: i.name,
                        price: i.price,
                        cost: i.cost ?? null,
                        notes: i.spec,
                        grade: i.grade ?? null,
                        note1: i.note1 ?? null,
                        note2: i.note2 ?? null,
                        partRef: i.partRef ?? null,
                        cousinsNumber: i.cousinsNumber ?? null,
                        stockQuantity: i.stockQuantity ?? null,
                        partsMasterId: i.partsMasterId ?? null,
                        quantity: i.quantity ?? 1,
                        repairWorkCategoryId: i.category.includes('part') ? null : i.repairWorkCategoryId ?? null,
                        repairWorkActionId: i.category.includes('part') ? null : i.repairWorkActionId ?? null,
                        targetPartNameId: i.category.includes('part') ? null : i.targetPartNameId ?? null,
                        sourceAreaSnapshot: i.sourceAreaSnapshot ?? null,
                        b2cDisplayNameSnapshot: i.b2cDisplayNameSnapshot ?? null,
                        detailLabelSnapshot: i.detailLabelSnapshot ?? null,
                        categoryNameSnapshot: i.categoryNameSnapshot ?? null,
                        targetPartNameSnapshot: i.targetPartNameSnapshot ?? null,
                        actionNameSnapshot: i.actionNameSnapshot ?? null,
                    }))
                },
                status: nextStatus,
                statusLog: nextStatusLog,
                photoPostingOptOut,
                photos
            };

            const url = mode !== 'create' ? `/api/repairs/${initialData.id}` : "/api/repairs";
            const res = await fetch(url, {
                method: mode !== 'create' ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Save failed");

            // 在庫警告があればダイアログ表示
            if (json.stockWarnings && json.stockWarnings.length > 0) {
                setStockWarnings(json.stockWarnings);
            }

            // Redirect or Notify
            if (mode === 'create') {
                router.push(`/repairs/${json.repair.id}`);
            } else {
                const savedStatus = typeof json.repair?.status === "string" ? json.repair.status : nextStatus;
                setStatus(savedStatus);
                setPersistedStatus(savedStatus);
                setStatusLog(prev => ({ ...prev, ...nextStatusLog }));
                if (mode === 'view') setIsEditingEnabled(false);
                router.refresh();
            }

        } catch (e) {
            console.error(e);
            alert(e instanceof Error ? `保存に失敗しました: ${e.message}` : "保存に失敗しました。");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreatePublicCaseDraft = async () => {
        if (!initialData?.id) return;

        setIsCreatingPublicCase(true);
        try {
            const response = await fetch(`/api/repairs/${initialData.id}/public-case`, {
                method: "POST",
            });
            const json = await response.json();
            if (!response.ok) {
                throw new Error(json.error || "事例下書きの作成に失敗しました。");
            }

            toast({
                title: json.created ? "下書きを作成しました" : "既存の下書きがあります",
                description: `PublicCase ID: ${json.publicCaseId}`,
            });
            router.push(`/public-cases/${json.publicCaseId}`);
        } catch (error) {
            console.error(error);
            toast({
                title: "事例下書きを作成できませんでした",
                description: error instanceof Error ? error.message : undefined,
                variant: "destructive",
            });
        } finally {
            setIsCreatingPublicCase(false);
        }
    };

    const handleStaffReply = async () => {
        if (!initialData?.id) {
            toast({ title: "案件保存後に返信できます。" });
            return;
        }

        const body = staffReply.trim();
        if (!body) {
            toast({ title: "返信内容を入力してください。" });
            return;
        }

        setIsSendingStaffReply(true);
        try {
            const res = await fetch(`/api/repairs/${initialData.id}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json.error || "返信送信に失敗しました。");
            }

            setStaffReply("");
            toast({
                title: json.notification?.sent
                    ? "返信を送信しました"
                    : "返信を保存しました",
                description: json.notification?.sent
                    ? "LINEで共有ページへの通知を送信しました。"
                    : "LINE通知は未送信です。共有ページには表示されます。",
            });
            router.refresh();
        } catch (error) {
            console.error(error);
            toast({
                title: "返信送信に失敗しました",
                description: error instanceof Error ? error.message : undefined,
            });
        } finally {
            setIsSendingStaffReply(false);
        }
    };

    const uploadPhotoFile = async (file: File) => {
        setIsUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            if (initialData?.id) fd.append("repairId", initialData.id);
            fd.append("category", newPhotoCategory);
            const captureStage = repairPhotoStageFromStatus(status);
            if (captureStage) fd.append("stage", captureStage);

            const res = await fetch("/api/upload", { method: "POST", body: fd });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(data.error || `画像アップロードに失敗しました (HTTP ${res.status})`);
            }
            const savedPhoto = data.photo ?? {
                storageKey: data.storageKey,
                fileName: data.fileName,
                mimeType: data.mimeType,
                stage: captureStage,
                category: newPhotoCategory,
                ...(photoSharingDefaults[newPhotoCategory] ?? photoSharingFallbacks.OTHER),
            };
            setPhotos(prev => [...prev, savedPhoto]);
            return savedPhoto;
        } catch (error) {
            console.error("Repair photo upload failed", error);
            throw error;
        } finally {
            setIsUploading(false);
        }
    };

    const updatePhoto = async (index: number, changes: Record<string, unknown>) => {
        const current = photos[index];
        if (!current) return;
        const next = { ...current, ...changes };
        if (photoPostingOptOut) {
            next.publicCaseVisible = false;
            next.snsVisible = false;
        }
        setPhotos((items) => items.map((photo, photoIndex) => photoIndex === index ? next : photo));

        if (!initialData?.id || !Number.isInteger(Number(current.id))) return;
        try {
            const response = await fetch(`/api/repairs/${initialData.id}/photos`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ photoId: current.id, ...next }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || "写真設定を保存できませんでした。");
            setPhotos((items) => items.map((photo, photoIndex) => photoIndex === index
                ? { ...next, ...result.sharing }
                : photo));
        } catch (error) {
            console.error(error);
            toast({ title: "写真設定の保存に失敗しました", variant: "destructive" });
        }
    };

    const applyPhotoCategory = (index: number, category: string) => {
        void updatePhoto(index, { category });
    };

    const deletePhoto = async (index: number) => {
        const photo = photos[index];
        if (!photo || isReadOnly) return;
        if (!initialData?.id || !Number.isInteger(Number(photo.id))) {
            setPhotos((items) => items.filter((_, photoIndex) => photoIndex !== index));
            return;
        }
        try {
            const response = await fetch(`/api/repairs/${initialData.id}/photos`, {
                method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoId: photo.id }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) throw new Error(result.error || "写真を削除できませんでした。");
            setPhotos((items) => items.filter((_, photoIndex) => photoIndex !== index));
        } catch (error) {
            console.error(error);
            toast({ title: "写真の削除に失敗しました", variant: "destructive" });
        }
    };

    const updatePhotoPostingOptOut = async (nextPhotoPostingOptOut: boolean) => {
        if (!initialData?.id || isReadOnly || isUpdatingPhotoPostingOptOut) return;

        setIsUpdatingPhotoPostingOptOut(true);
        try {
            const response = await fetch(`/api/repairs/${initialData.id}/photo-posting-opt-out`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ photoPostingOptOut: nextPhotoPostingOptOut }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
                throw new Error(result.error || "写真の掲載設定を保存できませんでした。");
            }

            setPhotoPostingOptOut(nextPhotoPostingOptOut);
            if (nextPhotoPostingOptOut) {
                setPhotos((items) => items.map((photo) => ({
                    ...photo,
                    publicCaseVisible: false,
                    snsVisible: false,
                })));
            }
            toast({ title: nextPhotoPostingOptOut ? "写真の事例・SNS掲載を拒否に設定しました" : "写真の事例・SNS掲載を許可に戻しました" });
        } catch (error) {
            console.error(error);
            toast({ title: "写真の掲載設定の保存に失敗しました", variant: "destructive" });
        } finally {
            setIsUpdatingPhotoPostingOptOut(false);
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isReadOnly) return;
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await uploadPhotoFile(file);
        } catch (error) {
            alert(error instanceof Error ? error.message : "画像アップロードエラー");
        }
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
        setCameraInfo('');
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
                video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 3840 },
                    height: { ideal: 2160 },
                    aspectRatio: { ideal: 16 / 9 },
                    frameRate: { ideal: 30 },
                },
                audio: false
            });
            mediaStreamRef.current = stream;
            const settings = stream.getVideoTracks()[0]?.getSettings();
            if (settings) {
                setCameraInfo(`入力: ${settings.width ?? "?"} × ${settings.height ?? "?"} / 比率 ${settings.aspectRatio ?? "?"} / ${settings.frameRate ?? "?"} fps / deviceId: ${settings.deviceId ?? "?"}`);
            }

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
        if (!video.videoWidth || !video.videoHeight) {
            setCameraError("カメラ映像の解像度を取得できませんでした。");
            return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext("2d");
        if (!context) {
            setCameraError("撮影画像の生成に失敗しました。");
            return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        setCapturedPreview(canvas.toDataURL("image/jpeg", 0.92));
        setCameraInfo((current) => `${current} / 保存: ${canvas.width} × ${canvas.height}px (JPEG 92%)`);
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
            setCameraError(error instanceof Error ? error.message : "撮影画像の保存に失敗しました。");
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
                    {mode !== 'create' && initialData?.publicCaseId ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/public-cases/${initialData.publicCaseId}`)}
                            className="h-9 px-4 font-bold"
                        >
                            事例下書きを確認
                        </Button>
                    ) : mode !== 'create' && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleCreatePublicCaseDraft}
                            disabled={isCreatingPublicCase}
                            className="h-9 px-4 font-bold"
                        >
                            {isCreatingPublicCase ? "下書き作成中..." : "事例下書きを作成"}
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
                            type="button"
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
                        const displayDate = status === "送付待ち" && step.id === "受付"
                            ? undefined
                            : statusLog[step.id];
                        const hasDate = !!displayDate;
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
                                            if (status === "送付待ち" && step.id !== "受付") return;
                                            if (step.id === "送付待ち" && status !== "受付") return;
                                            const isShippingReceptionTransition = status === "送付待ち" && step.id === "受付";
                                            const isReceptionShippingTransition = status === "受付" && step.id === "送付待ち";
                                            setStatus(step.id);
                                            if (isShippingReceptionTransition || isReceptionShippingTransition) {
                                                setStatusLog(prev => ({
                                                    ...prev,
                                                    [step.id]: new Date().toLocaleDateString('ja-JP')
                                                }));
                                            } else if (!statusLog[step.id]) {
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
                                                defaultValue={toInputDate(displayDate || '')}
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
                                                {displayDate || "―"}
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

            {initialData?.id && (
                <div className="bg-white border-b border-zinc-200 px-4 py-2">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-bold text-zinc-700">共有ページコメント</span>
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                                {customerMessages.length}件
                            </span>
                            {unreadCustomerMessageCount > 0 && (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                    未読 {unreadCustomerMessageCount}件
                                </span>
                            )}
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => {
                                setUserTouchedCustomerCommentsToggle(true);
                                setShowCustomerComments((open) => !open);
                            }}
                        >
                            {showCustomerComments ? "閉じる" : "開く"}
                            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", showCustomerComments && "rotate-180")} />
                        </Button>
                    </div>
                    {showCustomerComments && (
                        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                            {customerMessages.length > 0 ? (
                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                    {customerMessages.map((message: any) => (
                                        <div
                                            key={message.id}
                                            className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-sm"
                                        >
                                            <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                                                <span className="font-bold text-zinc-600">共有ページコメント</span>
                                                <span>{new Date(message.createdAt).toLocaleString('ja-JP')}</span>
                                                {!message.readAt && <span className="font-bold text-blue-600">未読</span>}
                                            </div>
                                            <div className="mt-1 whitespace-pre-wrap text-zinc-700">{message.body}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded border border-zinc-100 bg-white px-3 py-2 text-sm text-zinc-500">
                                    共有ページからのコメントはまだありません。
                                </div>
                            )}
                            <div className="mt-3 flex gap-2">
                                <Textarea
                                    value={staffReply}
                                    onChange={(event) => setStaffReply(event.target.value.slice(0, 500))}
                                    placeholder="共有ページへ返信する内容を入力..."
                                    className="min-h-16 text-sm"
                                    maxLength={500}
                                />
                                <Button
                                    type="button"
                                    onClick={handleStaffReply}
                                    disabled={isSendingStaffReply || !staffReply.trim()}
                                    className="h-auto shrink-0 bg-blue-600 hover:bg-blue-700"
                                >
                                    返信する
                                </Button>
                            </div>
                            <div className="mt-1 text-right text-xs text-zinc-400">{staffReply.length}/500</div>
                        </div>
                    )}
                </div>
            )}

            {/* --- TAB NAV --- */}
            <div className="bg-white border-b border-zinc-200 flex shrink-0">
                {([
                    { id: 'main',     label: 'メイン' },
                    { id: 'photo',    label: '写真' },
                    { id: 'document', label: '書類' },
                    ...(initialData?.id ? [{ id: 'line', label: 'LINE' } as const] : []),
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
                <div className="grid gap-3 p-3 xl:grid-cols-[minmax(360px,0.85fr)_minmax(640px,1.4fr)]">

                    {/* 左カラム：案件確認情報 */}
                    <div className="space-y-3">

                        {/* ①顧客情報 */}
                        <Card className="p-3 shadow-sm border-t-4 border-t-zinc-500 bg-white">
                            <div className="flex flex-col gap-3 mb-3">
                                <h3 className="text-sm font-bold flex items-center gap-1.5 text-zinc-700 uppercase tracking-wider">
                                    <User className="w-3.5 h-3.5" /> 顧客情報
                                </h3>
                                <div className={cn(
                                    "rounded-md border p-2",
                                    customerTypeSelection ? "border-zinc-200 bg-zinc-50" : "border-amber-300 bg-amber-50"
                                )}>
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm font-bold text-zinc-700">
                                            現在の顧客種別：{selectedCustomerTypeLabel}
                                        </span>
                                        {!customerTypeSelection && (
                                            <span className="text-xs font-semibold text-amber-700">
                                                顧客種別を選択してください
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleCustomerTypeSelect("business")}
                                            aria-pressed={customerTypeSelection === "business"}
                                            className={cn(
                                                "h-10 rounded-md border px-3 text-sm font-bold transition-colors",
                                                customerTypeSelection === "business"
                                                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                                                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-blue-50"
                                            )}
                                        >
                                            業者（B2B）
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleCustomerTypeSelect("individual")}
                                            aria-pressed={customerTypeSelection === "individual"}
                                            className={cn(
                                                "h-10 rounded-md border px-3 text-sm font-bold transition-colors",
                                                customerTypeSelection === "individual"
                                                    ? "border-green-600 bg-green-600 text-white shadow-sm"
                                                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-green-50"
                                            )}
                                        >
                                            一般（B2C）
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="grid gap-2 md:grid-cols-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold text-zinc-500">顧客</Label>
                                    <div className="flex gap-1">
                                        <AdvancedCombobox
                                            placeholder="名前検索 / 新規入力..."
                                            value={customerName}
                                            onChange={(value) => {
                                                if (!customerTypeSelection) return;
                                                setCustomerName(value);
                                                setCustomerId(null);
                                            }}
                                            onSearchChange={async (s) => {
                                                if (!customerTypeSelection) {
                                                    setCustomerOpts([]);
                                                    return;
                                                }
                                                const res = await getCustomers(s);
                                                setCustomerOpts(res.filter((c) => normalizeCustomerTypeSelection(c.type) === customerTypeSelection).map(c => ({
                                                    id: c.id,
                                                    label: c.name,
                                                    value: c.name,
                                                    sub: c.phone || "No phone",
                                                    type: c.type,
                                                    prefix: c.prefix,
                                                    phone: c.phone,
                                                    lineId: c.lineId,
                                                    address: c.address,
                                                })));
                                            }}
                                            onSelectOption={(option) => {
                                                const optionCustomerType = normalizeCustomerTypeSelection(option.type);
                                                if (!customerTypeSelection || optionCustomerType !== customerTypeSelection) {
                                                    alert("選択中の顧客種別と一致する顧客候補を選択してください。");
                                                    return;
                                                }
                                                setCustomerId(option.id ?? null);
                                                setCustomerName(option.value);
                                                setCustomerPrefix(optionCustomerType === 'business' ? (option.prefix || "") : "C");
                                                setCustomerPhone(option.phone || "");
                                                setLineId(option.lineId || "");
                                                setAddress(option.address || "");
                                            }}
                                            options={customerOpts}
                                            disabled={!customerTypeSelection}
                                        />
                                        <Button
                                            size="icon"
                                            variant="outline"
                                            className="h-8 w-8 shrink-0"
                                            onClick={() => {
                                                if (!customerTypeSelection) {
                                                    alert("顧客種別（業者/B2B または 一般/B2C）を先に選択してください。");
                                                    return;
                                                }
                                                setQuickRegOpen(true);
                                            }}
                                            disabled={!customerTypeSelection}
                                        >
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                                {isB2B && (
                                    <>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-semibold text-zinc-500">エンドユーザー</Label>
                                            <Input className="h-8 text-sm" value={endUserName} onChange={e => setEndUserName(e.target.value)} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs font-semibold text-zinc-500">管理番号</Label>
                                            <Input className="h-8 text-sm font-mono" value={partnerRef} onChange={e => setPartnerRef(e.target.value)} />
                                        </div>
                                    </>
                                )}
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold text-zinc-500">LINE ID</Label>
                                    <Input className="h-8 text-sm" value={lineId} onChange={e => setLineId(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold text-zinc-500">TEL</Label>
                                    <Input className="h-8 text-sm" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                                </div>
                                <FormRow label="住所" className="md:col-span-3">
                                    <Input className="h-8 text-sm" value={address} onChange={e => setAddress(e.target.value)} />
                                </FormRow>
                            </div>
                        </Card>

                        {/* ②時計情報 */}
                        <Card className="p-3 shadow-sm border-t-4 border-t-blue-600 bg-white">
                            <h3 className="text-xs font-bold flex items-center gap-1.5 text-zinc-700 uppercase tracking-wider mb-2">
                                <Watch className="w-3.5 h-3.5" /> 時計情報
                            </h3>
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
                                <div className="space-y-2">
                                    <FormRow label="ブランド">
                                        <AdvancedCombobox value={brand} onChange={handleWatchBrandChange} options={brandOpts} placeholder="ブランド名..." requireSelection />
                                    </FormRow>
                                    <FormRow label="モデル">
                                        <AdvancedCombobox value={model} onChange={setModel} options={modelOpts} placeholder="モデル名..." />
                                    </FormRow>
                                    <FormRow label="Ref">
                                        <AdvancedCombobox value={refName} onChange={setRefName} options={refOpts} placeholder="Ref.No..." />
                                    </FormRow>
                                    <div className="grid gap-2 rounded-md border border-zinc-200 bg-zinc-50/70 p-2 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <div className="text-xs font-bold text-zinc-700">Cal</div>
                                            {isReadOnly ? (
                                                <div className="space-y-1 text-sm">
                                                    <div className="grid grid-cols-[72px_1fr] gap-2">
                                                        <span className="text-xs font-semibold text-zinc-500">メーカー</span>
                                                        <span className="font-medium text-zinc-800">{displayValueOrDash(displayCalMaker)}</span>
                                                    </div>
                                                    <div className="grid grid-cols-[72px_1fr] gap-2">
                                                        <span className="text-xs font-semibold text-zinc-500">Cal</span>
                                                        <span className="font-medium text-zinc-800">{displayValueOrDash(displayCalName)}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-1">
                                                    <FormRow label="メーカー">
                                                        <AdvancedCombobox value={movementMaker} onChange={handleMovementMakerChange} options={movementMakerOpts} placeholder="OMEGA / ETA..." requireSelection />
                                                    </FormRow>
                                                    <FormRow label="Cal">
                                                        <AdvancedCombobox value={movementCaliber} onChange={setMovementCaliber} options={filteredMovementCalOpts} placeholder="1120..." />
                                                    </FormRow>
                                                    {movementMakerId && filteredMovementCalOpts.length === 0 ? (
                                                        <p className="pl-[72px] text-[11px] text-zinc-500">このメーカーのCal候補は未登録です。</p>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-xs font-bold text-zinc-700">Base Cal</div>
                                            {isReadOnly ? (
                                                <div className="space-y-1 text-sm">
                                                    <div className="grid grid-cols-[72px_1fr] gap-2">
                                                        <span className="text-xs font-semibold text-zinc-500">メーカー</span>
                                                        <span className="font-medium text-zinc-800">{displayValueOrDash(baseMovementMaker)}</span>
                                                    </div>
                                                    <div className="grid grid-cols-[72px_1fr] gap-2">
                                                        <span className="text-xs font-semibold text-zinc-500">Cal</span>
                                                        <span className="font-medium text-zinc-800">{displayValueOrDash(baseMovementCaliber)}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-1">
                                                    <FormRow label="メーカー">
                                                        <AdvancedCombobox value={baseMovementMaker} onChange={handleBaseMovementMakerChange} options={movementMakerOpts} placeholder="ETA..." requireSelection />
                                                    </FormRow>
                                                    <FormRow label="Cal">
                                                        <AdvancedCombobox value={baseMovementCaliber} onChange={setBaseMovementCaliber} options={filteredBaseMovementCalOpts} placeholder="2892.A2..." />
                                                    </FormRow>
                                                    {baseMovementMakerId && filteredBaseMovementCalOpts.length === 0 ? (
                                                        <p className="pl-[72px] text-[11px] text-zinc-500">このメーカーのCal候補は未登録です。</p>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <FormRow label="シリアル">
                                        <Input className="h-8 text-sm font-mono" value={serial} onChange={e => setSerial(e.target.value)} placeholder="X123456" />
                                    </FormRow>
                                    <FormRow label="付属品">
                                        <Input className="h-8 text-sm" value={accessories} onChange={e => setAccessories(e.target.value)} placeholder="箱、保証書等..." />
                                    </FormRow>
                                </div>
                                <div className="lg:pt-1">
                                    <div className="mb-1 text-xs font-semibold text-zinc-500">正面写真</div>
                                    {primaryPhotoUrl && !frontImageFailed ? (
                                        <div className="flex h-96 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 p-2">
                                            <img
                                                src={primaryPhotoUrl}
                                                alt="時計正面写真"
                                                className="h-full w-full rounded object-contain"
                                                onError={() => setFrontImageFailed(true)}
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 text-xs font-medium text-zinc-400">
                                            正面写真なし
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>

                        {/* ③依頼内容・社内メモ・連絡事項 */}
                        <Card className="p-3 shadow-sm bg-white flex flex-col gap-2">
                            <FormRow label="依頼内容" className="sm:items-start">
                                <Textarea className="min-h-[64px] text-sm resize-none bg-yellow-50/50" value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
                            </FormRow>
                            <FormRow label="社内メモ" className="sm:items-start">
                                <Textarea className="min-h-[52px] text-sm resize-none bg-zinc-50" value={internalNotes} onChange={e => setInternalNotes(e.target.value)} />
                            </FormRow>
                            <FormRow label="お客様連絡" className="sm:items-start">
                                <Textarea className="min-h-[52px] text-sm resize-none bg-blue-50/40 border-blue-200" value={customerNote} onChange={e => setCustomerNote(e.target.value)} placeholder="お客様へお伝えする事項を入力（見積書のご連絡事項欄に印字されます）" />
                            </FormRow>
                        </Card>
                    </div>

                    {/* 右カラム：作業判断・明細入力 */}
                    <div className="space-y-3">
                        <div className="grid gap-3">

                        {/* ④見積・修理明細テーブル */}
                        <Card className="p-0 shadow-sm border-t-4 border-t-emerald-600 bg-white flex flex-col overflow-visible">
                            <div className="p-2 border-b bg-zinc-50 flex justify-between items-center">
                                <h3 className="text-sm font-bold flex items-center gap-1.5 text-zinc-700 uppercase">
                                    <Settings className="w-3.5 h-3.5" /> 見積・修理明細
                                </h3>
                                <span className="bg-red-100 text-red-600 px-2 py-1 rounded font-bold text-xs">合計: ¥{grandTotal.toLocaleString()}</span>
                            </div>
                            <div className="overflow-visible p-2 space-y-2">
                                {/* ヘッダー */}
                                <div className="grid grid-cols-12 text-xs text-zinc-500 font-bold border-b pb-1 px-1">
                                    <div className="col-span-6">項目 / 部品</div>
                                    <div className="col-span-1 text-right">仕入値</div>
                                    <div className="col-span-2 text-right">上代（税抜）</div>
                                    <div className="col-span-1 text-center">個数</div>
                                    <div className="col-span-1 text-center">🔍</div>
                                    <div className="col-span-1 text-right">操作</div>
                                </div>
                                {/* 明細行 */}
                                {lineItems.map((item, idx) => {
                                    const isPartItem = item.category.includes('part');
                                    const itemCategoryLabel = item.category === 'external_labor'
                                        ? '外装修理技術料'
                                        : isPartItem
                                            ? '交換部品'
                                            : '技術料';
                                    const isSearchablePartItem = ((item as { type?: 'labor' | 'part' }).type ?? (isPartItem ? 'part' : 'labor')) === 'part';
                                    const statusLabel = isPartItem ? getStatusLabelForLineItem(item, idx) : null;
                                    return (
                                    <div key={item.id} className="grid grid-cols-12 items-center text-sm p-2 hover:bg-zinc-50 border-b border-zinc-100 last:border-0 group">
                                        <div className="col-span-6 flex flex-col gap-1">
                                            <div className="flex items-start gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setLineItems(lineItems.map((li, i) =>
                                                        i === idx ? { ...li, category: li.category.includes('part') ? 'internal' : 'part_external' } : li
                                                    ))}
                                                    className={`text-xs px-1.5 py-1 rounded border shrink-0 ${item.category.includes('part') ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}
                                                >
                                                    {itemCategoryLabel}
                                                </button>
                                                <div className="min-w-0 flex-1">
                                                    <span className="min-w-0 break-words font-medium">
                                                        {isPartItem
                                                            ? formatPartDisplay(item)
                                                            : item.name}
                                                    </span>
                                                    {isPartItem && (
                                                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                                                            {item.partRef && <span>Ref: {item.partRef}</span>}
                                                            {item.cousinsNumber && <span>Cousins: {item.cousinsNumber}</span>}
                                                            {statusLabel && (
                                                                <span className={cn(
                                                                    "rounded border px-1.5 py-0.5 text-xs",
                                                                    statusLabel === '在庫あり'
                                                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                                        : statusLabel === '入荷済み'
                                                                            ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                                                                            : statusLabel === '注文済み'
                                                                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                                                                : "border-blue-200 bg-blue-50 text-blue-700"
                                                                )}>
                                                                    {statusLabel}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {item.spec && <span className="text-xs text-zinc-400 pl-0.5">{item.spec}</span>}
                                        </div>
                                        <div className="col-span-1">
                                            <input
                                                type="number"
                                                className="h-8 w-full text-right text-sm bg-zinc-50 border border-zinc-200 rounded px-1.5 font-mono"
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
                                                className="h-8 w-full text-right text-sm border border-zinc-200 rounded px-1.5 font-mono"
                                                value={item.price}
                                                onChange={e => setLineItems(lineItems.map((li, i) =>
                                                    i === idx ? { ...li, price: parseInt(e.target.value) || 0 } : li
                                                ))}
                                            />
                                            <div className="mt-0.5 text-right text-xs text-zinc-400">
                                                税抜小計 ¥{(item.price * (item.quantity || 1)).toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="col-span-1">
                                            <input
                                                type="number"
                                                className="h-8 w-full text-center text-sm border border-zinc-200 rounded px-1.5"
                                                value={item.quantity}
                                                min={1}
                                                onChange={e => setLineItems(lineItems.map((li, i) =>
                                                    i === idx ? { ...li, quantity: parseInt(e.target.value) || 1 } : li
                                                ))}
                                            />
                                        </div>
                                        {/* 🔍 部品検索 */}
                                        <div className="col-span-1 text-center">
                                            {isSearchablePartItem && (
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    className={`cursor-pointer transition-colors text-sm ${partSearchRowIdx === idx && partSearchDialogOpen ? 'text-blue-500' : 'text-zinc-400 hover:text-blue-500'}`}
                                                    title="部品検索サイトを開く"
                                                    onClick={() => {
                                                        handleOpenPartSearchDialog(idx);
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.key !== "Enter" && event.key !== " ") return;
                                                        event.preventDefault();
                                                        handleOpenPartSearchDialog(idx);
                                                    }}
                                                >
                                                    🔍
                                                </span>
                                            )}
                                        </div>
                                        <div className="col-span-1 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {isPartItem && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOrderAction(idx)}
                                                        className="text-zinc-400 hover:text-amber-600 transition-colors"
                                                        title="発注連携"
                                                    >
                                                        📦
                                                    </button>
                                                )}
                                                <button type="button" onClick={() => setLineItems(lineItems.filter((_, i) => i !== idx))} className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )})}
                                {/* 入力行 */}
                                <div className="bg-zinc-50 p-2 rounded border border-zinc-200 mt-2">
                                    <div className="flex gap-2 mb-2">
                                        <select
                                            className="h-9 rounded border border-zinc-300 bg-white px-2 text-sm"
                                            value={addItemCategory}
                                            onChange={(e) => {
                                                const nextCategory = e.target.value as typeof addItemCategory;
                                                setAddItemCategory(nextCategory);
                                                if (nextCategory === "external_labor") {
                                                    setStructuredWorkOpen(true);
                                                }
                                                if (!nextCategory.includes("part")) {
                                                    setSelectedPartCategoryKey("");
                                                    setSelectedPartNameKey("");
                                                } else {
                                                    setStructuredWorkOpen(false);
                                                    resetStructuredWorkInputs();
                                                }
                                            }}
                                        >
                                            <option value="internal">技術料</option>
                                            <option value="external_labor">外装修理技術料</option>
                                            <option value="part_external">交換部品</option>
                                        </select>
                                        <AdvancedCombobox
                                            className="flex-1"
                                            placeholder="作業名 / 部品名を入力..."
                                            value={newItemName}
                                            onChange={(v) => {
                                                setNewItemName(v);
                                                setSelectedWorkOption(null);
                                                const match = workOpts.find(w => w.value === v);
                                                if (match) {
                                                    if (match.price !== undefined) {
                                                        setNewItemPrice(String(match.price));
                                                        setNewItemPriceManuallyEdited(false);
                                                        autoFilledPricingRuleIdRef.current = null;
                                                    }
                                                    if (match.cost !== undefined) setNewItemCost(String(match.cost));
                                                }
                                            }}
                                            onSelectOption={(option) => {
                                                setSelectedWorkOption(option);
                                                if (isAddingLaborItem) {
                                                    const categoryId = Number(option.repairWorkCategoryId);
                                                    if (Number.isInteger(categoryId) && categoryId > 0) {
                                                        handleRepairWorkCategoryChange(String(categoryId));
                                                    }
                                                    const actionId = Number(option.repairWorkActionId);
                                                    if (Number.isInteger(actionId) && actionId > 0) {
                                                        handleRepairWorkActionChange(String(actionId));
                                                    }
                                                }
                                                if (option.price !== undefined) {
                                                    setNewItemPrice(String(option.price));
                                                    setNewItemPriceManuallyEdited(false);
                                                    autoFilledPricingRuleIdRef.current = null;
                                                }
                                                if (option.cost !== undefined) setNewItemCost(String(option.cost));
                                            }}
                                            options={workOpts}
                                        />
                                    </div>
                                    {isAddingPartItem && (
                                        <div className="mb-2 grid gap-2 md:grid-cols-[140px_1fr_1.2fr]">
                                            <select
                                                className="h-9 rounded border border-zinc-300 bg-white px-2 text-sm"
                                                value={selectedPartInputType}
                                                onChange={(e) => handlePartInputTypeChange(e.target.value as PartInputType)}
                                            >
                                                {PART_INPUT_TYPES.map((type) => (
                                                    <option key={type.value} value={type.value}>
                                                        {type.labelJa}
                                                    </option>
                                                ))}
                                            </select>
                                            <select
                                                className="h-9 rounded border border-zinc-300 bg-white px-2 text-sm"
                                                value={selectedPartCategoryKey}
                                                onChange={(e) => handlePartCategoryChange(e.target.value)}
                                            >
                                                <option value="">部品カテゴリを選択</option>
                                                {partCategoryOptions.map((category) => (
                                                    <option key={category.key} value={category.key}>
                                                        {category.labelJa}
                                                    </option>
                                                ))}
                                            </select>
                                            <select
                                                className="h-9 rounded border border-zinc-300 bg-white px-2 text-sm"
                                                value={selectedPartNameKey}
                                                onChange={(e) => handlePartNameChange(e.target.value)}
                                                disabled={!selectedPartCategoryKey}
                                            >
                                                <option value="">部品名を選択</option>
                                                {partNameOptions.map((option) => (
                                                    <option key={option.key} value={option.key}>
                                                        {option.displayJa ?? option.nameJa}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    {isAddingLaborItem && (
                                        <div className="mb-2 rounded border border-dashed border-zinc-200 bg-white">
                                            <button
                                                type="button"
                                                className="flex h-8 w-full items-center justify-between px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                                                onClick={() => setStructuredWorkOpen((open) => !open)}
                                            >
                                                <span>詳細な作業分類を入力する</span>
                                                <ChevronDown className={cn("h-3 w-3 transition-transform", structuredWorkOpen && "rotate-180")} />
                                            </button>
                                            {structuredWorkOpen && (
                                                <div className="grid gap-2 border-t border-zinc-100 p-3 md:grid-cols-3">
                                                    <label className="space-y-1">
                                                        <span className="text-xs font-semibold text-zinc-500">作業カテゴリ</span>
                                                        <select
                                                            className="h-9 w-full rounded border border-zinc-300 bg-white px-2 text-sm"
                                                            value={newWorkCategoryId}
                                                            onChange={(e) => handleRepairWorkCategoryChange(e.target.value)}
                                                        >
                                                            <option value="">選択なし</option>
                                                            {visibleRepairWorkCategoryOptions.map((option) => (
                                                                <option key={option.id} value={option.id}>
                                                                    {option.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className="space-y-1">
                                                        <span className="text-xs font-semibold text-zinc-500">対象部品</span>
                                                        <select
                                                            className="h-9 w-full rounded border border-zinc-300 bg-white px-2 text-sm"
                                                            value={newTargetPartNameId}
                                                            onChange={(e) => handleTargetPartNameChange(e.target.value)}
                                                            disabled={Boolean(newWorkCategoryId) && filteredWorkTargetPartOptions.length === 0}
                                                        >
                                                            <option value="">選択なし</option>
                                                            {filteredWorkTargetPartOptions.map((option) => (
                                                                <option key={option.id} value={option.id}>
                                                                    {option.categoryName ? `${option.name}（${option.categoryName}）` : option.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {targetPartCandidateMessage && (
                                                            <p className="text-xs text-zinc-400">{targetPartCandidateMessage}</p>
                                                        )}
                                                    </label>
                                                    <label className="space-y-1">
                                                        <span className="text-xs font-semibold text-zinc-500">処置</span>
                                                        <select
                                                            className="h-9 w-full rounded border border-zinc-300 bg-white px-2 text-sm"
                                                            value={newWorkActionId}
                                                            onChange={(e) => handleRepairWorkActionChange(e.target.value)}
                                                        >
                                                            <option value="">選択なし</option>
                                                            {visibleRepairWorkActionOptions.map((option) => (
                                                                <option key={option.id} value={option.id}>
                                                                    {option.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className="space-y-1 md:col-span-3">
                                                        <span className="text-xs font-semibold text-zinc-500">detail</span>
                                                        <Input
                                                            className="h-9 text-sm"
                                                            placeholder="ブッシュ / ピン / 穴"
                                                            value={newWorkDetailLabel}
                                                            onChange={(e) => setNewWorkDetailLabel(e.target.value)}
                                                        />
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <Input className="h-9 text-sm flex-1" placeholder="備考/仕様" value={newItemSpec} onChange={e => setNewItemSpec(e.target.value)} />
                                        <div className="relative w-20">
                                            <span className="absolute left-2 top-2.5 text-xs text-zinc-400">仕入</span>
                                            <Input className="h-9 text-sm pl-8 font-mono text-right" placeholder="0" value={newItemCost} onChange={e => setNewItemCost(e.target.value)} />
                                        </div>
                                        <div className="relative w-24">
                                            <span className="absolute left-2 top-2.5 text-xs">¥</span>
                                            <Input className="h-9 text-sm pl-5 font-mono text-right" placeholder="0" value={newItemPrice} onChange={e => {
                                                setNewItemPrice(e.target.value);
                                                setNewItemPriceManuallyEdited(true);
                                                autoFilledPricingRuleIdRef.current = null;
                                            }} />
                                        </div>
                                        <Input className="h-9 text-sm w-14 text-center font-mono" placeholder="1" value={newItemQty} onChange={e => setNewItemQty(e.target.value)} type="number" min={1} />
                                        <Button size="sm" className="h-9 w-10 p-0 bg-blue-600 hover:bg-blue-700" onClick={() => {
                                            const structuredWorkName = isAddingLaborItem
                                                ? [
                                                    cleanOptionalText(newTargetPartNameSnapshot) ?? cleanOptionalText(newWorkCategorySnapshot),
                                                    cleanOptionalText(newWorkActionSnapshot),
                                                    cleanOptionalText(newWorkDetailLabel),
                                                ].filter(Boolean).join(" ")
                                                : "";
                                            const resolvedItemName = cleanOptionalText(newItemName) ?? structuredWorkName;
                                            if (!resolvedItemName) return;
                                            const fallbackMatch = addItemCategory === 'part_external'
                                                ? workOpts.find(w => w.value === newItemName && w.partId)
                                                : undefined;
                                            const match = addItemCategory === 'part_external'
                                                ? (selectedWorkOption ?? fallbackMatch)
                                                : undefined;
                                            const baseItem: LineItem = {
                                                id: `auto-${Date.now()}`,
                                                category: addItemCategory,
                                                ...(isAddingPartItem ? {
                                                    partType: toLineItemPartType(selectedPartInputType),
                                                    partNameEn: selectedPartNameOption?.displayEn ?? selectedPartNameOption?.nameEn,
                                                } : {}),
                                                name: resolvedItemName,
                                                cost: parseInt(newItemCost) || undefined,
                                                price: parseInt(newItemPrice) || 0,
                                                quantity: parseInt(newItemQty) || 1,
                                                spec: newItemSpec,
                                                ...(isAddingLaborItem ? {
                                                    repairWorkCategoryId: newWorkCategoryId ? Number(newWorkCategoryId) : null,
                                                    repairWorkActionId: newWorkActionId ? Number(newWorkActionId) : null,
                                                    targetPartNameId: newTargetPartNameId || null,
                                                    detailLabelSnapshot: cleanOptionalText(newWorkDetailLabel),
                                                    categoryNameSnapshot: cleanOptionalText(newWorkCategorySnapshot),
                                                    targetPartNameSnapshot: cleanOptionalText(newTargetPartNameSnapshot),
                                                    actionNameSnapshot: cleanOptionalText(newWorkActionSnapshot),
                                                } : {})
                                            };
                                            const nextItem = match
                                                ? finalizePartLineItem(buildPartLineItem(baseItem, match), true)
                                                : baseItem;
                                            const nextItems = [...lineItems, nextItem];
                                            setLineItems(nextItems);
                                            if (match && nextItem.category.includes('part') && nextItem.partsMasterId) {
                                                const missingQty = getMissingOrderQuantityForPart(nextItem.partsMasterId, nextItems, nextItem.stockQuantity);
                                                if (missingQty > 0) {
                                                    void ensureOrderRequest({ ...nextItem, quantity: missingQty }, true);
                                                }
                                            }
                                            setNewItemName("");
                                            setNewItemCost("");
                                            setNewItemPrice("");
                                            setNewItemPriceManuallyEdited(false);
                                            autoFilledPricingRuleIdRef.current = null;
                                            setNewItemQty("1");
                                            setNewItemSpec("");
                                            setSelectedWorkOption(null);
                                            setSelectedPartNameKey("");
                                            resetStructuredWorkInputs();
                                        }}>
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className="border-t bg-emerald-50/70 px-3 py-2 text-right">
                                <span className="mr-2 text-sm font-semibold text-emerald-800">合計金額</span>
                                <span className="text-xl font-bold text-emerald-900">¥{grandTotal.toLocaleString()}</span>
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
                                        <p className="text-xs text-center">明細行の 🔍 ボタンから<br />検索サイトまたは部品パネルを開いてください</p>
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
                                        initialKeyword={partsPanelInitialKeyword}
                                        initialPartType={partsPanelEffectiveInitialPartType}
                                        initialPartRef={activePartsPanelLineItem?.partRef}
                                        initialPartsMasterId={activePartsPanelLineItem?.partsMasterId ?? null}
                                        initialPartNameEn={partsPanelInitialPartNameEn}
                                        initialStandardPartNameId={partsPanelStandardPartNameId}
                                        initialStandardPartNameKey={partsPanelStandardPartNameKey}
                                        initialGrade={activePartsPanelLineItem?.grade}
                                        targetKey={partsPanelTargetKey}
                                        repairId={initialData?.id ? Number(initialData.id) : null}
                                        brandId={selectedBrandId}
                                        brandName={brand}
                                        modelId={selectedModelId}
                                        modelName={model}
                                        watchCaliberId={selectedWatchCaliberId}
                                        watchRef={refName}
                                        watchCaliber={caliber}
                                        movementMakerId={movementMakerId}
                                        movementMaker={movementMaker}
                                        movementCaliberId={movementCaliberId}
                                        movementCaliber={movementCaliber}
                                        baseMovementMakerId={baseMovementMakerId}
                                        baseMovementMaker={baseMovementMaker}
                                        baseMovementCaliberId={baseMovementCaliberId}
                                        baseMovementCaliber={baseMovementCaliber}
                                        onSelect={isReadOnly ? undefined : (part) => {
                                            if (partsPanelRowIdx === null) return;
                                            const nextItems = lineItems.map((li, i) =>
                                                i === partsPanelRowIdx
                                                    ? finalizePartLineItem(buildPartLineItem(li, part), true)
                                                    : li
                                            );
                                            setLineItems(nextItems);
                                            const nextItem = nextItems[partsPanelRowIdx];
                                            if (nextItem?.partsMasterId) {
                                                const missingQty = getMissingOrderQuantityForPart(nextItem.partsMasterId, nextItems, nextItem.stockQuantity);
                                                if (missingQty > 0) {
                                                    void ensureOrderRequest({
                                                        ...nextItem,
                                                        quantity: missingQty,
                                                        status: 'pending',
                                                    }, true);
                                                }
                                            }
                                            setPartsPanelOpen(false);
                                            setPartsPanelRowIdx(null);
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                        {/* future action buttons area */}
                    </div>

                    </div>
                </div>
                )}

                {/* 写真タブ */}
                {activeTab === 'photo' && (
                <div className="p-3">
                <div>
                    <Card className="shadow-sm border-t-4 border-t-purple-600 bg-white p-3 flex flex-col">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-xs font-bold flex items-center gap-1.5 text-zinc-700 uppercase">
                                <ImageIcon className="w-3.5 h-3.5" /> 写真
                            </h3>
                            <div className="flex flex-wrap items-center gap-1">
                                <select
                                    aria-label="新規写真の撮影箇所"
                                    className="h-7 max-w-28 rounded border border-zinc-200 bg-white px-1 text-[10px]"
                                    value={newPhotoCategory}
                                    disabled={isReadOnly || isUploading || isCapturing}
                                    onChange={(event) => setNewPhotoCategory(event.target.value)}
                                >
                                    {repairPhotoCategories.map((value) => <option key={value} value={value}>{repairPhotoCategoryLabels[value]}</option>)}
                                </select>
                                <Button type="button" variant="ghost" className="h-7 px-2 text-[10px] font-bold text-zinc-700" onClick={() => setPhotoSettingsOpen(true)} disabled={photos.length === 0}>
                                    写真共有設定
                                </Button>
                                <label className="flex h-7 items-center gap-1 rounded border border-zinc-200 bg-white px-2 text-[10px] font-medium text-zinc-700">
                                    <Checkbox
                                        checked={photoPostingOptOut}
                                        disabled={isReadOnly || !initialData?.id || isUpdatingPhotoPostingOptOut}
                                        onCheckedChange={(checked) => void updatePhotoPostingOptOut(checked === true)}
                                    />
                                    <span>写真の事例・SNS掲載: {photoPostingOptOut ? "お客様より掲載拒否" : "掲載可"}</span>
                                </label>
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
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-7 px-2 text-[10px] font-bold text-zinc-700"
                                    onClick={() => photoFileInputRef.current?.click()}
                                    disabled={isReadOnly || isUploading || isCapturing}
                                >
                                    写真追加
                                </Button>
                                <input ref={photoFileInputRef} type="file" className="hidden" accept="image/*" multiple onChange={handlePhotoUpload} />
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                                    if (isReadOnly) return;
                                    if (!canUseMobileQR) {
                                        toast({ title: "スマホ撮影は案件保存後に利用できます。" });
                                        return;
                                    }
                                    setMobileQR(true);
                                }}>
                                    <Smartphone className={cn("w-4 h-4", canUseMobileQR ? "text-blue-500" : "text-zinc-300")} />
                                </Button>
                            </div>
                        </div>
                        <div className="grid auto-rows-min grid-cols-3 content-start gap-2 rounded-md bg-zinc-100 p-2">
                            {photos.map((p, i) => {
                                const category = repairPhotoCategories.includes(p.category) ? p.category : "OTHER";
                                const customerVisible = p.customerVisible !== false;
                                const publicCaseVisible = p.publicCaseVisible === true;
                                const snsVisible = p.snsVisible === true;
                                return (
                                    <div key={p.id ?? `${p.storageKey}-${i}`} className="relative overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
                                        <img src={getRepairPhotoSrc(p) ?? ""} alt={p.fileName || "修理写真"} className="aspect-square w-full bg-black object-cover" />
                                        <div className="space-y-1.5 p-2 text-[10px] text-zinc-700">
                                            <select
                                                aria-label="撮影工程"
                                                className="h-7 w-full rounded border border-zinc-200 bg-white px-1"
                                                value={p.stage ?? ""}
                                                disabled={isReadOnly}
                                                onChange={(event) => void updatePhoto(i, { stage: event.target.value || null })}
                                            >
                                                <option value="">工程未設定</option>
                                                {repairPhotoStages.map((stage) => <option key={stage} value={stage}>{repairPhotoStageLabels[stage]}</option>)}
                                            </select>
                                            <select
                                                aria-label="撮影部位"
                                                className="h-7 w-full rounded border border-zinc-200 bg-white px-1"
                                                value={category}
                                                disabled={isReadOnly}
                                                onChange={(event) => applyPhotoCategory(i, event.target.value)}
                                            >
                                                {repairPhotoCategories.map((value) => <option key={value} value={value}>{repairPhotoCategoryLabels[value]}</option>)}
                                            </select>
                                            <label className="flex items-center gap-1"><Checkbox checked={customerVisible} disabled={isReadOnly} onCheckedChange={(checked) => void updatePhoto(i, { customerVisible: checked === true, publicCaseVisible, snsVisible })} /> 顧客共有</label>
                                            <label className="flex items-center gap-1 text-zinc-600"><Checkbox checked={publicCaseVisible} disabled={isReadOnly || photoPostingOptOut} onCheckedChange={(checked) => void updatePhoto(i, { customerVisible, publicCaseVisible: checked === true, snsVisible })} /> 事例公開</label>
                                            <label className="flex items-center gap-1 text-zinc-600"><Checkbox checked={snsVisible} disabled={isReadOnly || photoPostingOptOut} onCheckedChange={(checked) => void updatePhoto(i, { customerVisible, publicCaseVisible, snsVisible: checked === true })} /> SNS利用</label>
                                        </div>
                                        <div className="absolute right-1 top-1 flex gap-1">
                                            <button type="button" aria-label="写真を拡大" onClick={() => setExpandedPhoto(p)} className="rounded bg-black/60 p-1 text-white hover:text-blue-300"><Eye className="h-3.5 w-3.5" /></button>
                                            <button type="button" onClick={() => void deletePhoto(i)} className="rounded bg-black/60 p-1 text-white hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                                        </div>
                                    </div>
                                );
                            })}
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
                {activeTab === 'line' && initialData?.id && <RepairLineConversation repairId={Number(initialData.id)} />}
            </div>

            {/* --- DIALOGS --- */}
            <QuickRegisterDialog
                isOpen={quickRegOpen}
                onClose={() => setQuickRegOpen(false)}
                mode="customer"
                initialName={customerName}
                onRegister={(d) => {
                    const registeredCustomerType = normalizeCustomerTypeSelection(d.type);
                    if (!customerTypeSelection || registeredCustomerType !== customerTypeSelection) {
                        alert("登録された顧客種別が現在の選択と一致しません。顧客種別を確認してください。");
                        return;
                    }
                    setCustomerName(d.name);
                    setCustomerPrefix(registeredCustomerType === 'business' ? (d.prefix || "") : "C");
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

            <Dialog open={photoSettingsOpen} onOpenChange={setPhotoSettingsOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>写真共有設定</DialogTitle>
                        <DialogDescription>写真ごとの工程・撮影箇所と、共有先をまとめて確認・変更できます。<a href="/masters/photo-sharing" className="ml-2 font-medium text-blue-600 underline">新規写真の初期値を設定</a></DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[65vh] space-y-2 overflow-y-auto">
                        {photos.map((photo, index) => {
                            const category = repairPhotoCategories.includes(photo.category) ? photo.category : "OTHER";
                            return <div key={photo.id ?? `${photo.storageKey}-${index}`} className="grid grid-cols-[3.5rem_1fr] gap-3 rounded border p-2 sm:grid-cols-[5rem_8rem_8rem_1fr]">
                                <img src={getRepairPhotoSrc(photo) ?? ""} alt={photo.fileName || "修理写真"} className="aspect-square w-full rounded object-cover" />
                                <div className="grid grid-cols-2 gap-2 sm:contents">
                                    <select className="h-8 rounded border px-1 text-xs" value={photo.stage ?? ""} disabled={isReadOnly} onChange={(event) => void updatePhoto(index, { stage: event.target.value || null })}>
                                        <option value="">工程未設定</option>
                                        {repairPhotoStages.map((stage) => <option key={stage} value={stage}>{repairPhotoStageLabels[stage]}</option>)}
                                    </select>
                                    <select className="h-8 rounded border px-1 text-xs" value={category} disabled={isReadOnly} onChange={(event) => applyPhotoCategory(index, event.target.value)}>
                                        {repairPhotoCategories.map((value) => <option key={value} value={value}>{repairPhotoCategoryLabels[value]}</option>)}
                                    </select>
                                    <div className="col-span-2 flex flex-wrap gap-3 text-xs">
                                        <label className="flex items-center gap-1"><Checkbox checked={photo.customerVisible !== false} disabled={isReadOnly} onCheckedChange={(checked) => void updatePhoto(index, { customerVisible: checked === true, publicCaseVisible: photo.publicCaseVisible === true, snsVisible: photo.snsVisible === true })} />共有</label>
                                        <label className="flex items-center gap-1"><Checkbox checked={photo.publicCaseVisible === true} disabled={isReadOnly || photoPostingOptOut} onCheckedChange={(checked) => void updatePhoto(index, { customerVisible: photo.customerVisible !== false, publicCaseVisible: checked === true, snsVisible: photo.snsVisible === true })} />事例</label>
                                        <label className="flex items-center gap-1"><Checkbox checked={photo.snsVisible === true} disabled={isReadOnly || photoPostingOptOut} onCheckedChange={(checked) => void updatePhoto(index, { customerVisible: photo.customerVisible !== false, publicCaseVisible: photo.publicCaseVisible === true, snsVisible: checked === true })} />SNS</label>
                                    </div>
                                </div>
                            </div>;
                        })}
                    </div>
                    {photoPostingOptOut && <p className="text-sm text-amber-700">お客様が事例・SNS掲載を希望していないため、事例・SNSは変更できません。</p>}
                    <DialogFooter><Button type="button" onClick={() => setPhotoSettingsOpen(false)}>閉じる</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={expandedPhoto !== null} onOpenChange={(open) => { if (!open) setExpandedPhoto(null); }}>
                <DialogContent className="!fixed !inset-0 !flex !h-[100dvh] !w-screen !max-h-none !max-w-none !translate-x-0 !translate-y-0 !rounded-none !border-0 !bg-black !p-0 text-white [&>button]:right-4 [&>button]:top-4 [&>button]:z-20 [&>button]:opacity-100 [&>button]:text-white">
                    <DialogHeader className="absolute left-4 top-4 z-10 pr-16">
                        <DialogTitle className="text-sm text-white/80">写真確認</DialogTitle>
                    </DialogHeader>
                    <div className="absolute left-4 top-12 z-10">
                        <Button type="button" variant="outline" size="sm" className="h-8 border-white/30 bg-white/15 text-xs text-white hover:bg-white/25 hover:text-white" onClick={resetPhotoViewer}>
                            フィット / リセット
                        </Button>
                    </div>
                    <div
                        className={cn("flex h-full w-full touch-none items-center justify-center overflow-hidden", photoViewerZoom > 1 ? "cursor-grab" : "cursor-default")}
                        onWheel={(event) => {
                            event.preventDefault();
                            setPhotoViewerZoom((current) => {
                                const next = Math.min(5, Math.max(0.5, current - event.deltaY * 0.0015));
                                if (next <= 1) setPhotoViewerPan({ x: 0, y: 0 });
                                return next;
                            });
                        }}
                        onPointerDown={(event) => {
                            if (photoViewerZoom <= 1) return;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            photoViewerDragRef.current = {
                                pointerId: event.pointerId,
                                startX: event.clientX,
                                startY: event.clientY,
                                panX: photoViewerPan.x,
                                panY: photoViewerPan.y,
                            };
                        }}
                        onPointerMove={(event) => {
                            const drag = photoViewerDragRef.current;
                            if (!drag || drag.pointerId !== event.pointerId) return;
                            setPhotoViewerPan({ x: drag.panX + event.clientX - drag.startX, y: drag.panY + event.clientY - drag.startY });
                        }}
                        onPointerUp={(event) => {
                            if (photoViewerDragRef.current?.pointerId === event.pointerId) photoViewerDragRef.current = null;
                        }}
                        onPointerCancel={() => { photoViewerDragRef.current = null; }}
                    >
                        {expandedPhoto && <img src={getRepairPhotoSrc(expandedPhoto) ?? ""} alt={expandedPhoto.fileName || "修理写真"} draggable={false} className="max-h-full max-w-full select-none object-contain transition-transform duration-75" style={{ transform: `translate(${photoViewerPan.x}px, ${photoViewerPan.y}px) scale(${photoViewerZoom})` }} />}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={partSearchDialogOpen} onOpenChange={setPartSearchDialogOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Search className="h-4 w-4" />
                            検索サイトを選択
                        </DialogTitle>
                        <DialogDescription>
                            {activePartSearchItem
                                ? `「${activePartSearchItem.name || "（未入力）"}」の検索語を確認して、検索先を選択します。`
                                : "検索したい明細行を選択してください。"}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 md:grid-cols-[1.1fr_1.4fr]">
                        <div className="space-y-3">
                            <div className="rounded-md border border-zinc-200">
                                <div className="border-b bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
                                    サイト一覧
                                </div>
                                <div className="max-h-72 space-y-1 overflow-y-auto p-2">
                                    {searchSites.map((site) => (
                                        <label
                                            key={site.id}
                                            className={cn(
                                                "flex cursor-pointer items-start gap-2 rounded-md border px-2 py-2 text-xs transition-colors",
                                                selectedSearchSiteId === site.id
                                                    ? "border-blue-300 bg-blue-50"
                                                    : "border-transparent hover:border-zinc-200 hover:bg-zinc-50"
                                            )}
                                            onClick={() => setSelectedSearchSiteId(site.id)}
                                        >
                                            <Checkbox
                                                checked={site.enabled}
                                                onCheckedChange={(checked) => handleToggleSearchSite(site.id, checked === true)}
                                                className="mt-0.5"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-zinc-800">{site.name}</span>
                                                    <span className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-[10px] text-zinc-500">
                                                        {site.lang.toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="mt-0.5 break-all text-[10px] text-zinc-400">
                                                    {site.url}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={handleAddSearchSite}>
                                    サイト追加
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleDeleteSearchSite}
                                    disabled={!selectedSearchSiteId}
                                >
                                    サイト削除
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleOpenPartsPanelFromSearch}
                                    disabled={partSearchRowIdx === null}
                                >
                                    部品パネル
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="rounded-md border border-zinc-200">
                                <div className="border-b bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
                                    検索語プレビュー
                                </div>
                                <div className="grid gap-3 p-3 md:grid-cols-2">
                                    <div>
                                        <div className="mb-2 text-xs font-semibold text-zinc-700">日本語</div>
                                        <div className="space-y-1 rounded-md bg-zinc-50 p-2">
                                            {japanesePartQueries.length > 0 ? japanesePartQueries.map((query, index) => (
                                                <div key={`ja-${index}`} className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700">
                                                    {query}
                                                </div>
                                            )) : (
                                                <div className="text-[11px] text-zinc-400">検索語を生成できませんでした</div>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 text-xs font-semibold text-zinc-700">英語</div>
                                        <div className="space-y-1 rounded-md bg-zinc-50 p-2">
                                            {englishPartQueries.length > 0 ? englishPartQueries.map((query, index) => (
                                                <div key={`en-${index}`} className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700">
                                                    {query}
                                                </div>
                                            )) : (
                                                <div className="text-[11px] text-zinc-400">検索語を生成できませんでした</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">
                                チェックされたサイトだけ新しいタブで開きます。サイトごとの言語設定に応じて、日本語または英語の先頭検索語を使います。
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:justify-between">
                        <div className="text-[11px] text-zinc-400">
                            サイト設定は localStorage に保存されます。
                        </div>
                        <Button type="button" onClick={handleExecutePartSearch}>
                            <ExternalLink className="mr-1.5 h-4 w-4" />
                            検索する
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                                <img src={capturedPreview} alt="撮影プレビュー" className="h-full w-full object-contain" />
                            ) : (
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="h-full w-full object-contain"
                                    onLoadedMetadata={() => {
                                        const video = videoRef.current;
                                        if (video) setCameraInfo((current) => `${current} / 映像: ${video.videoWidth} × ${video.videoHeight} / 表示: ${video.clientWidth} × ${video.clientHeight}`);
                                    }}
                                />
                            )}
                        </div>

                        <canvas ref={canvasRef} className="hidden" />
                    </div>

                    <DialogFooter className="border-t bg-white px-6 py-4 sm:justify-between">
                        {cameraInfo ? <p className="text-xs font-mono text-zinc-500">{cameraInfo}</p> : null}
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
