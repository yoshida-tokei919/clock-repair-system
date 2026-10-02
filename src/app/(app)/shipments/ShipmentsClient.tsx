"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ShipmentDirection, ShipmentHandoffMethod, ShipmentStatus, StorageLocationType } from "@prisma/client";
import { activePhysicalTag, activeStorageLocation, sameCustomerShipmentContext, SCHEDULE_GROUPS, shipmentRepairSummary, shipmentScheduleGroup } from "@/lib/shipment-schedule";

export type ScheduleShipment = {
  id: number;
  direction: ShipmentDirection;
  status: ShipmentStatus;
  plannedShipDate: string | null;
  actualShippedAt: string | null;
  requestedDeliveryDate: string | null;
  requestedDeliveryTimeSlot: string | null;
  labelIssuedAt: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  handoffMethod: ShipmentHandoffMethod | null;
  customer: { id: number; name: string; type: string };
  repairs: { repair: {
    id: number; inquiryNumber: string; status: string; deliveryNoteId: number | null;
    storageLocationAssignments: { releasedAt: Date | string | null; storageLocation: { name: string; shortCode: string | null; locationType: StorageLocationType } }[];
    physicalTagAssignments: { releasedAt: Date | string | null; physicalTag: { shortCode: string } }[];
  } }[];
};

type PlanningForm = {
  plannedShipDate: string;
  carrierCode: string;
  serviceCode: string;
  handoffMethod: string;
  requestedDeliveryDate: string;
  requestedDeliveryTimeSlot: string;
};

const statusLabels: Record<ShipmentStatus, string> = {
  DRAFT: "下書き", READY: "準備完了", LABEL_ISSUED: "送り状発行済み",
  AWAITING_ACCEPTANCE: "引受待ち", SHIPPED: "発送済み", IN_TRANSIT: "輸送中",
  OUT_FOR_DELIVERY: "配達中", DELIVERED: "配達済み", EXCEPTION: "要確認", CANCELLED: "取消",
};
const handoffLabels: Record<ShipmentHandoffMethod, string> = {
  PICKUP: "集荷", COUNTER_DROP_OFF: "窓口持込", OTHER: "その他",
};

function planningForm(row: ScheduleShipment): PlanningForm {
  return {
    plannedShipDate: row.plannedShipDate ?? "",
    carrierCode: row.carrierCode ?? "",
    serviceCode: row.serviceCode ?? "",
    handoffMethod: row.handoffMethod ?? "",
    requestedDeliveryDate: row.requestedDeliveryDate ?? "",
    requestedDeliveryTimeSlot: row.requestedDeliveryTimeSlot ?? "",
  };
}

