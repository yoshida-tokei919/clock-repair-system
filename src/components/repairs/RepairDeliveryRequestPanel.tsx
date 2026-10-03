"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  canEditDeliveryShipment, deliveryPatchPayload, initialDeliveryShipmentId,
  type RepairDeliveryShipment,
} from "@/lib/repair-delivery-request";

type CustomerResponse = {
  applicationStatus: "UNANSWERED" | "APPLIED" | "PENDING_NO_SHIPMENT" | "PENDING_MULTIPLE_SHIPMENTS" | "PENDING_MULTI_REPAIR_SHIPMENT" | "PENDING_MISMATCH" | "LOCKED";
  preference: {
    requestedDeliveryDate: string | null;
    requestedDeliveryTimeSlot: string;
    respondedAt: string;
  } | null;
};
type Payload = {
  shipments: RepairDeliveryShipment[];
  customerResponse: CustomerResponse;
  timeOptions: { value: string; label: string }[];
};
type Draft = { shipmentId: number; date: string; timeSlot: string };

const customerResponseStatusLabels: Record<CustomerResponse["applicationStatus"], string> = {
  UNANSWERED: "未回答",
  APPLIED: "Shipmentへ反映済み",
  PENDING_NO_SHIPMENT: "Shipment作成待ち",
  PENDING_MULTIPLE_SHIPMENTS: "複数Shipmentのため要確認",
  PENDING_MULTI_REPAIR_SHIPMENT: "複数Repair同梱のため要確認",
  PENDING_MISMATCH: "Shipmentとの内容差異あり",
  LOCKED: "発送準備進行済み",
};

const displayResponseTime = (value: string) => new Intl.DateTimeFormat("ja-JP", {
  year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "Asia/Tokyo",
}).format(new Date(value));

