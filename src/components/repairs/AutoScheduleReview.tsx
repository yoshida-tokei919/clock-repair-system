"use client";

import { useState } from "react";
import { isScheduleChange, type ScheduleExclusion } from "@/lib/simple-auto-scheduler";

type Placement = {
  id: number;
  inquiryNumber: string;
  priorityScore: number;
  estimatedWorkMinutes: number;
  deliveryDateExpected: string | null;
  previousDate: string | null;
  proposedDate: string | null;
  unplacedReason: string | null;
};
type DayItem = { id: number; inquiryNumber: string; minutes: number };
type Day = { date: string; availableMinutes: number; lockedMinutes: number; proposedMinutes: number; lockedItems: DayItem[]; proposedItems: DayItem[] };
type PreviewResponse = {
  revision: string;
  preview: {
    startDate: string;
    endDate: string;
    placements: Placement[];
    exclusions: ScheduleExclusion[];
    days: Day[];
    lockedWithoutDate: number;
    lockedWithoutEstimate: number;
  };
};

export function AutoScheduleReview() {
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function fetchPreview(): Promise<PreviewResponse> {
    const response = await fetch("/api/repairs/auto-schedule", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "プレビューを取得できませんでした。");
    return body as PreviewResponse;
  }

  async function preview() {
    setBusy(true);
    setResult(null);
    setError("");
    try {
      setResult(await fetchPreview());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "プレビューを取得できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const changes = result?.preview.placements.filter(isScheduleChange) ?? [];
  const unscheduled = result?.preview.placements.filter(row => row.proposedDate === null) ?? [];
  const usedDays = result?.preview.days.filter(day => day.lockedMinutes > 0 || day.proposedMinutes > 0) ?? [];

  return (
    <section className="mt-8 rounded border bg-white p-4 shadow-sm" aria-label="自動スケジュールの確認">
      <h2 className="text-lg font-semibold">自動スケジュール案</h2>
      <p className="mt-1 text-sm text-slate-600">旧方式の予定案を参照できます。予定の反映には下の <a href="#scheduler-v2-preview" className="text-blue-700 underline">Scheduler v2 分割予定案</a>を使用してください。</p>
      <button type="button" onClick={preview} disabled={busy} className="mt-4 rounded border px-4 py-2 hover:bg-slate-50 disabled:opacity-50">
        {busy ? "処理中..." : result ? "プレビューを更新" : "予定案をプレビュー"}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-slate-700">対象期間: {result.preview.startDate}〜{result.preview.endDate}（180日） / 配置対象: {result.preview.placements.length}件 / 変更: {changes.length}件 / 配置不可: {unscheduled.length}件 / 対象外: {result.preview.exclusions.length}件</p>
          {(result.preview.lockedWithoutDate > 0 || result.preview.lockedWithoutEstimate > 0) && (
            <p className="text-sm text-amber-800">固定案件のうち予定日なし: {result.preview.lockedWithoutDate}件、想定時間なし: {result.preview.lockedWithoutEstimate}件。これらは日別容量に算入されません。</p>
          )}
          {usedDays.some(day => day.lockedMinutes > day.availableMinutes) && (
            <p className="text-sm text-amber-800">固定案件だけで作業可能時間を超える日があります。固定予定は変更しません。</p>
          )}
          <div className="max-h-72 overflow-auto rounded border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50"><tr><th className="p-2">案件</th><th className="p-2">優先度</th><th className="p-2">時間</th><th className="p-2">納品予定</th><th className="p-2">現在</th><th className="p-2">予定案</th></tr></thead>
              <tbody>{result.preview.placements.map(row => <tr key={row.id} className="border-t"><td className="p-2">{row.inquiryNumber} (#{row.id})</td><td className="p-2">{row.priorityScore}</td><td className="p-2">{row.estimatedWorkMinutes}分</td><td className="p-2">{row.deliveryDateExpected ?? "—"}</td><td className="p-2">{row.previousDate ?? "—"}</td><td className="p-2">{row.proposedDate ?? <span className="text-amber-800">配置不可：{row.unplacedReason}（現在の予定日は維持）</span>}</td></tr>)}</tbody>
            </table>
          </div>
          <details><summary className="cursor-pointer text-sm font-medium">自動配置の対象外案件と理由（{result.preview.exclusions.length}件）</summary>
            <div className="mt-2 max-h-64 overflow-auto rounded border">
              <table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-2">案件</th><th className="p-2">状態</th><th className="p-2">現在の予定</th><th className="p-2">理由</th></tr></thead>
                <tbody>{result.preview.exclusions.map(row => <tr key={row.id} className="border-t"><td className="p-2">{row.inquiryNumber} (#{row.id})</td><td className="p-2">{row.status}</td><td className="p-2">{row.scheduledDate ?? "—"}</td><td className="p-2">{row.reason}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
          <details><summary className="cursor-pointer text-sm font-medium">日別容量を確認（{usedDays.length}日）</summary>
            <div className="mt-2 max-h-64 overflow-auto text-sm">{usedDays.map(day => <div key={day.date} className="border-b py-2">
              <p className="font-medium">{day.date}: 使用 {day.lockedMinutes + day.proposedMinutes}分 / 可能 {day.availableMinutes}分（固定 {day.lockedMinutes}分）</p>
              {day.lockedItems.map(item => <p key={`locked-${item.id}`} className="pl-3 text-slate-600">固定: {item.inquiryNumber} (#{item.id}) · {item.minutes}分</p>)}
              {day.proposedItems.map(item => <p key={`proposed-${item.id}`} className="pl-3 text-blue-700">予定案: {item.inquiryNumber} (#{item.id}) · {item.minutes}分</p>)}
            </div>)}</div>
          </details>
          <p className="text-xs text-slate-500">この旧方式プレビューは閲覧専用です。予定の更新にはScheduler v2を使用してください。</p>
        </div>
      )}
    </section>
  );
}
