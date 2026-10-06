"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { getB2bBrandMasters, getB2bModelMasters } from "@/actions/b2b-intake-master-actions";
import { changeBrand, changeModel, changeRef, filterIntakeChoices, intakeComboboxKeyDecision, matchingModel, modelCacheKey, optionsForRow, shouldPreventB2bBatchEnter, type ModelChoice, type RefChoice, type CaliberChoice, type SearchChoice } from "@/lib/b2b-intake-drilldown";

// Keep the operator-facing cap in sync with the server validation.
const B2B_BATCH_LIMIT = 30;

type Row = {
  key: number; brandId: string; brandName: string; partnerRef: string; endUserName: string;
  model: string; ref: string; serial: string; caliber: string;
  movementMaker: string; movementMakerId: string; movementCaliber: string;
  baseMovementMaker: string; baseMovementMakerId: string; baseMovementCaliber: string; workSummary: string;
};
type Result = { partnerId: number; repairs: Array<{ id: number; inquiryNumber: string }> };
type Props = {
  partners: Array<{ id: number; name: string; companyName: string | null; prefix: string | null }>;
  brands: BrandChoice[];
  movementMakers: BrandChoice[];
  movementCalibers: Array<{ id: number; name: string; nameJp: string | null; nameEn: string | null; brandId: number | null }>;
};
type BrandChoice = { id: number; name: string; nameJp: string; nameEn: string | null; kana: string | null;
  aliases: Array<{ alias: string }> };

let nextKey = 1;
const newRow = (): Row => ({
  key: nextKey++, brandId: "", brandName: "", partnerRef: "", endUserName: "", model: "",
  ref: "", serial: "", caliber: "", movementMaker: "", movementMakerId: "", movementCaliber: "",
  baseMovementMaker: "", baseMovementMakerId: "", baseMovementCaliber: "", workSummary: "",
});

const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function IntakeCombobox({ value, choices, onChange, onSelect, disabled, required = false, placeholder }: {
  value: string; choices: SearchChoice[]; onChange: (value: string) => void;
  onSelect?: (choice: SearchChoice) => void; disabled?: boolean; required?: boolean; placeholder?: string;
}) {
  const [listState, setListState] = useState({ open: false, activeIndex: -1 });
  const { open, activeIndex } = listState;
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!container.current?.contains(event.target as Node)) setListState({ open: false, activeIndex: -1 }); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => { setListState((current) => ({ ...current, activeIndex: -1 })); }, [value, choices]);
  useEffect(() => {
    if (open && activeIndex >= 0) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId, open]);
  const filtered = filterIntakeChoices(choices, value).slice(0, 100);
  const selectChoice = (choice: SearchChoice) => {
    onChange(choice.value);
    onSelect?.(choice);
    setListState({ open: false, activeIndex: -1 });
  };
  return <div ref={container} className="relative mt-1">
    <input className={inputClass} role="combobox" aria-autocomplete="list" aria-expanded={open}
      aria-controls={listId} aria-activedescendant={open && activeIndex >= 0 && activeIndex < filtered.length ? `${listId}-${activeIndex}` : undefined}
      value={value} maxLength={200} required={required} disabled={disabled} placeholder={placeholder}
      onFocus={() => setListState((current) => ({ ...current, open: true }))}
      onChange={(event) => { onChange(event.target.value); setListState({ open: true, activeIndex: -1 }); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if (event.key !== "Escape" && event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
        const decision = intakeComboboxKeyDecision(listState, event.key, filtered.length);
        if (event.key !== "Enter") {
          if (event.key !== "Escape") event.preventDefault();
          setListState(decision.state);
        }
        if (decision.selectedIndex !== null) { event.preventDefault(); selectChoice(filtered[decision.selectedIndex]); }
      }} />
    {open && <div id={listId} role="listbox" className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
      {filtered.length ? filtered.map((choice, index) =>
        <button id={`${listId}-${index}`} key={`${choice.id ?? choice.value}-${index}`} type="button" role="option" aria-selected={activeIndex === index}
          className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${activeIndex === index ? "bg-blue-50" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectChoice(choice)}>
          {choice.label}
        </button>) : <p className="px-3 py-2 text-sm text-muted-foreground">候補なし・自由入力できます</p>}
    </div>}
  </div>;
}

