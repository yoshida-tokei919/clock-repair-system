"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getB2bBrandMasters, getB2bModelMasters } from "@/actions/b2b-intake-master-actions";
import { changeBrand, changeModel, changeRef, matchingModel, modelCacheKey, optionsForRow, type ModelChoice, type RefChoice, type CaliberChoice } from "@/lib/b2b-intake-drilldown";

// Keep the operator-facing cap in sync with the server validation.
const B2B_BATCH_LIMIT = 30;

type Row = {
  key: number; brandId: string; partnerRef: string; endUserName: string;
  model: string; ref: string; serial: string; caliber: string; note: string;
};
type Result = { partnerId: number; repairs: Array<{ id: number; inquiryNumber: string }> };
type Props = {
  partners: Array<{ id: number; name: string; companyName: string | null; prefix: string | null }>;
  brands: Array<{ id: number; name: string; nameJp: string }>;
};

let nextKey = 1;
const newRow = (): Row => ({
  key: nextKey++, brandId: "", partnerRef: "", endUserName: "", model: "",
  ref: "", serial: "", caliber: "", note: "",
});

const inputClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function B2bBatchIntakeForm({ partners, brands }: Props) {
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || uncertain || result) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/repairs/b2b-intake", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: Number(partnerId),
          rows: rows.map(({ key: _key, brandId, ...rest }) => ({ ...rest, brandId: Number(brandId) })),
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
    </section> : <form onSubmit={submit} className="space-y-5">
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
        return <section key={row.key} className="rounded-lg border bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">時計 {index + 1}</h2>
          <button type="button" className="text-sm text-red-700 disabled:opacity-40" disabled={rows.length === 1 || busy || uncertain} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>この行を削除</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">取引先管理番号<input className={`${inputClass} mt-1`} maxLength={200} value={row.partnerRef} onChange={(e) => updateRow(row.key, "partnerRef", e.target.value)} disabled={busy || uncertain} /></label>
          <label className="text-sm">エンドユーザー名<input className={`${inputClass} mt-1`} maxLength={200} value={row.endUserName} onChange={(e) => updateRow(row.key, "endUserName", e.target.value)} disabled={busy || uncertain} /></label>
          <label className="text-sm">ブランド *<select className={`${inputClass} mt-1`} value={row.brandId} onChange={(e) => updateWatchField(row.key, "brandId", e.target.value)} required disabled={busy || uncertain}>
            <option value="">選択してください</option>
            {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.nameJp || brand.name}</option>)}
          </select></label>
          <label className="text-sm">モデル<input className={`${inputClass} mt-1`} list={`b2b-model-${row.key}`} maxLength={200} value={row.model} onChange={(e) => updateWatchField(row.key, "model", e.target.value)} disabled={busy || uncertain || !row.brandId} placeholder="既存候補から選択、または入力" /><datalist id={`b2b-model-${row.key}`}>{models.map((model) => <option key={model.id} value={model.name} label={model.nameJp || model.name} />)}</datalist></label>
          <label className="text-sm">Ref<input className={`${inputClass} mt-1`} list={`b2b-ref-${row.key}`} maxLength={200} value={row.ref} onChange={(e) => updateWatchField(row.key, "ref", e.target.value)} disabled={busy || uncertain || !row.brandId} placeholder="既存候補から選択、または入力" /><datalist id={`b2b-ref-${row.key}`}>{refs.map((ref) => <option key={ref.name} value={ref.name} label={ref.caliber ? `Cal ${ref.caliber.name}` : ref.name} />)}</datalist></label>
          <label className="text-sm">シリアル<input className={`${inputClass} mt-1`} maxLength={200} value={row.serial} onChange={(e) => updateRow(row.key, "serial", e.target.value)} disabled={busy || uncertain} /></label>
          <label className="text-sm">Cal<input className={`${inputClass} mt-1`} list={`b2b-cal-${row.key}`} maxLength={200} value={row.caliber} onChange={(e) => updateRow(row.key, "caliber", e.target.value)} disabled={busy || uncertain || !row.brandId} placeholder="既存候補から選択、または入力" /><datalist id={`b2b-cal-${row.key}`}>{calibers.map((caliber) => <option key={caliber.name} value={caliber.name} />)}</datalist></label>
          <label className="text-sm sm:col-span-2">受付・依頼メモ<textarea className={`${inputClass} mt-1`} rows={2} maxLength={1000} value={row.note} onChange={(e) => updateRow(row.key, "note", e.target.value)} disabled={busy || uncertain} /></label>
        </div>
      </section>})}

      {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex gap-3">
        <button type="button" className="rounded-md border px-4 py-2 text-sm disabled:opacity-40" disabled={rows.length >= B2B_BATCH_LIMIT || busy || uncertain} onClick={() => setRows((current) => [...current, newRow()])}>時計を追加</button>
        <button type="submit" className="rounded-md bg-slate-900 px-5 py-2 text-sm text-white disabled:opacity-40" disabled={!partners.length || busy || uncertain}>{busy ? "登録中..." : `${rows.length}本を一括受付`}</button>
      </div>
    </form>}
  </div>;
}
