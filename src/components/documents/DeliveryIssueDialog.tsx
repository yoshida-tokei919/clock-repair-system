"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatIssuedDate } from "@/lib/document-issued-date";
import { DeliveryShippingFields, emptyShippingForm, shippingInputFromForm, type ShippingForm } from "./DeliveryShippingFields";
import type { DeliveryShippingInput } from "@/lib/delivery-shipping";
import { customerDefaultShippingInput, type CustomerDefaultShipping } from "@/lib/customer-default-shipping";

export function DeliveryIssueDialog({ open, busy, onClose, onConfirm, customerType, customerDefault }: { open: boolean; busy: boolean; onClose: () => void; onConfirm: (date: string, shipping: DeliveryShippingInput) => void; customerType: string | null; customerDefault: CustomerDefaultShipping | null }) {
  const [date, setDate] = useState("");
  const [form, setForm] = useState<ShippingForm>(emptyShippingForm);
  useEffect(() => { if (open) {
    setDate(formatIssuedDate(new Date()));
    try {
      const shipping = customerDefaultShippingInput(customerType ?? "", customerDefault);
      setForm(shipping ? { mode: "SHIPPING", method: shipping.shippingCarrierCode as ShippingForm["method"],
        size: String(shipping.shippingSize), fee: String(shipping.shippingFee) } : emptyShippingForm);
    } catch { setForm(emptyShippingForm); }
  } }, [open, customerType, customerDefault]);
  const valid = !!date && (form.mode === "NO_SHIPPING" || (form.mode === "SHIPPING" && !!form.method && !!form.size && form.fee !== "" && Number.isSafeInteger(Number(form.fee)) && Number(form.fee) >= 0));
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}><DialogContent className="max-h-[85vh] overflow-y-auto">
    <DialogHeader><DialogTitle>納品書の発行日と送料を確定</DialogTitle></DialogHeader>
    <label className="text-sm">発行日（日本時間）<input type="date" className="mt-1 block rounded border p-2" value={date} onChange={event => setDate(event.target.value)} /></label>
    <DeliveryShippingFields form={form} onChange={setForm} />
    <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>キャンセル</Button><Button onClick={() => onConfirm(date, shippingInputFromForm(form))} disabled={busy || !valid}>この内容で発行</Button></DialogFooter>
  </DialogContent></Dialog>;
}
