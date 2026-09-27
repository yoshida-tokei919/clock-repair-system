"use client";

import { useState } from "react";
import type { PreviewDay, PreviewRepairAnalysis } from "@/lib/deadline-capacity-preview-domain";

type Response = {
  asOfDate: string; horizonEndDate: string; totalReservedDailyMinutes: number;
  processBufferSettings: { runningTestDays: number | null; reworkBufferDays: number | null;
    shippingBufferDays: number | null; configured: boolean; totalProcessBufferDays: number | null };
  overReservedDayCount: number; overbookedDayCount: number; analysisCounts: Record<string, number>;
  analysisStatusCounts: Record<string, number>;
  snapshotRevision: string; days: PreviewDay[]; repairs: PreviewRepairAnalysis[];
};

const REASONS: Record<string, string> = {
  TERMINAL: "終了状態", WORK_MINUTES_UNAVAILABLE: "作業時間未設定",
  PARTS_WAITING_UNKNOWN: "部品準備日不明", PARTS_LEGACY_UNKNOWN: "旧データの部品状態不明",
  BLOCKED_REQUIRES_MANUAL_RESUME: "中断中・手動再開が必要",
  PROCESS_BUFFER_UNSET: "工程日数未設定", DEADLINE_UNSET: "納品予定日未設定",
  DEADLINE_WINDOW_PASSED: "作業可能期間を超過", REQUIRES_SPLIT_SCHEDULER: "1日では収まらない・分割が必要",
  NO_CAPACITY_IN_WINDOW: "期間内の残容量不足", BEYOND_PREVIEW_HORIZON: "対象期間外・判定保留",
  LOCKED_DATE_CONFLICT: "固定予定と制約が競合", CURRENT_PLAN_CONFLICT: "現在予定と制約が競合",
  READY: "期間内に空きあり",
};
const display = (value: string | number | null) => value ?? "—";

