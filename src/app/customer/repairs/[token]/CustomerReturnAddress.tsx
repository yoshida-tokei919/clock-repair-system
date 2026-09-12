"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ReturnAddress = { recipientName: string; postalCode: string; prefecture: string; city: string; street: string; building: string; phone: string };
type Props = { token: string; address: ReturnAddress; disabled: boolean; editRequestId?: number; onApprovalStateChange?: (state: { disabled: boolean; message: string }) => void };

const labels: Record<keyof ReturnAddress, string> = { recipientName: "お名前", postalCode: "郵便番号", prefecture: "都道府県", city: "市区町村", street: "町名・番地", building: "建物名・部屋番号", phone: "電話番号" };

function normalizePostalCode(value: string) {
  const normalized = value.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
  if (!/^\d{7}$/.test(normalized) && !/^\d{3}[-‐‑‒–—―－−]\d{4}$/.test(normalized)) return null;
  return normalized.replace(/[-‐‑‒–—―－−]/g, "");
}

function isComplete(address: ReturnAddress) { return Boolean(address.recipientName.trim() && normalizePostalCode(address.postalCode) && address.prefecture.trim() && address.city.trim() && address.street.trim() && address.phone.trim()); }
function completePostalCode(address: ReturnAddress) { return address.prefecture.trim() && address.city.trim() && address.street.trim() ? normalizePostalCode(address.postalCode) : null; }

function AddressFields({ address, setAddress, onPostalBlur }: { address: ReturnAddress; setAddress: (next: ReturnAddress) => void; onPostalBlur: () => void }) {
  return <div className="grid gap-3 sm:grid-cols-2">{(Object.keys(labels) as Array<keyof ReturnAddress>).map((field) => <label key={field} className={field === "street" || field === "building" ? "sm:col-span-2" : ""}><span className="block text-xs font-bold text-slate-600">{labels[field]}{field !== "building" && " *"}</span><input value={address[field]} onChange={(event) => setAddress({ ...address, [field]: event.target.value })} onBlur={field === "postalCode" ? onPostalBlur : undefined} inputMode={field === "postalCode" || field === "phone" ? "tel" : undefined} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" /></label>)}</div>;
}

export function CustomerReturnAddress({ token, address: initialAddress, disabled, editRequestId = 0, onApprovalStateChange }: Props) {
  const router = useRouter();
  const [savedAddress, setSavedAddress] = useState(initialAddress);
  const [address, setAddress] = useState(initialAddress);
  const [editing, setEditing] = useState(!disabled && !isComplete(initialAddress));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const resolvedPostalCode = useRef(completePostalCode(initialAddress));
  const dirty = JSON.stringify(address) !== JSON.stringify(savedAddress);

  useEffect(() => { if (editRequestId > 0 && !disabled) setEditing(true); }, [disabled, editRequestId]);
  useEffect(() => {
    if (!onApprovalStateChange) return;
    if (!isComplete(address)) return onApprovalStateChange({ disabled: true, message: "返送先が未登録です。承認前に入力してください。" });
    if (editing || saving || dirty) return onApprovalStateChange({ disabled: true, message: "返送先の変更を保存してから承認してください。" });
    onApprovalStateChange({ disabled: false, message: "" });
  }, [address, dirty, editing, onApprovalStateChange, saving]);

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

  const save = async () => {
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/customer/repairs/${token}/return-address`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(address) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "返送先を保存できませんでした。");
      const nextAddress = result.address as ReturnAddress;
      setAddress(nextAddress); setSavedAddress(nextAddress); setEditing(false); resolvedPostalCode.current = completePostalCode(nextAddress);
      setMessage("返送先を保存しました。"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "返送先を保存できませんでした。"); }
    finally { setSaving(false); }
  };

  const cancel = () => { setAddress(savedAddress); resolvedPostalCode.current = completePostalCode(savedAddress); setEditing(false); setMessage(""); };
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">返送先</h2><p className="mt-1 text-sm text-slate-500">承認前に返送先をご確認ください。</p></div>{!disabled && <button type="button" onClick={() => setEditing(true)} className="rounded-md border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700">返送先を変更する</button>}</div><div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-800"><div className="font-bold">{address.recipientName || "未入力"}</div><div>〒{address.postalCode || "未入力"}</div><div>{[address.prefecture, address.city, address.street, address.building].filter(Boolean).join("") || "未入力"}</div><div>TEL {address.phone || "未入力"}</div></div>{message && <p className="mt-3 text-sm text-slate-600">{message}</p>}<Dialog open={editing} onOpenChange={(open) => { if (!open && !saving) cancel(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>返送先の変更</DialogTitle></DialogHeader><AddressFields address={address} setAddress={setAddress} onPostalBlur={() => void lookupPostalCode()} /><DialogFooter className="gap-2"><button type="button" onClick={() => void save()} disabled={saving} className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? "保存中…" : "変更を保存する"}</button><button type="button" onClick={cancel} disabled={saving} className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-bold">キャンセル</button></DialogFooter></DialogContent></Dialog></section>;
}
