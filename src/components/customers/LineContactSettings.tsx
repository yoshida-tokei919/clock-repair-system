"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

type Option = { id: number; name: string; companyName: string | null; prefix: string | null };

export function LineContactSettings({ customerId }: { customerId: number }) {
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch(`/api/customers/${customerId}/line-contact`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "LINE連絡先を取得できません。");
    setOptions(data.options);
    setSelected(data.lineContactCustomerId);
    setSaved(data.lineContactCustomerId);
    setStatus(data.lineStatus);
    setReady(true);
  }
  useEffect(() => { void refresh().catch(error => setMessage(error instanceof Error ? error.message : "取得できません。")); }, [customerId]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/customers/${customerId}/line-contact`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineContactCustomerId: selected, previousLineContactCustomerId: saved }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "LINE連絡先を保存できません。");
      await refresh();
      setMessage("LINE代理連絡先を保存しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "LINE連絡先を保存できません。");
    } finally { setSaving(false); }
  }

  return <Card className="p-6 space-y-3 border-zinc-200 shadow-sm">
    <h3 className="text-sm font-bold">LINE代理連絡先</h3>
    <p className="text-sm text-zinc-600">この取引先の見積と修理コメントのLINE通知を、指定した法人の連絡先へ送ります。修理・帳票・請求先・LINE会話履歴は統合しません。設定だけでは送信されません。</p>
    <label className="block text-sm">代理連絡先
      <select className="mt-1 block w-full rounded border p-2" value={selected ?? ""} disabled={!ready || saving}
        onChange={event => setSelected(event.target.value ? Number(event.target.value) : null)}>
        <option value="">この取引先自身（既定）</option>
        {options.map(option => <option key={option.id} value={option.id}>{option.companyName || option.name} {option.prefix ? `(${option.prefix})` : ""}</option>)}
      </select>
    </label>
    <p className="text-xs text-zinc-600">保存済み設定のLINE送信先: {status || "確認中"}。実際の送信にはLINEユーザー1件と確認済みManager連携が必要です。</p>
    <button type="button" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      disabled={!ready || saving} onClick={() => void save()}>{saving ? "保存中..." : "LINE連絡先を保存"}</button>
    {message && <p role="status" className="text-sm text-zinc-700">{message}</p>}
  </Card>;
}
