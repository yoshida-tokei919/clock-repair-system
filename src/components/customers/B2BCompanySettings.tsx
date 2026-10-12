"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Company = {
  id: number;
  name: string;
  billingCustomerId: number | null;
  members: { customerId: number; customer: { name: string; type: string } }[];
};
type Settings = { companies: Company[]; companyId: number | null };

export function B2BCompanySettings({ customerId }: { customerId: number }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [billingCustomerId, setBillingCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = `/api/customers/${customerId}/company`;

  const load = useCallback(async () => {
    const response = await fetch(url);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "会社設定を取得できませんでした。");
    setSettings(result);
    const current = result.companies.find((company: Company) => company.id === result.companyId);
    setBillingCustomerId(current?.billingCustomerId?.toString() || "");
  }, [url]);

  useEffect(() => {
    load().catch((cause) => setError(cause.message));
  }, [load]);

  const submit = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "会社設定を保存できませんでした。");
      await load();
      setName("");
      setSelectedCompanyId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "会社設定を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const current = settings?.companies.find((company) => company.id === settings.companyId);
  return (
    <Card className="p-6 space-y-4 border-zinc-200 shadow-sm">
      <div>
        <h3 className="text-sm font-bold text-zinc-700">会社・請求先設定</h3>
        <p className="text-xs text-zinc-500 mt-1">修理と発送はこの店舗の顧客情報を使用します。請求先の指定は発送先を変更しません。</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!settings ? <p className="text-sm text-zinc-500">読み込み中...</p> : current ? (
        <div className="space-y-3">
          <p className="text-sm">所属会社: <strong>{current.name}</strong></p>
          <label className="block text-sm font-medium" htmlFor="billingCustomerId">請求先店舗</label>
          <div className="flex flex-wrap gap-2">
            <select id="billingCustomerId" className="border rounded px-3 py-2 text-sm min-w-60" value={billingCustomerId}
              onChange={(event) => setBillingCustomerId(event.target.value)}>
              {current.members.map((member) => (
                <option key={member.customerId} value={member.customerId}>
                  {member.customer.name} (ID {member.customerId})
                </option>
              ))}
            </select>
            <Button type="button" disabled={busy || !billingCustomerId || Number(billingCustomerId) === current.billingCustomerId}
              onClick={() => submit({ action: "setBilling", companyId: current.id, billingCustomerId: Number(billingCustomerId) })}>
              請求先を保存
            </Button>
          </div>
          <p className="text-xs text-zinc-500">所属店舗: {current.members.map((member) => `${member.customer.name} (ID ${member.customerId})`).join("、")}</p>
          {current.members.length === 1 && current.members[0].customerId === customerId && current.billingCustomerId === customerId ? (
            <Button type="button" variant="outline" disabled={busy}
              onClick={() => {
                if (window.confirm("会社グループを解除し、この顧客を単独請求に戻しますか？")) {
                  submit({ action: "dissolve", companyId: current.id });
                }
              }}>会社グループを解除して単独請求に戻す</Button>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={busy || current.billingCustomerId === customerId}
                onClick={() => submit({ action: "leave", companyId: current.id })}>この店舗の所属を解除</Button>
              {current.billingCustomerId === customerId && <p className="text-xs text-zinc-500">所属解除には、先に別の所属店舗を請求先に指定してください。</p>}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-xs" value={name} onChange={(event) => setName(event.target.value)} placeholder="新しい会社グループ名" maxLength={200} />
            <Button type="button" disabled={busy || !name.trim()} onClick={() => submit({ action: "create", name })}>会社を作成して所属</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="所属先会社" className="border rounded px-3 py-2 text-sm min-w-60" value={selectedCompanyId}
              onChange={(event) => setSelectedCompanyId(event.target.value)}>
              <option value="">既存の会社を選択</option>
              {settings.companies.map((company) => <option key={company.id} value={company.id}>{company.name} (ID {company.id})</option>)}
            </select>
            <Button type="button" variant="outline" disabled={busy || !selectedCompanyId}
              onClick={() => submit({ action: "join", companyId: Number(selectedCompanyId) })}>選択した会社に所属</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
