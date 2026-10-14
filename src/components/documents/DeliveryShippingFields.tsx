"use client";

import type { DeliveryShippingInput } from "@/lib/delivery-shipping";

export type ShippingForm = { mode: "" | DeliveryShippingInput["mode"]; method: "" | "JAPAN_POST" | "YAMATO"; size: string; fee: string };
export const emptyShippingForm: ShippingForm = { mode: "", method: "", size: "", fee: "" };

export function shippingInputFromForm(form: ShippingForm): DeliveryShippingInput {
  return form.mode === "NO_SHIPPING"
    ? { mode: "NO_SHIPPING", shippingFee: 0 }
    : { mode: "SHIPPING", carrierCode: form.method || null,
      serviceCode: form.method === "JAPAN_POST" ? "YU_PACK" : form.method === "YAMATO" ? "TA_Q_BIN" : null,
      size: form.size === "" ? null : Number(form.size),
      shippingFee: form.fee === "" ? null : Number(form.fee) };
}

export function DeliveryShippingFields({ form, onChange }: { form: ShippingForm; onChange: (value: ShippingForm) => void }) {
  return <div className="space-y-3 text-sm">
    <fieldset className="space-y-2"><legend className="font-medium">発送方法</legend>
      <label className="flex gap-2"><input type="radio" name="shipping-mode" checked={form.mode === "SHIPPING"} onChange={() => onChange({ ...form, mode: "SHIPPING" })} />発送あり</label>
      <label className="flex gap-2"><input type="radio" name="shipping-mode" checked={form.mode === "NO_SHIPPING"} onChange={() => onChange({ ...form, mode: "NO_SHIPPING", method: "", size: "", fee: "0" })} />発送なし（送料0円）</label>
    </fieldset>
    {form.mode === "SHIPPING" && <>
      <label className="block">配送会社・サービス<select className="mt-1 block w-full rounded border p-2" value={form.method} onChange={event => onChange({ ...form, method: event.target.value as ShippingForm["method"] })}>
        <option value="">選択してください</option><option value="JAPAN_POST">日本郵便・ゆうパック</option><option value="YAMATO">ヤマト運輸・宅急便</option>
      </select></label>
      <label className="block">サイズ<select className="mt-1 block w-full rounded border p-2" value={form.size} onChange={event => onChange({ ...form, size: event.target.value })}>
        <option value="">選択してください</option>{[60, 80, 100, 120, 140, 160, 170, 180, 200].map(size => <option key={size} value={size}>{size}</option>)}
      </select></label>
      <p className="text-slate-600">計算送料: 未計算（料金表は後続Taskで追加）</p>
      <label className="block">お客様への請求送料（税込・円）<input type="number" min="0" max="2147483647" step="1" className="mt-1 block w-full rounded border p-2" value={form.fee} onChange={event => onChange({ ...form, fee: event.target.value })} placeholder="明示的に入力してください。0円も可" /></label>
    </>}
  </div>;
}
