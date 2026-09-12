"use client";

import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { getWatchBrands } from "@/actions/master-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getIntakeBrandOptions,
  searchIntakeBrandOptions,
  type IntakeBrandOption,
} from "@/lib/repair-intake-brand-search";

type CustomerForm = {
  name: string;
  postalCode: string;
  prefecture: string;
  city: string;
  street: string;
  building: string;
  phone: string;
  email: string;
};

type WatchForm = {
  key: number;
  timepieceType: "WRISTWATCH" | "POCKET_WATCH" | "WALL_CLOCK" | "TABLE_CLOCK" | "OTHER";
  driveType: "" | "QUARTZ" | "MECHANICAL" | "UNKNOWN";
  brandId: string;
  modelName: string;
  brandQuery: string;
};

type TokenState = {
  valid: true;
  prefill: { name: string; postalCode: string | null; prefecture: string | null; city: string | null; street: string | null; building: string | null; phone: string | null; email: string | null } | null;
} | {
  completed: true;
  repairs: Array<{ id: number; inquiryNumber: string }>;
  count: number;
  shippingAddress: ShippingAddress | null;
};

type ShippingAddress = { recipient: string; address: string };

const EMPTY_CUSTOMER: CustomerForm = {
  name: "", postalCode: "", prefecture: "", city: "", street: "", building: "", phone: "", email: "",
};

function normalizePostalCode(value: string) {
  const normalized = value.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
  if (!/^\d{7}$/.test(normalized) && !/^\d{3}[-‐‑‒–—―－−]\d{4}$/.test(normalized)) return null;
  return normalized.replace(/[-‐‑‒–—―－−]/g, "");
}

let watchKey = 1;
function newWatch(): WatchForm {
  return {
    key: watchKey++, timepieceType: "WRISTWATCH", driveType: "", brandId: "", modelName: "", brandQuery: "",
  };
}

const timepieceOptions = [
  ["WRISTWATCH", "腕時計"],
  ["POCKET_WATCH", "懐中時計"],
  ["WALL_CLOCK", "掛時計"],
  ["TABLE_CLOCK", "置時計"],
  ["OTHER", "その他"],
] as const;

const driveOptions = [
  ["", "選択してください"],
  ["QUARTZ", "クォーツ"],
  ["MECHANICAL", "機械式"],
  ["UNKNOWN", "わからない"],
] as const;

function messageForTokenError(code?: string) {
  if (code === "EXPIRED_TOKEN") return "この送付受付リンクの有効期限が切れています。LINEから新しいリンクをご依頼ください。";
  if (code === "USED_TOKEN") return "この送付受付リンクは使用済みです。受付は完了しているため、新たに送信しないでください。";
  return "この送付受付リンクは利用できません。LINEからご確認ください。";
}

