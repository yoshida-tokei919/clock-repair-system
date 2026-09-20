"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Plus, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  INQUIRY_WATCH_FIELDS,
  type InquiryWatchConfirmationStatus,
  type InquiryWatchFieldName,
} from "@/lib/inquiry-review";

type FieldValue = {
  id: number;
  field: InquiryWatchFieldName;
  value: string;
  source: "AI_CANDIDATE" | "MANUAL";
  confirmationStatus: InquiryWatchConfirmationStatus;
  confirmedAt: string | null;
  sourceAiCandidateId: number | null;
};

type Candidate = {
  id: number;
  field: InquiryWatchFieldName;
  rank: number;
  value: string;
  confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  evidence: string | null;
  observedText: string | null;
  sourceType: "CUSTOMER_STATED" | "IMAGE_OBSERVED" | "WEB_INFERRED" | "AI_INFERRED" | "TECHNICIAN_CONFIRMED";
  sourceMessageIds: unknown;
  sourceImageIds: unknown;
};

type ReviewWatch = {
  id: number;
  position: number;
  label: string | null;
  summary: string | null;
  faults: unknown;
  requestedWork: unknown;
  supplementalFacts: unknown;
  missingInformation: unknown;
  missingPhotos: unknown;
  brandId: number | null;
  modelId: number | null;
  referenceId: number | null;
  caseReferenceId: number | null;
  caliberId: number | null;
  baseCaliberId: number | null;
  promotedAt: string | null;
  fieldValues: FieldValue[];
  sourceAiWatch: { candidates: Candidate[] } | null;
};

type ReviewPayload = {
  inquiry: {
    id: number;
    status: string;
    conversationSummary: string | null;
    firstReceivedAt: string;
    lastReceivedAt: string;
    reviewWatches: ReviewWatch[];
  };
  masterOptions: {
    brands: Array<{ id: number; name: string; nameJp: string; nameEn: string | null }>;
    models: Array<{ id: number; brandId: number; name: string; nameJp: string; nameEn: string | null }>;
    references: Array<{ id: number; modelId: number; name: string }>;
    calibers: Array<{ id: number; brandId: number | null; name: string; nameJp: string | null; nameEn: string | null }>;
  };
};

type PromotionCustomer = {
  id: number;
  name: string;
  companyName: string | null;
  type: string;
  prefix: string | null;
  phone: string | null;
  lineId: string | null;
};

type FieldDraft = { value: string; confirmationStatus: InquiryWatchConfirmationStatus; source: "AI_CANDIDATE" | "MANUAL" };
type WatchDraft = {
  fields: Partial<Record<InquiryWatchFieldName, FieldDraft>>;
  masterSelections: {
    brandId: number | null;
    modelId: number | null;
    referenceId: number | null;
    caseReferenceId: number | null;
    caliberId: number | null;
    baseCaliberId: number | null;
  };
  caliberMakerId: number | null;
  baseCaliberMakerId: number | null;
};

type RegistrationKind = "BRAND" | "MODEL" | "REFERENCE" | "CASE_REFERENCE" | "CALIBER" | "BASE_CALIBER";

const FIELD_LABELS: Record<InquiryWatchFieldName, string> = {
  BRAND: "ブランド",
  MODEL: "モデル",
  PRODUCT_REF: "Ref",
  CASE_REF: "ケースRef",
  CALIBER: "Cal",
  BASE_CALIBER: "Base Cal",
  MOVEMENT_TYPE: "ムーブメント種別",
  ERA: "年代",
};

const CONFIDENCE_LABELS = { LOW: "低", MEDIUM: "中", HIGH: "高" } as const;
const SOURCE_LABELS = {
  CUSTOMER_STATED: "顧客申告",
  IMAGE_OBSERVED: "画像確認",
  WEB_INFERRED: "Web推定",
  AI_INFERRED: "AI推定",
  TECHNICIAN_CONFIRMED: "技術者確認",
} as const;