export function DeadlineCapacityPreview() {
  const [result, setResult] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/repairs/deadline-capacity-preview", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "プレビューを取得できませんでした。");
      setResult(body as Response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "プレビューを取得できませんでした。");
    } finally { setLoading(false); }
  }
  return <section className="mt-8 rounded border bg-white p-4 shadow-sm" aria-label="納期と実効容量の確認">
    <h2 className="text-lg font-semibold">納期・実効容量の確認</h2>
    <p className="mt-1 text-sm text-slate-600">現在の予定と設定を読み取り、1日単位で納期と修理容量を分析します。ここから予定は変更されません。自動スケジュール案への反映とは独立しています。</p>
    <button type="button" onClick={refresh} disabled={loading} className="mt-4 rounded border px-4 py-2 hover:bg-slate-50 disabled:opacity-50">{loading ? "読み込み中..." : result ? "分析を更新" : "分析を表示"}</button>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {result && <div className="mt-5 space-y-4 text-sm">
      <p>基準日: {result.asOfDate} / 対象最終日: {result.horizonEndDate} / 毎日の予約枠: {result.totalReservedDailyMinutes}分 / 予約枠超過: {result.overReservedDayCount}日 / 予定超過: {result.overbookedDayCount}日</p>
      <p>工程日数（暦日）: ランニングテスト {display(result.processBufferSettings.runningTestDays)}、再調整 {display(result.processBufferSettings.reworkBufferDays)}、発送 {display(result.processBufferSettings.shippingBufferDays)}。{result.processBufferSettings.configured ? `合計 ${result.processBufferSettings.totalProcessBufferDays}日` : "未設定の項目があるため納期逆算は保留"}</p>
      <p>判定: {Object.entries(result.analysisCounts).map(([reason, count]) => `${REASONS[reason] ?? reason} ${count}件`).join(" / ") || "対象なし"}</p>
      <p>集計: 空きあり {result.analysisStatusCounts.AVAILABLE ?? 0}件 / 現予定の競合 {result.analysisStatusCounts.CONFLICT ?? 0}件 / 制約で不可 {result.analysisStatusCounts.UNAVAILABLE ?? 0}件 / 情報不足・終了 {result.analysisStatusCounts.INFORMATIONAL ?? 0}件</p>
      <p className="text-xs text-slate-500">Snapshot revision: <code>{result.snapshotRevision}</code>（情報表示のみ）</p>
      <div className="max-h-96 overflow-auto rounded border">
        <table className="w-full min-w-[1200px] text-left"><thead className="sticky top-0 bg-slate-50"><tr>
          <th className="p-2">案件</th><th className="p-2">状態</th><th className="p-2">時間</th><th className="p-2">現在予定</th>
          <th className="p-2">納品予定</th><th className="p-2">部品</th><th className="p-2">中断</th>
          <th className="p-2">最遅完了</th><th className="p-2">最短開始</th><th className="p-2">空き初日</th><th className="p-2">余裕</th><th className="p-2">判定</th>
        </tr></thead><tbody>{result.repairs.map(row => <tr key={row.id} className="border-t align-top">
          <td className="p-2">{row.inquiryNumber} (#{row.id})</td><td className="p-2">{row.status}</td>
          <td className="p-2">{row.workMinutes === null ? "—" : `${row.workMinutes}分`}<br /><span className="text-xs text-slate-500">{row.workMinutesSource === "REMAINING_WORK" ? "残作業時間" : row.workMinutesSource === "ESTIMATED_WORK" ? "推定作業時間" : "未設定"}</span></td>
          <td className="p-2">{row.scheduledDate === null ? "未設定" : `${row.scheduledDate} ${row.scheduleLocked ? "固定" : "仮"}`}</td>
          <td className="p-2">{display(row.deliveryDateExpected)}</td>
          <td className="p-2">{row.partsReadinessState}<br />{display(row.partsReadyDate)}</td>
          <td className="p-2">{row.blocked ? "中断中" : "—"}<br />再開候補 {display(row.resumeEligibleDate)}<br />確認日 {display(row.reviewDate)}</td>
          <td className="p-2">{display(row.latestWorkCompletionDate)}</td>
          <td className="p-2">{display(row.projectedEarliestDate)}{row.blocked && <span className="block text-xs text-amber-800">再開後の候補 {display(row.potentialEarliestDate)}</span>}</td>
          <td className="p-2">{display(row.firstAvailableDateAgainstCurrentPlan)}</td>
          <td className="p-2">{row.slackDays === null ? "—" : `${row.slackDays}日`}</td>
          <td className="p-2">{REASONS[row.analysisReason] ?? row.analysisReason}{row.currentPlanConstraintConflict && <span className="block text-xs text-amber-800">現予定と制約が競合</span>}</td>
        </tr>)}</tbody></table>
      </div>
      <details><summary className="cursor-pointer font-medium">日別の実効容量と現在予定（{result.days.length}日）</summary>
        <div className="mt-2 max-h-80 overflow-auto rounded border"><table className="w-full min-w-[1200px] text-left"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-2">日付</th><th className="p-2">総容量</th><th className="p-2">予定確認予約</th><th className="p-2">業務予約</th><th className="p-2">予約合計</th><th className="p-2">実効修理容量</th><th className="p-2">予約超過</th><th className="p-2">固定</th><th className="p-2">仮予定</th><th className="p-2">現予定負荷</th><th className="p-2">固定後残</th><th className="p-2">現予定後残</th><th className="p-2">超過</th></tr></thead>
          <tbody>{result.days.map(day => <tr key={day.date} className="border-t"><td className="p-2">{day.date}</td><td className="p-2">{day.grossCapacityMinutes}</td><td className="p-2">{day.scheduleReviewReservedMinutes}</td><td className="p-2">{day.activityReservedMinutes}</td><td className="p-2">{day.totalReservedMinutes}</td><td className="p-2">{day.effectiveRepairCapacityMinutes}</td><td className="p-2">{day.overReservedMinutes}</td>
            <td className="p-2">{day.fixedLoadMinutes}{day.fixedItems.map(item => <span key={item.id} className="block text-xs">{item.inquiryNumber} {item.minutes}分</span>)}</td>
            <td className="p-2">{day.provisionalLoadMinutes}{day.provisionalItems.map(item => <span key={item.id} className="block text-xs">{item.inquiryNumber} {item.minutes}分</span>)}</td>
            <td className="p-2">{day.currentPlanLoadMinutes}</td><td className="p-2">{day.fixedRemainingMinutes}</td><td className="p-2">{day.currentPlanRemainingMinutes}</td><td className="p-2">{day.overbookedMinutes}</td></tr>)}</tbody></table></div>
      </details>
    </div>}
  </section>;
}
