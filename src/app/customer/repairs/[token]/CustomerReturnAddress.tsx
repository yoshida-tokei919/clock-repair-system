"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Address = {
  recipientName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  street: string;
  building: string;
  phone: string;
};

type Props = { token: string; address: Address; disabled: boolean };

const fieldLabels: Record<keyof Address, string> = {
  recipientName: "お名前", postalCode: "郵便番号", prefecture: "都道府県", city: "市区町村", street: "町名・番地", building: "建物名・部屋番号", phone: "電話番号",
};

function AddressFields({ address, setAddress, onPostalBlur }: { address: Address; setAddress: (next: Address) => void; onPostalBlur: () => void }) {
  return <div className="mt-3 grid gap-3 sm:grid-cols-2">{(Object.keys(fieldLabels) as Array<keyof Address>).map((field) => <label key={field} className={field === "street" || field === "building" ? "sm:col-span-2" : ""}><span className="block text-xs font-bold text-slate-600">{fieldLabels[field]}{field !== "building" && " *"}</span><input value={address[field]} onChange={(event) => setAddress({ ...address, [field]: event.target.value })} onBlur={field === "postalCode" ? onPostalBlur : undefined} inputMode={field === "postalCode" || field === "phone" ? "tel" : undefined} autoComplete={field === "recipientName" ? "shipping name" : field === "postalCode" ? "shipping postal-code" : field === "prefecture" ? "shipping address-level1" : field === "city" ? "shipping address-level2" : field === "street" ? "shipping address-line1" : field === "building" ? "shipping address-line2" : "shipping tel"} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" /></label>)}</div>;
}

export function CustomerReturnAddress({ token, address: initialAddress, disabled }: Props) {
  const router = useRouter();
  const [address, setAddress] = useState(initialAddress);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const lookupPostalCode = async () => {
    const digits = address.postalCode.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, "");
    if (!/^\d{7}$/.test(digits)) return;
    try {
      const response = await fetch(`/api/postal-code?zipcode=${digits}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAddress((current) => ({ ...current, postalCode: digits, prefecture: result.prefecture, city: result.city, street: result.street }));
      setMessage("住所を自動入力しました。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "住所を取得できませんでした。"); }
  };

  const save = async () => {
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/customer/repairs/${token}/return-address`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(address) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "返送先を保存できませんでした。");
      setAddress({ ...address, postalCode: result.repair.returnPostalCode || address.postalCode });
      setEditing(false); setMessage("返送先を保存しました。"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "返送先を保存できませんでした。"); }
    finally { setSaving(false); }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">返送先</h2><p className="mt-1 text-sm text-slate-500">承認前に返送先をご確認ください。</p></div>{!disabled && !editing && <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700">返送先を変更する</button>}</div>{editing ? <><AddressFields address={address} setAddress={setAddress} onPostalBlur={() => void lookupPostalCode()} /><div className="mt-4 flex gap-2"><button type="button" onClick={() => void save()} disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? "保存中…" : "変更を保存する"}</button><button type="button" onClick={() => { setAddress(initialAddress); setEditing(false); }} disabled={saving} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold">キャンセル</button></div></> : <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-800"><div className="font-bold">{address.recipientName || "未入力"}</div><div>〒{address.postalCode || "未入力"}</div><div>{[address.prefecture, address.city, address.street, address.building].filter(Boolean).join("") || "未入力"}</div><div>TEL {address.phone || "未入力"}</div></div>}{message && <p className="mt-3 text-sm text-slate-600">{message}</p>}</section>;
}