export function RepairIntakeForm({ token }: { token: string }) {
  const [customer, setCustomer] = useState<CustomerForm>(EMPTY_CUSTOMER);
  const [returnAddressSameAsCustomer, setReturnAddressSameAsCustomer] = useState(true);
  const [returnAddress, setReturnAddress] = useState<CustomerForm>(EMPTY_CUSTOMER);
  const hasCopiedCustomerToReturnAddress = useRef(false);
  const customerAddressPostalCode = useRef<string | null>(null);
  const returnAddressPostalCode = useRef<string | null>(null);
  const [watches, setWatches] = useState<WatchForm[]>([newWatch()]);
  const [brands, setBrands] = useState<IntakeBrandOption[]>([]);
  const [pageState, setPageState] = useState<"loading" | "ready" | "invalid" | "expired" | "used" | "complete">("loading");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedRepairs, setCompletedRepairs] = useState<Array<{ id: number; inquiryNumber: string }>>([]);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null);
  const [postalLookupMessage, setPostalLookupMessage] = useState<string | null>(null);
  const [returnPostalLookupMessage, setReturnPostalLookupMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/customer/intake/${encodeURIComponent(token)}`, { cache: "no-store" }),
      getWatchBrands(false),
    ]).then(async ([response, rawBrands]) => {
      if (!active) return;
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const code = body.code as string | undefined;
        setPageState(code === "EXPIRED_TOKEN" ? "expired" : code === "USED_TOKEN" ? "used" : "invalid");
        setError(messageForTokenError(code));
        return;
      }
      const state = await response.json() as TokenState;
      if ("completed" in state) {
        setCompletedRepairs(state.repairs);
        setShippingAddress(state.shippingAddress);
        setPageState("complete");
        return;
      }
      customerAddressPostalCode.current = normalizePostalCode(state.prefill?.postalCode || "");
      setCustomer((current) => ({
        ...current,
        name: current.name || state.prefill?.name || "",
        postalCode: current.postalCode || state.prefill?.postalCode || "",
        prefecture: current.prefecture || state.prefill?.prefecture || "",
        city: current.city || state.prefill?.city || "",
        street: current.street || state.prefill?.street || "",
        building: current.building || state.prefill?.building || "",
        phone: current.phone || state.prefill?.phone || "",
        email: current.email || state.prefill?.email || "",
      }));
      setBrands(getIntakeBrandOptions(rawBrands));
      setPageState("ready");
    }).catch(() => {
      if (!active) return;
      setPageState("invalid");
      setError("ページの読み込みに失敗しました。通信状態を確認して、もう一度お試しください。");
    });
    return () => { active = false; };
  }, [token]);

  function updateWatch(key: number, patch: Partial<WatchForm>) {
    setWatches((current) => current.map((watch) => watch.key === key ? { ...watch, ...patch } : watch));
  }

  function setReturnAddressSameAsCustomerWithInitialCopy(checked: boolean) {
    if (!checked && !hasCopiedCustomerToReturnAddress.current) {
      setReturnAddress({
        name: customer.name,
        postalCode: customer.postalCode,
        prefecture: customer.prefecture,
        city: customer.city,
        street: customer.street,
        building: customer.building,
        phone: customer.phone,
        email: "",
      });
      hasCopiedCustomerToReturnAddress.current = true;
      returnAddressPostalCode.current = normalizePostalCode(customer.postalCode);
    }
    setReturnAddressSameAsCustomer(checked);
  }

  async function lookupPostalCode() {
    const postalCode = normalizePostalCode(customer.postalCode);
    if (!postalCode) return;

    setPostalLookupMessage("住所を検索しています。");
    try {
      const response = await fetch(`/api/postal-code?zipcode=${postalCode}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "住所を取得できませんでした。");
      const shouldRefreshAddress = customerAddressPostalCode.current !== postalCode;
      setCustomer((current) => ({
        ...current,
        postalCode,
        prefecture: shouldRefreshAddress ? result.prefecture : current.prefecture,
        city: shouldRefreshAddress ? result.city : current.city,
        street: shouldRefreshAddress ? result.street : current.street,
      }));
      customerAddressPostalCode.current = postalCode;
      setPostalLookupMessage("住所を自動入力しました。");
    } catch (lookupError) {
      setPostalLookupMessage(lookupError instanceof Error ? lookupError.message : "住所を自動入力できませんでした。");
    }
  }

  async function lookupReturnPostalCode() {
    const postalCode = normalizePostalCode(returnAddress.postalCode);
    if (!postalCode) return;
    setReturnPostalLookupMessage("住所を検索しています。");
    try {
      const response = await fetch(`/api/postal-code?zipcode=${postalCode}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "住所を取得できませんでした。");
      const shouldRefreshAddress = returnAddressPostalCode.current !== postalCode;
      setReturnAddress((current) => ({
        ...current, postalCode,
        prefecture: shouldRefreshAddress ? result.prefecture : current.prefecture,
        city: shouldRefreshAddress ? result.city : current.city,
        street: shouldRefreshAddress ? result.street : current.street,
      }));
      returnAddressPostalCode.current = postalCode;
      setReturnPostalLookupMessage("住所を自動入力しました。");
    } catch (lookupError) {
      setReturnPostalLookupMessage(lookupError instanceof Error ? lookupError.message : "住所を取得できませんでした。");
    }
  }

  function validate() {
    const required = [customer.name, customer.postalCode, customer.prefecture, customer.city, customer.street, customer.phone];
    if (required.some((value) => !value.trim())) return "お客様情報の必須項目を入力してください。";
    if (!normalizePostalCode(customer.postalCode)) return "お客様の郵便番号は7桁で入力してください。";
    if (!returnAddressSameAsCustomer) {
      const returnRequired = [returnAddress.name, returnAddress.postalCode, returnAddress.prefecture, returnAddress.city, returnAddress.street, returnAddress.phone];
      if (returnRequired.some((value) => !value.trim())) return "返送先情報の必須項目を入力してください。";
      if (!normalizePostalCode(returnAddress.postalCode)) return "返送先の郵便番号は7桁で入力してください。";
    }
    if (watches.some((watch) => !watch.brandId || !watch.driveType)) return "すべての時計でブランドと駆動方式を選択してください。";
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/customer/intake/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          returnAddressSameAsCustomer,
          ...(!returnAddressSameAsCustomer ? { returnAddress } : {}),
          watches: watches.map(({ timepieceType, driveType, brandId, modelName }) => ({
            timepieceType, driveType, brandId: Number(brandId), modelName,
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = body.code as string | undefined;
        if (code === "USED_TOKEN") {
          const stateResponse = await fetch(`/api/customer/intake/${encodeURIComponent(token)}`, { cache: "no-store" });
          const state = await stateResponse.json().catch(() => ({}));
          if (stateResponse.ok && state.completed) {
            setCompletedRepairs(state.repairs || []);
            setShippingAddress(state.shippingAddress || null);
            setPageState("complete");
            return;
          }
          setPageState("used");
        }
        else if (code === "EXPIRED_TOKEN") setPageState("expired");
        const serverMessage = typeof body.error === "string" ? body.error : null;
        setError(code ? messageForTokenError(code) : serverMessage || "送信に失敗しました。");
        return;
      }
      setCompletedRepairs(body.repairs || []);
      setShippingAddress(body.shippingAddress || null);
      setPageState("complete");
    } catch {
      setError("送信に失敗しました。通信状態を確認して、もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (pageState === "loading") return <PageFrame><p className="py-12 text-center text-sm text-zinc-500">送付受付を準備しています…</p></PageFrame>;
  if (pageState === "invalid" || pageState === "expired" || pageState === "used") {
    return <PageFrame><section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><h1 className="text-lg font-bold">送付受付リンクについて</h1><p className="mt-2">{error}</p></section></PageFrame>;
  }
  if (pageState === "complete") {
    return <PageFrame><section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><h1 className="text-xl font-bold">送付受付が完了しました</h1><p className="mt-2 text-sm">時計を発送する際は、下記の受付番号を控えてください。</p><p className="mt-2 text-sm">時計点数: {completedRepairs.length}点</p><ul className="mt-4 space-y-2">{completedRepairs.map((repair) => <li key={repair.id} className="rounded-md bg-white px-3 py-2 font-mono font-bold">{repair.inquiryNumber}</li>)}</ul></section>{shippingAddress && <ShippingAddress address={shippingAddress} />}</PageFrame>;
  }

  return <PageFrame>
    <header className="border-b border-zinc-200 pb-5"><h1 className="text-2xl font-bold tracking-tight text-zinc-900">時計修理 送付受付</h1><p className="mt-2 text-sm leading-6 text-zinc-600">お客様情報と時計情報をご入力ください。時計1本ごとに受付番号を発行します。</p></header>
    <form className="mt-6 space-y-8" onSubmit={submit} noValidate>
      <section><h2 className="text-lg font-bold text-zinc-900">お客様情報</h2><p className="mt-1 text-xs text-zinc-500">お客様情報として登録されます。</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="お名前" required><Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} autoComplete="name" /></Field><Field label="電話番号" required><Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} autoComplete="tel" inputMode="tel" /></Field><Field label="郵便番号" required><Input value={customer.postalCode} onChange={(e) => setCustomer({ ...customer, postalCode: e.target.value })} onBlur={() => void lookupPostalCode()} placeholder="1234567" autoComplete="postal-code" inputMode="numeric" />{postalLookupMessage && <p className="mt-1 text-xs text-zinc-500">{postalLookupMessage}</p>}</Field><Field label="メールアドレス"><Input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} autoComplete="email" type="email" /></Field><Field label="都道府県" required><Input value={customer.prefecture} onChange={(e) => setCustomer({ ...customer, prefecture: e.target.value })} autoComplete="address-level1" /></Field><Field label="市区町村" required><Input value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} autoComplete="address-level2" /></Field></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="町名・番地" required><Input value={customer.street} onChange={(e) => setCustomer({ ...customer, street: e.target.value })} autoComplete="address-line1" /></Field><Field label="建物名・部屋番号"><Input value={customer.building} onChange={(e) => setCustomer({ ...customer, building: e.target.value })} autoComplete="address-line2" /></Field></div></section>
      <ReturnAddressFields sameAsCustomer={returnAddressSameAsCustomer} setSameAsCustomer={setReturnAddressSameAsCustomerWithInitialCopy} address={returnAddress} setAddress={setReturnAddress} lookupMessage={returnPostalLookupMessage} onLookup={() => void lookupReturnPostalCode()} />
      <section><div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-bold text-zinc-900">時計情報</h2><p className="mt-1 text-xs text-zinc-500">ブランド名の一部を入力すると候補を絞り込めます。<br />日本語・英字どちらでも検索できます。</p></div><Button type="button" variant="outline" onClick={() => setWatches((current) => [...current, newWatch()])}>＋ 次の時計を追加</Button></div><div className="mt-4 space-y-4">{watches.map((watch, index) => <WatchFields key={watch.key} watch={watch} index={index} brands={brands} canRemove={watches.length > 1} onChange={(patch) => updateWatch(watch.key, patch)} onRemove={() => setWatches((current) => current.filter((item) => item.key !== watch.key))} />)}</div></section>
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>{isSubmitting ? "送付受付中…" : "送付受付を送信"}</Button>
    </form>
  </PageFrame>;
}

function WatchFields({ watch, index, brands, canRemove, onChange, onRemove }: { watch: WatchForm; index: number; brands: IntakeBrandOption[]; canRemove: boolean; onChange: (patch: Partial<WatchForm>) => void; onRemove: () => void }) {
  const [isBrandListOpen, setIsBrandListOpen] = useState(false);
  const matches = searchIntakeBrandOptions(brands, watch.brandQuery);
  const selectBrand = (brandId: string) => {
    const brand = brands.find((option) => option.id === Number(brandId));
    onChange({ brandId, brandQuery: brand?.label ?? watch.brandQuery });
    setIsBrandListOpen(false);
  };

  return <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold text-zinc-800">時計 {index + 1}</h3>{canRemove && <Button type="button" variant="ghost" size="sm" onClick={onRemove}>削除</Button>}</div><div className="grid gap-4 sm:grid-cols-2"><Field label="時計の種類" required><select className="form-select" value={watch.timepieceType} onChange={(e) => onChange({ timepieceType: e.target.value as WatchForm["timepieceType"] })}>{timepieceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="駆動方式" required><select className="form-select" value={watch.driveType} onChange={(e) => onChange({ driveType: e.target.value as WatchForm["driveType"] })}>{driveOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div><div className="mt-4"><Field label="ブランド" required><div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsBrandListOpen(false); }}><Input className="bg-white" value={watch.brandQuery} onChange={(e) => { onChange({ brandQuery: e.target.value, brandId: "" }); setIsBrandListOpen(true); }} onFocus={() => setIsBrandListOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") setIsBrandListOpen(false); }} placeholder="例：ROLEX、ロレックス" role="combobox" aria-autocomplete="list" aria-expanded={isBrandListOpen} aria-controls={`brand-options-${watch.key}`} />{isBrandListOpen && <div id={`brand-options-${watch.key}`} role="listbox" className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-input bg-white py-1 shadow-md">{matches.map((brand) => <button key={brand.id} type="button" role="option" aria-selected={watch.brandId === String(brand.id)} className="block w-full px-3 py-2 text-left text-sm text-zinc-900 hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none" onMouseDown={(event) => event.preventDefault()} onClick={() => selectBrand(String(brand.id))}>{brand.label}</button>)}{matches.length === 0 && <p className="px-3 py-2 text-sm text-zinc-500">該当するブランドがありません。</p>}</div>}</div><span className="mt-1 block text-xs text-zinc-500">時計にブランド名の記載がない、または分からない場合は「不明」を選択してください。</span></Field></div><div className="mt-4"><Field label="型番・モデル名"><Input className="bg-white" value={watch.modelName} onChange={(e) => onChange({ modelName: e.target.value })} placeholder="例：16233、Seamaster（任意）" /></Field></div></article>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) { return <label className="block text-sm font-medium text-zinc-700"><span>{label}{required && <span className="ml-1 text-red-600">必須</span>}</span><span className="mt-1.5 block">{children}</span></label>; }
function ReturnAddressFields({ sameAsCustomer, setSameAsCustomer, address, setAddress, lookupMessage, onLookup }: { sameAsCustomer: boolean; setSameAsCustomer: (value: boolean) => void; address: CustomerForm; setAddress: (value: CustomerForm) => void; lookupMessage: string | null; onLookup: () => void }) {
  return <section className="rounded-xl border border-zinc-200 p-4"><h2 className="text-lg font-bold text-zinc-900">返送先情報</h2><label className="mt-3 flex items-center gap-2 text-sm font-medium text-zinc-700"><input type="checkbox" checked={sameAsCustomer} onChange={(event) => setSameAsCustomer(event.target.checked)} />返送先は上記住所と同じ</label>{!sameAsCustomer && <div className="mt-4"><p className="text-xs text-zinc-500">時計ごとの返送先として保存されます。</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="お名前" required><Input value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} autoComplete="shipping name" /></Field><Field label="電話番号" required><Input value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} autoComplete="shipping tel" inputMode="tel" /></Field><Field label="郵便番号" required><Input value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} onBlur={onLookup} placeholder="1234567" autoComplete="shipping postal-code" inputMode="numeric" />{lookupMessage && <p className="mt-1 text-xs text-zinc-500">{lookupMessage}</p>}</Field><Field label="都道府県" required><Input value={address.prefecture} onChange={(e) => setAddress({ ...address, prefecture: e.target.value })} autoComplete="shipping address-level1" /></Field><Field label="市区町村" required><Input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} autoComplete="shipping address-level2" /></Field><Field label="町名・番地" required><Input value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} autoComplete="shipping address-line1" /></Field></div><div className="mt-4"><Field label="建物名・部屋番号"><Input value={address.building} onChange={(e) => setAddress({ ...address, building: e.target.value })} autoComplete="shipping address-line2" /></Field></div></div>}</section>;
}
function ShippingAddress({ address }: { address: ShippingAddress }) { return <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950"><h2 className="font-bold">発送先</h2><p className="mt-2 font-medium">{address.recipient}</p><p className="whitespace-pre-wrap">{address.address}</p><p className="mt-3 text-xs">時計と受付番号が分かるメモを同封して発送してください。</p></section>; }
function PageFrame({ children }: { children: ReactNode }) { return <main className="min-h-screen bg-zinc-50 px-4 py-6 sm:px-6 sm:py-10"><div className="mx-auto max-w-2xl rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 sm:p-8">{children}</div><style jsx global>{`.form-select { width: 100%; height: 2.25rem; border: 1px solid hsl(var(--input)); border-radius: 0.375rem; background: white; padding: 0 0.75rem; font-size: 0.875rem; } .form-select:focus { outline: none; box-shadow: 0 0 0 1px hsl(var(--ring)); }`}</style></main>; }
