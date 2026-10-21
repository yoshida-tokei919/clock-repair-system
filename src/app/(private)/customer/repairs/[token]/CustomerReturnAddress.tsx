"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ReturnAddress = { recipientName: string; postalCode: string; prefecture: string; city: string; street: string; building: string; phone: string };
type Props = { token: string; address: ReturnAddress; open: boolean; disabled: boolean; onOpenChange: (open: boolean) => void; onAddressSaved: (address: ReturnAddress) => void };

const labels: Record<keyof ReturnAddress, string> = { recipientName: "お名前", postalCode: "郵便番号", prefecture: "都道府県", city: "市区町村", street: "町名・番地", building: "建物名・部屋番号", phone: "電話番号" };

function normalizePostalCode(value: string) {
  const normalized = value.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
  if (!/^\d{7}$/.test(normalized) && !/^\d{3}[-‐‑‒–—―－−]\d{4}$/.test(normalized)) return null;
  return normalized.replace(/[-‐‑‒–—―－−]/g, "");
}

function completePostalCode(address: ReturnAddress) {
  return address.prefecture.trim() && address.city.trim() && address.street.trim() ? normalizePostalCode(address.postalCode) : null;
}

function AddressFields({ address, setAddress, onPostalBlur }: { address: ReturnAddress; setAddress: (next: ReturnAddress) => void; onPostalBlur: () => void }) {
  return <div className="grid gap-3 sm:grid-cols-2">{(Object.keys(labels) as Array<keyof ReturnAddress>).map((field) => <label key={field} className={field === "street" || field === "building" ? "sm:col-span-2" : ""}><span className="block text-xs font-bold text-slate-600">{labels[field]}{field !== "building" && " *"}</span><input value={address[field]} onChange={(event) => setAddress({ ...address, [field]: event.target.value })} onBlur={field === "postalCode" ? onPostalBlur : undefined} inputMode={field === "postalCode" || field === "phone" ? "tel" : undefined} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" /></label>)}</div>;
}

export function CustomerReturnAddress({ token, address: initialAddress, open, disabled, onOpenChange, onAddressSaved }: Props) {
  const router = useRouter();
  const [savedAddress, setSavedAddress] = useState(initialAddress);
  const [address, setAddress] = useState(initialAddress);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const resolvedPostalCode = useRef(completePostalCode(initialAddress));

  useEffect(() => {
    if (open) return;
    setSavedAddress(initialAddress);
    setAddress(initialAddress);
    resolvedPostalCode.current = completePostalCode(initialAddress);
  }, [initialAddress, open]);

  const lookupPostalCode = async () => {
    const postalCode = normalizePostalCode(address.postalCode);
    if (!postalCode) { setMessage("郵便番号は7桁で入力してください。"); return; }
    if (resolvedPostalCode.current === postalCode) return;
    try {
      setMessage("住所を検索しています。");
      const response = await fetch(`/api/postal-code?zipcode=${postalCode}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAddress((current) => ({ ...current, postalCode, prefecture: result.prefecture, city: result.city, street: result.street }));
      resolvedPostalCode.current = postalCode;
      setMessage("住所を自動入力しました。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "住所を取得できませんでした。"); }
  };

  const close = () => {
    setAddress(savedAddress);
    resolvedPostalCode.current = completePostalCode(savedAddress);
    setMessage("");
    onOpenChange(false);
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/customer/repairs/${token}/return-address`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(address) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "返送先を保存できませんでした。");
      const nextAddress = result.address as ReturnAddress;
      setAddress(nextAddress);
      setSavedAddress(nextAddress);
      resolvedPostalCode.current = completePostalCode(nextAddress);
      onAddressSaved(nextAddress);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "返送先を保存できませんでした。"); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !saving) close(); else onOpenChange(nextOpen); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>返送先の変更</DialogTitle></DialogHeader>{disabled ? <p className="text-sm text-slate-600">承認待ちの案件のみ返送先を変更できます。</p> : <><AddressFields address={address} setAddress={setAddress} onPostalBlur={() => void lookupPostalCode()} />{message && <p className="text-sm text-slate-600">{message}</p>}<DialogFooter className="gap-2"><button type="button" onClick={() => void save()} disabled={saving} className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? "保存中…" : "変更を保存する"}</button><button type="button" onClick={close} disabled={saving} className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-bold">キャンセル</button></DialogFooter></>}</DialogContent></Dialog>;
}