const brandChoices = (brands: BrandChoice[]): SearchChoice[] => brands.map((brand) => ({
  id: brand.id, value: brand.name, label: brand.nameJp || brand.name,
  searchKeys: [brand.name, brand.nameJp, brand.nameEn, brand.kana, ...brand.aliases.map((alias) => alias.alias)],
}));

export function B2bBatchIntakeForm({ partners, brands, movementMakers, movementCalibers }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [partnerId, setPartnerId] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [modelsByBrand, setModelsByBrand] = useState<Record<number, ModelChoice[]>>({});
  const [calibersByBrand, setCalibersByBrand] = useState<Record<number, CaliberChoice[]>>({});
  const [refsByModel, setRefsByModel] = useState<Record<string, RefChoice[]>>({});
  const [calibersByModel, setCalibersByModel] = useState<Record<string, CaliberChoice[]>>({});
  const requestedBrands = useRef(new Set<number>());
  const requestedModels = useRef(new Set<string>());

  useEffect(() => {
    for (const row of rows) {
      const brandId = Number(row.brandId);
      if (!brandId || requestedBrands.current.has(brandId)) continue;
      requestedBrands.current.add(brandId);
      getB2bBrandMasters(brandId).then(({ models, calibers }) => {
        setModelsByBrand((current) => ({ ...current, [brandId]: models }));
        setCalibersByBrand((current) => ({ ...current, [brandId]: calibers }));
      }).catch(() => {
        requestedBrands.current.delete(brandId);
        setError("時計マスター候補を取得できませんでした。手入力で続けられます。ブランドを選び直すと再試行します。");
      });
    }
  }, [rows]);

  useEffect(() => {
    for (const row of rows) {
      const brandId = Number(row.brandId);
      const model = matchingModel(modelsByBrand[brandId] ?? [], row.model);
      if (!model) continue;
      const cacheKey = modelCacheKey(brandId, model.id);
      if (requestedModels.current.has(cacheKey)) continue;
      requestedModels.current.add(cacheKey);
      getB2bModelMasters(brandId, model.id)
        .then(({ refs, calibers }) => {
          setRefsByModel((current) => ({ ...current, [cacheKey]: refs }));
          setCalibersByModel((current) => ({ ...current, [cacheKey]: calibers }));
        })
        .catch(() => {
          requestedModels.current.delete(cacheKey);
          setError("Ref・Cal候補を取得できませんでした。手入力で続けられます。モデルを選び直すと再試行します。");
        });
    }
  }, [rows, modelsByBrand]);

  function updateRow(key: number, field: Exclude<keyof Row, "key">, value: string) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  }

  function updateWatchField(key: number, field: "brandId" | "model" | "ref", value: string) {
    setRows((current) => current.map((row) => {
      if (row.key !== key) return row;
      if (field === "brandId") return changeBrand(row, value);
      if (field === "model") return changeModel(row, value);
      const brandId = Number(row.brandId);
      const model = matchingModel(modelsByBrand[brandId] ?? [], row.model);
      return changeRef(row, value, model ? refsByModel[modelCacheKey(brandId, model.id)] ?? [] : []);
    }));
  }

  function updateBrand(key: number, name: string, id = "") {
    setRows((current) => current.map((row) => row.key === key
      ? { ...changeBrand(row, id), brandName: name } : row));
  }

  function updateMaker(key: number, field: "movementMaker" | "baseMovementMaker", value: string, id = "") {
    setRows((current) => current.map((row) => row.key === key ? {
      ...row, [field]: value, [field === "movementMaker" ? "movementMakerId" : "baseMovementMakerId"]: id,
      [field === "movementMaker" ? "movementCaliber" : "baseMovementCaliber"]: "",
    } : row));
  }

  async function submit() {
    if (busy || uncertain || result) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/repairs/b2b-intake", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: Number(partnerId),
          rows: rows.map(({ key: _key, brandId, movementMakerId: _movementMakerId,
            baseMovementMakerId: _baseMovementMakerId, ...rest }) => ({ ...rest, brandId: brandId ? Number(brandId) : null })),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status >= 500) setUncertain(true);
        setError(body.error || "一括受付に失敗しました。");
        return;
      }
      if (!Array.isArray(body.repairs) || body.repairs.length !== rows.length) {
        setUncertain(true);
        setError("登録結果を確認できません。案件一覧で確認してください。同じバッチを再送しないでください。");
        return;
      }
      setResult(body as Result);
      router.refresh();
    } catch {
      setUncertain(true);
      setError("通信結果を確認できません。案件一覧で確認してください。同じバッチを再送しないでください。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mx-auto max-w-5xl space-y-6 p-8">
    <div>
      <Link href="/repairs" className="text-sm text-blue-700 hover:underline">← 修理案件一覧</Link>
      <h1 className="mt-2 text-3xl font-bold">B2B一括受付</h1>
      <p className="mt-2 text-sm text-muted-foreground">現物を確認し、同じ取引先の時計をまとめて登録します。最大{B2B_BATCH_LIMIT}本。</p>
    </div>

    {result ? <section className="rounded-lg border border-green-300 bg-green-50 p-5" aria-live="polite">
      <h2 className="text-lg font-semibold">{result.repairs.length}本の受付が完了しました</h2>
      <ul className="mt-3 space-y-1">
        {result.repairs.map((repair) => <li key={repair.id}>
          <Link className="text-blue-700 underline" href={`/repairs/${repair.id}`}>{repair.inquiryNumber} — 案件を開く</Link>
        </li>)}
      </ul>
      <button type="button" className="mt-4 rounded-md border bg-white px-4 py-2 text-sm" onClick={() => {
        setResult(null); setPartnerId(""); setRows([newRow()]); setError("");
      }}>別のバッチを受付</button>
    </section> : <form ref={formRef} onSubmit={(event) => event.preventDefault()}
      onKeyDownCapture={(event) => {
        if (shouldPreventB2bBatchEnter(event.key, (event.target as HTMLElement).tagName,
          event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault();
      }} className="space-y-5">
      <div className="rounded-lg border bg-white p-4">
        <label className="block text-sm font-medium" htmlFor="partner">取引先（既存） *</label>
        <select id="partner" className={`${inputClass} mt-2`} value={partnerId} onChange={(event) => setPartnerId(event.target.value)} required disabled={busy || uncertain}>
          <option value="">取引先を選択</option>
          {partners.map((partner) => <option key={partner.id} value={partner.id}>
            {partner.companyName || partner.name}{partner.prefix ? ` (${partner.prefix})` : ""}
          </option>)}
        </select>
        {!partners.length && <p className="mt-2 text-sm text-red-700">登録済みの取引先がありません。</p>}
      </div>

      {rows.map((row, index) => {
        const { models, refs, calibers } = optionsForRow(row, modelsByBrand, refsByModel, calibersByBrand, calibersByModel);
        const movementOptions = movementCalibers.filter((caliber) => row.movementMakerId
          ? caliber.brandId === Number(row.movementMakerId) : !row.movementMaker ? caliber.brandId === null : false);
        const baseOptions = movementCalibers.filter((caliber) => row.baseMovementMakerId
          ? caliber.brandId === Number(row.baseMovementMakerId) : !row.baseMovementMaker ? caliber.brandId === null : false);
        const caliberChoices = (values: typeof movementCalibers): SearchChoice[] => values.map((caliber) => ({
          id: caliber.id, value: caliber.name, label: caliber.name,
          searchKeys: [caliber.nameJp, caliber.nameEn],
        }));
        return <section key={row.key} className="rounded-lg border bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">時計 {index + 1}</h2>
          <button type="button" className="text-sm text-red-700 disabled:opacity-40" disabled={rows.length === 1 || busy || uncertain} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>この行を削除</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">取引先管理番号<input className={`${inputClass} mt-1`} maxLength={200} value={row.partnerRef} onChange={(e) => updateRow(row.key, "partnerRef", e.target.value)} disabled={busy || uncertain} /></label>
          <label className="text-sm">エンドユーザー名<input className={`${inputClass} mt-1`} maxLength={200} value={row.endUserName} onChange={(e) => updateRow(row.key, "endUserName", e.target.value)} disabled={busy || uncertain} /></label>
          <label className="text-sm">ブランド *<IntakeCombobox value={row.brandName} choices={brandChoices(brands)}
            onChange={(name) => updateBrand(row.key, name)} onSelect={(choice) => updateBrand(row.key, choice.value, String(choice.id))}
            required disabled={busy || uncertain} placeholder="ブランドを検索・入力" /></label>
          <label className="text-sm">モデル<IntakeCombobox value={row.model}
            choices={models.map((model) => ({ id: model.id, value: model.name, label: model.nameJp || model.name,
              searchKeys: [model.nameEn, model.nameJp] }))}
            onChange={(value) => updateWatchField(row.key, "model", value)} disabled={busy || uncertain || !row.brandName}
            placeholder="既存候補から選択、または入力" /></label>
          <label className="text-sm">Ref<IntakeCombobox value={row.ref}
            choices={refs.map((ref) => ({ value: ref.name, label: ref.name }))}
            onChange={(value) => updateWatchField(row.key, "ref", value)} disabled={busy || uncertain || !row.brandName}
            placeholder="既存候補から選択、または入力" /></label>
          <label className="text-sm">シリアル<input className={`${inputClass} mt-1`} maxLength={200} value={row.serial} onChange={(e) => updateRow(row.key, "serial", e.target.value)} disabled={busy || uncertain} /></label>
          <label className="text-sm">時計 Cal<IntakeCombobox value={row.caliber}
            choices={calibers.map((caliber) => ({ value: caliber.name, label: caliber.name }))}
            onChange={(value) => updateRow(row.key, "caliber", value)} disabled={busy || uncertain || !row.brandName}
            placeholder="既存候補から選択、または入力" /></label>
          <label className="text-sm">Calメーカー<IntakeCombobox value={row.movementMaker} choices={brandChoices(movementMakers)}
            onChange={(value) => updateMaker(row.key, "movementMaker", value)}
            onSelect={(choice) => updateMaker(row.key, "movementMaker", choice.value, String(choice.id))}
            disabled={busy || uncertain} placeholder="メーカーを検索・入力" /></label>
          <label className="text-sm">Cal<IntakeCombobox value={row.movementCaliber} choices={caliberChoices(movementOptions)}
            onChange={(value) => updateRow(row.key, "movementCaliber", value)} disabled={busy || uncertain}
            placeholder="Calを検索・入力" /></label>
          <label className="text-sm">Base Calメーカー<IntakeCombobox value={row.baseMovementMaker} choices={brandChoices(movementMakers)}
            onChange={(value) => updateMaker(row.key, "baseMovementMaker", value)}
            onSelect={(choice) => updateMaker(row.key, "baseMovementMaker", choice.value, String(choice.id))}
            disabled={busy || uncertain} placeholder="メーカーを検索・入力" /></label>
          <label className="text-sm">Base Cal<IntakeCombobox value={row.baseMovementCaliber} choices={caliberChoices(baseOptions)}
            onChange={(value) => updateRow(row.key, "baseMovementCaliber", value)} disabled={busy || uncertain}
            placeholder="Calを検索・入力" /></label>
          <label className="text-sm sm:col-span-2">依頼内容<textarea className={`${inputClass} mt-1`} rows={2} maxLength={1000}
            value={row.workSummary} onChange={(e) => updateRow(row.key, "workSummary", e.target.value)} disabled={busy || uncertain} /></label>
        </div>
      </section>})}

      {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex gap-3">
        <button type="button" className="rounded-md border px-4 py-2 text-sm disabled:opacity-40" disabled={rows.length >= B2B_BATCH_LIMIT || busy || uncertain} onClick={() => setRows((current) => [...current, newRow()])}>時計を追加</button>
        <button type="button" className="rounded-md bg-slate-900 px-5 py-2 text-sm text-white disabled:opacity-40" disabled={!partners.length || busy || uncertain}
          onClick={() => { if (formRef.current?.reportValidity()) void submit(); }}>{busy ? "登録中..." : `${rows.length}本を一括受付`}</button>
      </div>
    </form>}
  </div>;
}
