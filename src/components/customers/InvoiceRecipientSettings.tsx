"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

type Option = { id: number; name: string; companyName: string | null; prefix: string | null };

export function InvoiceRecipientSettings({ customerId }: { customerId: number }) {
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/customers/${customerId}/invoice-recipient`).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "請求先を取得できません。");
      setOptions(data.options);
      setSelected(data.invoiceRecipientCustomerId);
      setReady(true);
    }).catch(error => setMessage(error instanceof Error ? error.message : "請求先を取得できません。"))
      .finally(() => setLoading(false));
  }, [customerId]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/customers/${customerId}/invoice-recipient`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceRecipientCustomerId: selected }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "請求先を保存できません。");
      setSelected(data.invoiceRecipientCustomerId);
      setMessage("請求先を保存しました。今後発行する請求書に適用されます。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "請求先を保存できません。");
    } finally {
      setSaving(false);
    }
  }

  return <Card className="p-6 space-y-3 border-zinc-200 shadow-sm">
    <h3 className="text-sm font-bold">別法人を請求先に指定</h3>
    <p className="text-sm text-zinc-600">この取引先の修理・請求書番号・請求書は独立したまま、請求書の宛先とLINE／郵送先だけを変更します。下の「同一会社の請求集約」とは別の設定です。</p>
    <label className="block text-sm">請求書の宛先
      <select className="mt-1 block w-full rounded border p-2" value={selected ?? ""} disabled={!ready || loading || saving}
        onChange={event => setSelected(event.target.value ? Number(event.target.value) : null)}>
        <option value="">この取引先自身（既定）</option>
        {options.map(option => <option key={option.id} value={option.id}>{option.companyName || option.name} {option.prefix ? `(${option.prefix})` : ""}</option>)}
      </select>
    </label>
    <button type="button" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      disabled={!ready || loading || saving} onClick={() => void save()}>{saving ? "保存中..." : "請求先を保存"}</button>
    {message && <p role="status" className="text-sm text-zinc-700">{message}</p>}
  </Card>;
}