function masterLabel(item: { name: string; nameJp?: string | null; nameEn?: string | null }) {
  return item.nameJp || item.nameEn || item.name;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function watchDraft(watch: ReviewWatch, options: ReviewPayload["masterOptions"]): WatchDraft {
  const caliber = options.calibers.find((item) => item.id === watch.caliberId);
  const baseCaliber = options.calibers.find((item) => item.id === watch.baseCaliberId);
  return {
    fields: Object.fromEntries(watch.fieldValues.map((value) => [value.field, {
      value: value.value,
      confirmationStatus: value.confirmationStatus,
      source: value.source,
    }])) as Partial<Record<InquiryWatchFieldName, FieldDraft>>,
    masterSelections: {
      brandId: watch.brandId,
      modelId: watch.modelId,
      referenceId: watch.referenceId,
      caseReferenceId: watch.caseReferenceId,
      caliberId: watch.caliberId,
      baseCaliberId: watch.baseCaliberId,
    },
    caliberMakerId: caliber?.brandId ?? null,
    baseCaliberMakerId: baseCaliber?.brandId ?? null,
  };
}

export function InquiryReviewScreen({ inquiryId }: { inquiryId: number }) {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<number, WatchDraft>>({});
  const [openWatchId, setOpenWatchId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingWatchId, setSavingWatchId] = useState<number | null>(null);
  const [promotionCustomers, setPromotionCustomers] = useState<PromotionCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedPromotionWatchIds, setSelectedPromotionWatchIds] = useState<number[]>([]);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/inquiries/${inquiryId}/review`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "確認内容を読み込めませんでした。");
      setPayload(data);
      setDrafts(Object.fromEntries(data.inquiry.reviewWatches.map((watch: ReviewWatch) => [watch.id, watchDraft(watch, data.masterOptions)])));
      setOpenWatchId((current) => current ?? data.inquiry.reviewWatches[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "確認内容を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [inquiryId]);

  async function loadPromotionCustomers(query = "") {
    const response = await fetch(`/api/inquiries/${inquiryId}/promotion/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "顧客候補を取得できませんでした。");
    const choices = [...data.strictMatches, ...data.customers].filter((customer, index, values) => values.findIndex((item) => item.id === customer.id) === index);
    setPromotionCustomers(choices);
    setSelectedCustomerId((current) => current !== null && choices.some((customer) => customer.id === current) ? current : null);
  }

  useEffect(() => { void loadPromotionCustomers().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "顧客候補を取得できませんでした。")); }, [inquiryId]);

  const watches = payload?.inquiry.reviewWatches ?? [];
  const options = payload?.masterOptions;

  const updateDraft = (watchId: number, updater: (current: WatchDraft) => WatchDraft) => {
    setDrafts((current) => current[watchId] ? { ...current, [watchId]: updater(current[watchId]) } : current);
  };

  const setField = (watchId: number, field: InquiryWatchFieldName, change: Partial<FieldDraft>) => {
    updateDraft(watchId, (current) => ({
      ...current,
      fields: {
        ...current.fields,
        [field]: {
          value: current.fields[field]?.value ?? "",
          confirmationStatus: current.fields[field]?.confirmationStatus ?? "PENDING",
          source: current.fields[field]?.source ?? "MANUAL",
          ...change,
          ...(change.value !== undefined && change.value !== current.fields[field]?.value ? { source: "MANUAL" as const } : {}),
        },
      },
    }));
  };

  const selectMaster = (
    watchId: number,
    key: keyof WatchDraft["masterSelections"],
    id: number | null,
    field: InquiryWatchFieldName,
    value: string,
    resetKeys: Array<keyof WatchDraft["masterSelections"]> = [],
  ) => {
    updateDraft(watchId, (current) => ({
      ...current,
      masterSelections: { ...current.masterSelections, ...Object.fromEntries(resetKeys.map((resetKey) => [resetKey, null])), [key]: id },
      fields: value ? { ...current.fields, [field]: { value, confirmationStatus: "CONFIRMED", source: "MANUAL" } } : current.fields,
    }));
  };

  const statusFor = (watch: ReviewWatch, draft: WatchDraft) => {
    const pendingCount = INQUIRY_WATCH_FIELDS.filter((field) => draft.fields[field]?.value && draft.fields[field]?.confirmationStatus !== "CONFIRMED").length;
    const missingCount = stringList(watch.missingInformation).length;
    return pendingCount + missingCount === 0 && Object.values(draft.fields).some((field) => field.value)
      ? { label: "確認済み", className: "bg-emerald-100 text-emerald-800" }
      : { label: `未確認 ${pendingCount + missingCount}項目`, className: "bg-amber-100 text-amber-800" };
  };

  async function saveWatch(watch: ReviewWatch) {
    const draft = drafts[watch.id];
    if (!draft) return;
    setSavingWatchId(watch.id);
    setError(null);
    setNotice(null);
    try {
      const fieldValues = INQUIRY_WATCH_FIELDS.flatMap((field) => {
        const value = draft.fields[field];
        return value?.value.trim() ? [{ field, value: value.value, confirmationStatus: value.confirmationStatus }] : [];
      });
      const response = await fetch(`/api/inquiries/${inquiryId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchId: watch.id, fieldValues, masterSelections: draft.masterSelections }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存できませんでした。");
      setNotice(`時計${watch.position}の確認内容を保存しました。`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存できませんでした。");
    } finally {
      setSavingWatchId(null);
    }
  }

  async function registerMaster(watch: ReviewWatch, kind: RegistrationKind, value: string, parentId: number | null) {
    setSavingWatchId(watch.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/inquiries/${inquiryId}/review/master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchId: watch.id, kind, value, parentId, confirm: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "masterを登録できませんでした。");
      setNotice(`${value}を明示登録し、時計${watch.position}へ紐付けました。`);
      await load();
    } catch (registrationError) {
      setError(registrationError instanceof Error ? registrationError.message : "masterを登録できませんでした。");
    } finally {
      setSavingWatchId(null);
    }
  }

  const togglePromotionWatch = (watchId: number) => {
    setSelectedPromotionWatchIds((current) => current.includes(watchId) ? current.filter((id) => id !== watchId) : [...current, watchId]);
  };

  async function promoteSelectedWatches() {
    if (!selectedCustomerId || selectedPromotionWatchIds.length === 0) {
      setError("顧客と昇格する時計を選択してください。");
      return;
    }
    if (!window.confirm(`${selectedPromotionWatchIds.length}台の時計を正式なWatch・Repairとして作成します。未保存の編集内容は先に保存してください。`)) return;
    setPromoting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/inquiries/${inquiryId}/promotion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: selectedCustomerId, watchIds: selectedPromotionWatchIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "昇格できませんでした。");
      setNotice(data.deduplicated ? `${data.promotions.length}台はすでに昇格済みです。既存案件を確認しました。` : `${data.promotions.length}台を正式案件として作成しました。`);
      setSelectedPromotionWatchIds([]);
      await load();
    } catch (promotionError) {
      setError(promotionError instanceof Error ? promotionError.message : "昇格できませんでした。");
    } finally {
      setPromoting(false);
    }
  }

  const summary = useMemo(() => watches.map((watch) => ({
    watch,
    status: drafts[watch.id] ? statusFor(watch, drafts[watch.id]) : null,
  })), [drafts, watches]);

  if (loading) return <div className="p-6 text-sm text-zinc-500">Inquiry確認情報を読み込んでいます…</div>;
  if (error && !payload) return <div className="p-6 text-sm text-red-700">{error}</div>;
  if (!payload || !options) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <header className="rounded-lg border border-blue-100 bg-blue-50 p-5">
        <p className="text-sm font-medium text-blue-700">Inquiry #{payload.inquiry.id} · 正式登録前の確認</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">時計情報の確認</h1>
        <p className="mt-2 text-sm text-zinc-600">ここで保存するのは確認用のInquiryWatchです。Watch・Repair・masterは作成しません。</p>
        {payload.inquiry.conversationSummary && <p className="mt-3 rounded bg-white/70 p-3 text-sm text-zinc-700">{payload.inquiry.conversationSummary}</p>}
      </header>

      {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">正式案件への昇格</CardTitle>
          <p className="text-sm text-zinc-600">顧客と時計を選択後、すべての選択時計を事前検証してから一括で作成します。AI候補や未確認のmasterは昇格しません。</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>顧客</Label>
            <div className="flex flex-wrap gap-2"><Input className="max-w-sm" value={customerSearch} placeholder="既存顧客を検索" onChange={(event) => setCustomerSearch(event.target.value)} /><Button type="button" variant="outline" onClick={() => void loadPromotionCustomers(customerSearch).catch((searchError) => setError(searchError instanceof Error ? searchError.message : "顧客を検索できませんでした。"))}>検索</Button></div>
            <p className="text-xs text-zinc-500">LINE IDが完全一致する既存顧客のみを自動候補にします。新規顧客はこの画面では作成しません。</p>
            {promotionCustomers.length === 0 ? <p className="rounded border border-dashed p-3 text-sm text-zinc-500">候補がありません。既存顧客を検索して選択してください。</p> : <div className="grid gap-2 sm:grid-cols-2">{promotionCustomers.map((customer) => <label key={customer.id} className={`cursor-pointer rounded border p-3 text-sm ${selectedCustomerId === customer.id ? "border-blue-500 bg-blue-50" : "border-zinc-200"}`}><input className="mr-2" type="radio" name="promotion-customer" checked={selectedCustomerId === customer.id} onChange={() => setSelectedCustomerId(customer.id)} />{customer.companyName || customer.name}<span className="ml-2 text-xs text-zinc-500">#{customer.id}{customer.phone ? ` ・${customer.phone}` : ""}</span></label>)}</div>}
          </div>
          <div className="space-y-2">
            <Label>昇格する時計</Label>
            {watches.filter((watch) => !watch.promotedAt).map((watch) => <label key={watch.id} className="flex cursor-pointer items-center gap-2 rounded border border-zinc-200 p-3 text-sm"><input type="checkbox" checked={selectedPromotionWatchIds.includes(watch.id)} onChange={() => togglePromotionWatch(watch.id)} />時計{watch.position}{watch.label ? ` ・${watch.label}` : ""}</label>)}
            {watches.every((watch) => watch.promotedAt) && <p className="text-sm text-zinc-500">すべての時計が昇格済みです。</p>}
          </div>
          <Button type="button" disabled={promoting || !selectedCustomerId || selectedPromotionWatchIds.length === 0} onClick={() => void promoteSelectedWatches()}>{promoting ? "昇格中…" : `${selectedPromotionWatchIds.length}台を正式案件へ昇格`}</Button>
        </CardContent>
      </Card>

      {watches.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-zinc-500">確認対象の時計がまだありません。AI解析結果を保存すると、ここに確認用の時計が作成されます。</CardContent></Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {summary.map(({ watch, status }) => (
              <Button key={watch.id} type="button" variant={openWatchId === watch.id ? "default" : "outline"} size="sm" onClick={() => setOpenWatchId(watch.id)}>
                時計{watch.position} {status?.label}
              </Button>
            ))}
          </div>

          {watches.map((watch) => {
            const draft = drafts[watch.id];
            if (!draft) return null;
            const isOpen = openWatchId === watch.id;
            const status = statusFor(watch, draft);
            const models = options.models.filter((model) => model.brandId === draft.masterSelections.brandId);
            const references = options.references.filter((reference) => reference.modelId === draft.masterSelections.modelId);
            const calibers = draft.caliberMakerId ? options.calibers.filter((caliber) => caliber.brandId === draft.caliberMakerId) : [];
            const baseCalibers = draft.baseCaliberMakerId ? options.calibers.filter((caliber) => caliber.brandId === draft.baseCaliberMakerId) : [];
            const candidatesByField = new Map<InquiryWatchFieldName, Candidate[]>();
            for (const candidate of watch.sourceAiWatch?.candidates ?? []) {
              candidatesByField.set(candidate.field, [...(candidatesByField.get(candidate.field) ?? []), candidate]);
            }
            return (
              <Card key={watch.id}>
                <CardHeader className="cursor-pointer gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between" onClick={() => setOpenWatchId(isOpen ? null : watch.id)}>
                  <div>
                    <CardTitle className="text-lg">時計{watch.position}{watch.label ? ` · ${watch.label}` : ""}</CardTitle>
                    {watch.summary && <p className="mt-1 text-sm text-zinc-600">{watch.summary}</p>}
                  </div>
                  <div className="flex items-center gap-2"><Badge className={watch.promotedAt ? "bg-blue-100 text-blue-800" : status.className}>{watch.promotedAt ? "昇格済み" : status.label}</Badge>{isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="space-y-6">
                    {stringList(watch.missingInformation).length > 0 && <InfoList title="未確認・不足情報" values={stringList(watch.missingInformation)} tone="amber" />}
                    {stringList(watch.missingPhotos).length > 0 && <InfoList title="不足写真" values={stringList(watch.missingPhotos)} tone="amber" />}
                    {stringList(watch.faults).length > 0 && <InfoList title="不具合候補" values={stringList(watch.faults)} />}
                    {stringList(watch.requestedWork).length > 0 && <InfoList title="依頼内容" values={stringList(watch.requestedWork)} />}

                    <section className="space-y-4">
                      <h2 className="font-semibold text-zinc-800">時計情報</h2>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2"><MasterSelect label="ブランド（既存master）" value={draft.masterSelections.brandId} options={options.brands.map((brand) => ({ id: brand.id, label: masterLabel(brand) }))} onChange={(id) => {
                          const item = options.brands.find((brand) => brand.id === id);
                          selectMaster(watch.id, "brandId", id, "BRAND", item ? masterLabel(item) : "", ["modelId", "referenceId", "caseReferenceId"]);
                        }} /><ExplicitMasterRegistration kind="BRAND" value={draft.fields.BRAND?.value ?? ""} selectedId={draft.masterSelections.brandId} onConfirm={() => void registerMaster(watch, "BRAND", draft.fields.BRAND?.value ?? "", null)} /></div>
                        <div className="space-y-2"><MasterSelect label="モデル（既存master）" value={draft.masterSelections.modelId} options={models.map((model) => ({ id: model.id, label: masterLabel(model) }))} disabled={!draft.masterSelections.brandId} emptyLabel="先にブランドを選択" onChange={(id) => {
                          const item = models.find((model) => model.id === id);
                          selectMaster(watch.id, "modelId", id, "MODEL", item ? masterLabel(item) : "", ["referenceId", "caseReferenceId"]);
                        }} /><ExplicitMasterRegistration kind="MODEL" value={draft.fields.MODEL?.value ?? ""} selectedId={draft.masterSelections.modelId} parentLabel="Brand" parentId={draft.masterSelections.brandId} onConfirm={() => void registerMaster(watch, "MODEL", draft.fields.MODEL?.value ?? "", draft.masterSelections.brandId)} /></div>
                        <div className="space-y-2"><MasterSelect label="Ref（既存master）" value={draft.masterSelections.referenceId} options={references.map((reference) => ({ id: reference.id, label: reference.name }))} disabled={!draft.masterSelections.modelId} emptyLabel="先にモデルを選択" onChange={(id) => {
                          const item = references.find((reference) => reference.id === id);
                          selectMaster(watch.id, "referenceId", id, "PRODUCT_REF", item?.name ?? "");
                        }} /><ExplicitMasterRegistration kind="REFERENCE" value={draft.fields.PRODUCT_REF?.value ?? ""} selectedId={draft.masterSelections.referenceId} parentLabel="Model" parentId={draft.masterSelections.modelId} onConfirm={() => void registerMaster(watch, "REFERENCE", draft.fields.PRODUCT_REF?.value ?? "", draft.masterSelections.modelId)} /></div>
                        <div className="space-y-2"><MasterSelect label="ケースRef（既存master）" value={draft.masterSelections.caseReferenceId} options={references.map((reference) => ({ id: reference.id, label: reference.name }))} disabled={!draft.masterSelections.modelId} emptyLabel="先にモデルを選択" onChange={(id) => {
                          const item = references.find((reference) => reference.id === id);
                          selectMaster(watch.id, "caseReferenceId", id, "CASE_REF", item?.name ?? "");
                        }} /><ExplicitMasterRegistration kind="CASE_REFERENCE" value={draft.fields.CASE_REF?.value ?? ""} selectedId={draft.masterSelections.caseReferenceId} parentLabel="Model" parentId={draft.masterSelections.modelId} onConfirm={() => void registerMaster(watch, "CASE_REFERENCE", draft.fields.CASE_REF?.value ?? "", draft.masterSelections.modelId)} /></div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2"><CaliberSelect title="Cal" makerId={draft.caliberMakerId} caliberId={draft.masterSelections.caliberId} brands={options.brands} calibers={calibers} onMakerChange={(makerId) => updateDraft(watch.id, (current) => ({ ...current, caliberMakerId: makerId, masterSelections: { ...current.masterSelections, caliberId: null } }))} onCaliberChange={(id) => {
                          const item = calibers.find((caliber) => caliber.id === id);
                          selectMaster(watch.id, "caliberId", id, "CALIBER", item ? masterLabel(item) : "");
                        }} /><ExplicitMasterRegistration kind="CALIBER" value={draft.fields.CALIBER?.value ?? ""} selectedId={draft.masterSelections.caliberId} parentLabel="メーカー" parentId={draft.caliberMakerId} onConfirm={() => void registerMaster(watch, "CALIBER", draft.fields.CALIBER?.value ?? "", draft.caliberMakerId)} /></div>
                        <div className="space-y-2"><CaliberSelect title="Base Cal" makerId={draft.baseCaliberMakerId} caliberId={draft.masterSelections.baseCaliberId} brands={options.brands} calibers={baseCalibers} onMakerChange={(makerId) => updateDraft(watch.id, (current) => ({ ...current, baseCaliberMakerId: makerId, masterSelections: { ...current.masterSelections, baseCaliberId: null } }))} onCaliberChange={(id) => {
                          const item = baseCalibers.find((caliber) => caliber.id === id);
                          selectMaster(watch.id, "baseCaliberId", id, "BASE_CALIBER", item ? masterLabel(item) : "");
                        }} /><ExplicitMasterRegistration kind="BASE_CALIBER" value={draft.fields.BASE_CALIBER?.value ?? ""} selectedId={draft.masterSelections.baseCaliberId} parentLabel="メーカー" parentId={draft.baseCaliberMakerId} onConfirm={() => void registerMaster(watch, "BASE_CALIBER", draft.fields.BASE_CALIBER?.value ?? "", draft.baseCaliberMakerId)} /></div>
                      </div>
                    </section>

                    <section className="space-y-4">
                      <h2 className="font-semibold text-zinc-800">候補の確認・修正</h2>
                      <div className="grid gap-4 lg:grid-cols-2">
                        {INQUIRY_WATCH_FIELDS.map((field) => <ReviewField key={field} field={field} draft={draft.fields[field]} candidates={candidatesByField.get(field) ?? []} onChange={(change) => setField(watch.id, field, change)} />)}
                      </div>
                    </section>

                    <div className="flex justify-end border-t pt-4"><Button type="button" onClick={() => void saveWatch(watch)} disabled={savingWatchId === watch.id}><Save className="mr-2 h-4 w-4" />{savingWatchId === watch.id ? "保存中…" : "この時計の確認内容を保存"}</Button></div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MasterSelect({ label, value, options, disabled, emptyLabel, onChange }: { label: string; value: number | null; options: Array<{ id: number; label: string }>; disabled?: boolean; emptyLabel?: string; onChange: (id: number | null) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}><option value="">{emptyLabel ?? "未選択"}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>;
}

function CaliberSelect({ title, makerId, caliberId, brands, calibers, onMakerChange, onCaliberChange }: { title: string; makerId: number | null; caliberId: number | null; brands: ReviewPayload["masterOptions"]["brands"]; calibers: ReviewPayload["masterOptions"]["calibers"]; onMakerChange: (id: number | null) => void; onCaliberChange: (id: number | null) => void }) {
  return <div className="rounded-md border border-zinc-200 p-4"><p className="mb-3 font-medium text-zinc-800">{title}</p><div className="grid gap-3 sm:grid-cols-2"><MasterSelect label="メーカー" value={makerId} options={brands.map((brand) => ({ id: brand.id, label: masterLabel(brand) }))} onChange={onMakerChange} /><MasterSelect label={title} value={caliberId} options={calibers.map((caliber) => ({ id: caliber.id, label: masterLabel(caliber) }))} disabled={!makerId} emptyLabel="先にメーカーを選択" onChange={onCaliberChange} /></div></div>;
}

function ExplicitMasterRegistration({ kind, value, selectedId, parentLabel, parentId, onConfirm }: { kind: RegistrationKind; value: string; selectedId: number | null; parentLabel?: string; parentId?: number | null; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const labels: Record<RegistrationKind, string> = { BRAND: "Brand", MODEL: "Model", REFERENCE: "Ref", CASE_REFERENCE: "ケースRef", CALIBER: "Cal", BASE_CALIBER: "Base Cal" };
  if (selectedId || !value.trim()) return null;
  const needsParent = kind !== "BRAND";
  if (needsParent && !parentId) return <p className="text-xs text-zinc-500">新規{labels[kind]}登録には先に{parentLabel}を選択・保存してください。</p>;
  if (!confirming) return <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}><Plus className="mr-1 h-3.5 w-3.5" />新規{labels[kind]}として登録</Button>;
  return <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><p className="font-medium">登録内容を確認</p><p className="mt-1">{labels[kind]}: <span className="font-semibold">{value}</span>{parentLabel ? ` ／ ${parentLabel}は選択済み` : ""}</p><p className="mt-1 text-xs">既存の完全一致候補があれば、新規作成せず既存masterを紐付けます。</p><div className="mt-3 flex gap-2"><Button type="button" size="sm" onClick={onConfirm}>確認して登録</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>戻る</Button></div></div>;
}

function ReviewField({ field, draft, candidates, onChange }: { field: InquiryWatchFieldName; draft?: FieldDraft; candidates: Candidate[]; onChange: (change: Partial<FieldDraft>) => void }) {
  const value = draft?.value ?? "";
  const confirmed = draft?.confirmationStatus === "CONFIRMED";
  return <div className="rounded-md border border-zinc-200 p-4"><div className="mb-2 flex items-center justify-between gap-2"><Label htmlFor={`field-${field}`}>{FIELD_LABELS[field]}</Label><div className="flex gap-1"><Badge variant={draft?.source === "MANUAL" ? "outline" : "secondary"}>{draft?.source === "MANUAL" ? "手入力" : draft?.source === "AI_CANDIDATE" ? "AI候補" : "未入力"}</Badge><Badge variant={confirmed ? "default" : "secondary"}>{confirmed ? "確定済み" : "未確定"}</Badge></div></div><Input id={`field-${field}`} value={value} placeholder="未入力" onChange={(event) => onChange({ value: event.target.value })} /><div className="mt-3 flex items-center justify-between gap-3"><Button type="button" size="sm" variant={confirmed ? "outline" : "default"} onClick={() => onChange({ confirmationStatus: confirmed ? "PENDING" : "CONFIRMED" })}><Check className="mr-1 h-3.5 w-3.5" />{confirmed ? "未確定に戻す" : "この値を確定"}</Button>{draft && <span className="text-xs text-zinc-500">{draft.confirmationStatus === "CONFIRMED" ? "AI再解析から保護" : draft.source === "MANUAL" ? "手入力値はAI再解析から保護" : "AI候補は再解析で更新可能"}</span>}</div>{candidates.length > 0 && <details className="mt-3 rounded bg-zinc-50 p-3 text-xs"><summary className="cursor-pointer font-medium text-zinc-700">AI候補・根拠（{candidates.length}件）</summary><div className="mt-2 space-y-2">{candidates.map((candidate) => <div key={candidate.id} className="border-l-2 border-blue-200 pl-2"><div className="flex flex-wrap items-center gap-1.5"><button type="button" className="font-medium text-blue-700 underline" onClick={() => onChange({ value: candidate.value, confirmationStatus: "PENDING" })}>{candidate.value}</button>{candidate.confidence && <Badge variant="outline">AI推定 {CONFIDENCE_LABELS[candidate.confidence]}</Badge>}<span className="text-zinc-500">{SOURCE_LABELS[candidate.sourceType]}</span></div>{candidate.evidence && <p className="mt-1 text-zinc-600">根拠: {candidate.evidence}</p>}{candidate.observedText && <p className="mt-1 text-zinc-500">観測: {candidate.observedText}</p>}</div>)}</div></details>}</div>;
}

function InfoList({ title, values, tone }: { title: string; values: string[]; tone?: "amber" }) {
  return <div className={`rounded-md p-4 ${tone === "amber" ? "bg-amber-50 text-amber-900" : "bg-zinc-50 text-zinc-800"}`}><p className="text-sm font-semibold">{title}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></div>;
}