export function RepairDeliveryRequestPanel({ repairId }: { repairId: number }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const saveInFlight = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPayload(null);
    setSelectedId(null);
    setDraft(null);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/repairs/${repairId}/delivery-shipments`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "発送候補を読み込めませんでした。");
      const next = data as Payload;
      setPayload(next);
      const initialId = initialDeliveryShipmentId(next.shipments);
      if (initialId !== null) {
        const shipment = next.shipments[0];
        setDraft({ shipmentId: initialId, date: shipment.requestedDeliveryDate ?? "", timeSlot: shipment.requestedDeliveryTimeSlot ?? "" });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "発送候補を読み込めませんでした。");
    } finally { setLoading(false); }
  }, [repairId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const currentId = payload ? initialDeliveryShipmentId(payload.shipments) ?? selectedId : null;
  const current = payload?.shipments.find(shipment => shipment.id === currentId) ?? null;
  const supportedTime = draft?.timeSlot === "" || payload?.timeOptions.some(option => option.value === draft?.timeSlot);
  const canSave = !!current && canEditDeliveryShipment(current) && draft?.shipmentId === current.id && supportedTime && !loading && !saving;

  function selectShipment(id: number | null) {
    setSelectedId(id);
    setError(null);
    setFeedback(null);
    const shipment = payload?.shipments.find(item => item.id === id);
    setDraft(shipment ? { shipmentId: shipment.id, date: shipment.requestedDeliveryDate ?? "", timeSlot: shipment.requestedDeliveryTimeSlot ?? "" } : null);
  }

  async function save() {
    if (!canSave || !current || !draft || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/shipments/${current.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deliveryPatchPayload(draft.date, draft.timeSlot)),
      });
      const data = await response.json().catch(() => null);
      if (response.status === 409) {
        await refresh();
        setError(data?.error || "発送の状態が変わりました。更新した候補を確認し、発送を選び直してください。");
        return;
      }
      if (!response.ok) throw new Error(data?.error || "配達希望を保存できませんでした。");
      await refresh();
      setFeedback(`発送 #${current.id} の配達希望を保存しました。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "配達希望を保存できませんでした。");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  return <section className="space-y-3 rounded border p-4" aria-label="配達希望日時の記録">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">配達希望日時の記録</h3>
      <Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={loading || saving}>発送候補を更新</Button>
    </div>
    <p className="text-sm text-zinc-600">お客様のセルフ回答とShipmentへの反映状態を確認できます。必要な場合はDRAFT Shipmentへ手動で記録できます。</p>
    {loading && <p className="text-sm text-zinc-600">発送候補を確認しています…</p>}
    {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {feedback && <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{feedback}</p>}
    {payload && <div className={`rounded border p-3 text-sm ${payload.customerResponse.preference && payload.customerResponse.applicationStatus !== "APPLIED" ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-zinc-50"}`}>
      <p className="font-medium">お客様の配達希望回答: {customerResponseStatusLabels[payload.customerResponse.applicationStatus]}</p>
      {payload.customerResponse.preference ? <>
        <p>回答日時: {displayResponseTime(payload.customerResponse.preference.respondedAt)}</p>
        <p>希望日: {payload.customerResponse.preference.requestedDeliveryDate ?? "指定なし"}</p>
        <p>時間帯: {payload.customerResponse.preference.requestedDeliveryTimeSlot}</p>
      </> : <p>配達希望ページからの回答はまだありません。</p>}
      {payload.customerResponse.preference && payload.customerResponse.applicationStatus !== "APPLIED" &&
        <p className="mt-1 text-amber-800">回答は保存されていますが、Shipmentへ自動反映されていません。発送候補と内容を確認してください。</p>}
    </div>}
    {payload?.shipments.length === 0 && <p className="text-sm text-amber-800">未発送の対象Shipmentがありません。お客様の回答がある場合はRepair側に保持され、単一RepairのShipment作成時に自動反映されます。複数Repair同梱は自動反映せず要確認です。</p>}
    {payload && payload.shipments.length > 1 && <label className="block space-y-1 text-sm">
      <span className="font-medium">記録する発送を選択</span>
      <select className="w-full rounded border p-2" value={selectedId ?? ""} onChange={event => selectShipment(event.target.value ? Number(event.target.value) : null)} disabled={saving}>
        <option value="">発送を選択してください</option>
        {payload.shipments.map(shipment => <option key={shipment.id} value={shipment.id}>発送 #{shipment.id} · {shipment.status} · 発送予定 {shipment.plannedShipDate ?? "未設定"} · {shipment.inquiryNumbers.filter(Boolean).join("、") || "問い合わせ番号なし"}</option>)}
      </select>
    </label>}
    {current && <div className="space-y-3 text-sm">
      <div className="rounded bg-zinc-50 p-3">
        <p className="font-medium">発送 #{current.id} · {current.status}</p>
        <p>発送予定: {current.plannedShipDate ?? "未設定"}</p>
        <p>同梱Repairの問い合わせ番号: {current.inquiryNumbers.filter(Boolean).join("、") || "未設定"}</p>
        <p>現在の配達希望日: {current.requestedDeliveryDate ?? "未設定"}</p>
        <p>現在の希望時間帯: {current.requestedDeliveryTimeSlot ?? "未設定"}</p>
      </div>
      {!canEditDeliveryShipment(current) ? <p className="text-amber-800">DRAFT以外の発送は表示のみです。配達希望を編集できません。</p> : draft?.shipmentId === current.id && <div className="space-y-3">
        <label className="block space-y-1"><span className="font-medium">配達希望日</span><input type="date" className="w-full rounded border p-2" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} disabled={saving} /></label>
        <label className="block space-y-1"><span className="font-medium">配達希望時間帯</span><select className="w-full rounded border p-2" value={draft.timeSlot} onChange={event => setDraft({ ...draft, timeSlot: event.target.value })} disabled={saving}>
          <option value="">未設定</option>
          {payload?.timeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          {draft.timeSlot && !supportedTime && <option value={draft.timeSlot}>既存値: {draft.timeSlot}（選び直してください）</option>}
        </select></label>
        {!supportedTime && <p className="text-amber-800">既存の時間帯はこの画面の選択肢にありません。保存前に選び直してください。</p>}
        <div className="flex justify-end"><Button type="button" onClick={() => void save()} disabled={!canSave}>{saving ? "保存中…" : "この発送へ配達希望を保存"}</Button></div>
      </div>}
    </div>}
  </section>;
}