export default function ShipmentsClient({ rows, today }: { rows: ScheduleShipment[]; today: string }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PlanningForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(id: number) {
    if (!form || saving) return;
    setSaving(true);
    setError("");
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]));
      const response = await fetch(`/api/shipments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) throw new Error("認証が必要です。再ログインしてください。");
        if (response.status === 409) {
          setEditingId(null);
          setForm(null);
          router.refresh();
          throw new Error("発送の状態が変更されました。一覧を更新したので再確認してください。");
        }
        throw new Error(typeof result.error === "string" ? result.error : `保存に失敗しました (${response.status})。`);
      }
      setEditingId(null);
      setForm(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 space-y-7">
      <div>
        <h1 className="text-3xl font-bold">発送予定</h1>
        <p className="mt-2 text-sm text-gray-600">OUTBOUND の未発送・未取消 Shipment。日付区分は日本時間、週は月曜から日曜です。</p>
        <p className="text-sm text-gray-600">ランニングテスト完了の正本イベントは未実装です。現在のデータでは完了を判定できません。</p>
        <p className="text-sm text-gray-600">同一顧客の他個口はまとめ発送を検討するための参考情報です。統合可否は判定していません。</p>
      </div>
      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {SCHEDULE_GROUPS.map(group => {
        const groupRows = rows.filter(row => shipmentScheduleGroup(row.plannedShipDate, today, row.status, row.actualShippedAt) === group.key);
        return <section key={group.key} className="space-y-3">
          <h2 className="text-xl font-semibold">{group.label} <span className="text-base font-normal text-gray-600">{groupRows.length}件</span></h2>
          {groupRows.length === 0 ? <p className="text-sm text-gray-500">該当なし</p> : <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full min-w-[1600px] text-left text-sm">
              <thead className="border-b bg-gray-50"><tr>
                <th className="p-3">Shipment / 顧客</th><th className="p-3">発送状態</th>
                <th className="p-3">Repair / 作業</th><th className="p-3">ランニングテスト</th>
                <th className="p-3">納品書</th><th className="p-3">現物の所在 / タグ</th><th className="p-3">発送予定日</th>
                <th className="p-3">配達希望</th><th className="p-3">送り状</th>
                <th className="p-3">配送 / 引渡</th><th className="p-3">同一顧客の他の未発送個口</th><th className="p-3">計画</th>
              </tr></thead>
              <tbody>{groupRows.map(row => {
                const summary = shipmentRepairSummary(row.repairs);
                const otherShipments = sameCustomerShipmentContext(row, rows);
                return <tr key={row.id} id={`shipment-${row.id}`} className="border-b align-top last:border-0">
                <td className="p-3"><p className="font-semibold">#{row.id}</p><p>{row.customer.name}</p>
                  <p className="text-gray-600">{row.customer.type === "business" ? "B2B" : row.customer.type === "individual" ? "B2C" : "区分要確認"}</p></td>
                <td className="p-3">{statusLabels[row.status]}</td>
                <td className="p-3"><p className="mb-2 font-medium">{summary.total}件中 {summary.workCompleted}件 作業完了</p>{row.repairs.map(({ repair }) => <p key={repair.id} className="mb-1">
                  <Link className="text-blue-700 hover:underline" href={`/repairs/${repair.id}`}>{repair.inquiryNumber}</Link>
                  <span className="ml-2">{repair.status}</span>
                  <span className="block text-xs text-gray-600">{repair.status === "作業完了" ? "作業完了" : "作業完了未確認"}</span>
                </p>)}</td>
                <td className="p-3">判定不可<br /><span className="text-xs text-gray-600">完了イベント未実装</span></td>
                <td className="p-3"><p className="mb-2 font-medium">{summary.deliveryNoteState} ({summary.notesIssued}/{summary.total})</p>{row.repairs.map(({ repair }) => <p key={repair.id} className="mb-1">
                  {repair.inquiryNumber}: {repair.deliveryNoteId === null ? "未発行" : `発行済み (#${repair.deliveryNoteId})`}
                </p>)}</td>
                <td className="p-3">{row.repairs.map(({ repair }) => {
                  const location = activeStorageLocation(repair.storageLocationAssignments);
                  const tag = activePhysicalTag(repair.physicalTagAssignments);
                  return <p key={repair.id} className="mb-2">
                    <span className="font-medium">{repair.inquiryNumber}</span><br />
                    保管場所: {location ? `${location.name}${location.shortCode ? ` (${location.shortCode})` : ""} / ${location.locationType}` : "未登録"}<br />
                    PhysicalTag: {tag?.shortCode ?? "未割当"}
                  </p>;
                })}</td>
                <td className="p-3">{row.plannedShipDate ?? "未設定"}</td>
                <td className="p-3">{row.requestedDeliveryDate ?? "未設定"}<br />{row.requestedDeliveryTimeSlot ?? "時間帯未設定"}</td>
                <td className="p-3">{row.labelIssuedAt ? <>発行済み<br /><span className="text-xs text-gray-600">{new Date(row.labelIssuedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span></> : "未発行"}</td>
                <td className="p-3">{row.carrierCode ?? "未設定"} / {row.serviceCode ?? "未設定"}<br />
                  {row.handoffMethod ? handoffLabels[row.handoffMethod] : "未設定"}</td>
                <td className="p-3">{otherShipments.length === 0 ? "なし" : otherShipments.map(({ shipment, dayDifference }) =>
                  <p key={shipment.id} className="mb-2">
                    <a className="text-blue-700 hover:underline" href={`#shipment-${shipment.id}`}>#{shipment.id}</a>
                    <span className="ml-2">{statusLabels[shipment.status]}</span><br />
                    発送予定日: {shipment.plannedShipDate ?? "未設定"}<br />
                    この個口からの日付差: {dayDifference === null ? "比較不可（予定日未設定）" : `${dayDifference > 0 ? "+" : ""}${dayDifference}日`}<br />
                    Repair: {shipment.repairs.map(({ repair }) => repair.inquiryNumber).join("、") || "なし"}
                  </p>)}</td>
                <td className="p-3">{row.status === "DRAFT" && <button type="button" className="text-blue-700 hover:underline disabled:opacity-50"
                  disabled={saving} onClick={() => { setEditingId(row.id); setForm(planningForm(row)); setError(""); }}>編集</button>}</td>
              </tr>})}</tbody>
            </table>
          </div>}
        </section>;
      })}
      {editingId !== null && form && <section className="rounded-lg border bg-white p-5 space-y-4" aria-label="発送計画の編集">
        <h2 className="text-xl font-semibold">Shipment #{editingId} の計画</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">発送予定日<input type="date" value={form.plannedShipDate} onChange={event => setForm({ ...form, plannedShipDate: event.target.value })} className="mt-1 block w-full rounded border p-2" /></label>
          <label className="text-sm">配送会社コード<input value={form.carrierCode} maxLength={100} onChange={event => setForm({ ...form, carrierCode: event.target.value })} className="mt-1 block w-full rounded border p-2" /></label>
          <label className="text-sm">サービスコード<input value={form.serviceCode} maxLength={100} onChange={event => setForm({ ...form, serviceCode: event.target.value })} className="mt-1 block w-full rounded border p-2" /></label>
          <label className="text-sm">引渡方法<select value={form.handoffMethod} onChange={event => setForm({ ...form, handoffMethod: event.target.value })} className="mt-1 block w-full rounded border p-2">
            <option value="">未設定</option><option value="PICKUP">集荷</option><option value="COUNTER_DROP_OFF">窓口持込</option><option value="OTHER">その他</option>
          </select></label>
          <label className="text-sm">配達希望日<input type="date" value={form.requestedDeliveryDate} onChange={event => setForm({ ...form, requestedDeliveryDate: event.target.value })} className="mt-1 block w-full rounded border p-2" /></label>
          <label className="text-sm">配達希望時間帯<input value={form.requestedDeliveryTimeSlot} maxLength={100} onChange={event => setForm({ ...form, requestedDeliveryTimeSlot: event.target.value })} className="mt-1 block w-full rounded border p-2" /></label>
        </div>
        <div className="flex gap-3"><button type="button" disabled={saving} onClick={() => save(editingId)} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{saving ? "保存中…" : "保存"}</button>
          <button type="button" disabled={saving} onClick={() => { setEditingId(null); setForm(null); setError(""); }} className="rounded border px-4 py-2 disabled:opacity-50">キャンセル</button></div>
      </section>}
    </div>
  );
}
