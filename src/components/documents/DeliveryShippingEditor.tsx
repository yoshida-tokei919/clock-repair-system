"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { DeliveryShippingFields, shippingInputFromForm, type ShippingForm } from "./DeliveryShippingFields";

export function DeliveryShippingEditor({ id, carrierCode, size, calculatedFee, fee, locked }: {
  id: number; carrierCode: string | null; size: number | null; calculatedFee: number | null; fee: number | null; locked: boolean;
}) {
  const [form, setForm] = useState<ShippingForm>({ mode: fee === null ? "" : carrierCode ? "SHIPPING" : "NO_SHIPPING",
    method: carrierCode === "JAPAN_POST" || carrierCode === "YAMATO" ? carrierCode : "",
    size: size?.toString() ?? "", fee: fee?.toString() ?? "" });
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const save = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/delivery-notes/${id}/shipping`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(shippingInputFromForm(form)) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "送料を保存できません");
      toast({ title: "送料を保存しました" }); router.refresh();
    } catch (error) { toast({ title: "送料の保存に失敗しました", description: error instanceof Error ? error.message : "再読み込みしてください", variant: "destructive" }); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 border-t p-4 text-sm">
    <h2 className="font-semibold">納品書の配送・請求送料</h2>
    <p>現在の計算送料: {calculatedFee === null ? "未計算" : `¥${calculatedFee.toLocaleString()}`} ／ 請求送料: {fee === null ? "未確定" : `¥${fee.toLocaleString()}`}</p>
    {locked ? <p className="text-amber-800">請求履歴があるため変更できません。</p> : <><DeliveryShippingFields form={form} onChange={setForm} />
      <Button onClick={save} disabled={busy || !form.mode || (form.mode === "SHIPPING" && (!form.method || !form.size || form.fee === ""))}>{busy ? "保存中..." : "送料を保存"}</Button></>}
  </section>;
}
