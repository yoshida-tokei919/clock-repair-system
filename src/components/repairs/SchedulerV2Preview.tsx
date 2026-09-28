"use client";

import { useState } from "react";
import type { SchedulerV2Day, SchedulerV2Repair } from "@/lib/scheduler-v2-planner-domain";

type Response = { asOfDate: string; horizonEndDate: string; plannerVersion: string;
  snapshotRevision: string; days: SchedulerV2Day[]; repairs: SchedulerV2Repair[] };
const REASONS: Record<string, string> = {
  LOCKED_WITHOUT_DATE: "固定案件の予定日がありません", LOCKED: "固定予定を保護",
  MANUAL_SEGMENT_PROTECTED: "手動segmentを保護", STATUS_NOT_SCHEDULABLE: "作業待ち以外",
  WORK_MINUTES_UNAVAILABLE: "作業時間未設定", PARTS_WAITING_UNKNOWN: "部品準備日不明",
  PARTS_LEGACY_UNKNOWN: "旧データの部品状態不明", BLOCKED_REQUIRES_MANUAL_RESUME: "中断中・手動再開が必要",
  PROCESS_BUFFER_UNSET: "工程日数未設定", DEADLINE_UNSET: "納品予定日未設定",
  DEADLINE_WINDOW_PASSED: "作業可能期間を超過", BEYOND_PREVIEW_HORIZON: "対象期間外・判定保留",
  NO_CAPACITY_IN_WINDOW: "期間内の容量不足",
};
const display = (value: string | number | null) => value ?? "—";
const segmentsText = (segments: readonly { workDate: string; plannedMinutes: number; source: string }[]) =>
  segments.length ? segments.map(row => `${row.workDate} ${row.plannedMinutes}分 (${row.source})`).join(" / ") : "—";

export function SchedulerV2Preview() {
  const [result, setResult] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/repairs/scheduler-v2-preview", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "分割予定案を取得できませんでした。");
      setResult(body as Response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "分割予定案を取得できませんでした。");
    } finally { setLoading(false); }
  }
  return <section className="mt-8 rounded border bg-white p-4 shadow-sm" aria-label="分割スケジューラーのプレビュー">
    <h2 className="text-lg font-semibold">Scheduler v2 分割予定案</h2>
    <p className="mt-1 text-sm text-slate-600">部品・中断・納期・日別容量を反映し、複数日への仮配置を表示します。予定と代表日は保存しません。</p>
    <button type="button" onClick={refresh} disabled={loading} className="mt-4 rounded border px-4 py-2 hover:bg-slate-50 disabled:opacity-50">{loading ? "読み込み中..." : result ? "予定案を更新" : "予定案を表示"}</button>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {result && <div className="mt-5 space-y-4 text-sm">
      <p>基準日: {result.asOfDate} / 対象最終日: {result.horizonEndDate} / 配置案: {result.repairs.reduce((sum, row) => sum + row.proposedSegments.length, 0)} segment</p>
      <p className="text-xs text-slate-500">Planner: {result.plannerVersion} / Snapshot revision: <code>{result.snapshotRevision}</code>（情報表示のみ）</p>
      <div className="max-h-96 overflow-auto rounded border"><table className="w-full min-w-[1500px] text-left"><thead className="sticky top-0 bg-slate-50"><tr>
        <th className="p-2">案件・状態</th><th className="p-2">優先度</th><th className="p-2">作業時間</th>
        <th className="p-2">現在代表日</th><th className="p-2">現在segment</th><th className="p-2">部品・中断</th>
        <th className="p-2">最短開始</th><th className="p-2">最遅完了</th><th className="p-2">提案segment</th>
        <th className="p-2">提案代表日</th><th className="p-2">判定</th>
      </tr></thead><tbody>{result.repairs.map(row => <tr key={row.id} className="border-t align-top">
        <td className="p-2">{row.inquiryNumber} (#{row.id})<br />{row.status}</td>
        <td className="p-2">{row.priorityScore}</td>
        <td className="p-2">{row.workMinutes === null ? "—" : `${row.workMinutes}分`}<br />{row.workMinutesSource === "REMAINING_WORK" ? "残作業" : row.workMinutesSource === "ESTIMATED_WORK" ? "推定" : "未設定"}</td>
        <td className="p-2">{display(row.currentScheduledDate)} {row.scheduleLocked ? "固定" : ""}</td>
        <td className="p-2">{segmentsText(row.currentSegments)}{row.currentSegments.length > 0 && row.currentScheduledDate !== row.currentSegments[0].workDate && <span className="block text-amber-800">代表日とsegment初日が異なります</span>}</td>
        <td className="p-2">{row.partsReadinessState} {display(row.partsReadyDate)}<br />{row.blocked ? "中断中" : ""} 再開候補 {display(row.resumeEligibleDate)} / 確認日 {display(row.reviewDate)}</td>
        <td className="p-2">{display(row.projectedEarliestDate)}</td>
        <td className="p-2">{display(row.latestWorkCompletionDate)}</td>
        <td className="p-2">{segmentsText(row.proposedSegments)}</td>
        <td className="p-2">{display(row.proposedSummaryDate)}</td>
        <td className="p-2">{row.unplacedReason ? REASONS[row.unplacedReason] ?? row.unplacedReason : "配置可能"}</td>
      </tr>)}</tbody></table></div>
      <details><summary className="cursor-pointer font-medium">日別容量（{result.days.length}日）</summary>
        <div className="mt-2 max-h-80 overflow-auto rounded border"><table className="w-full min-w-[1000px] text-left"><thead className="sticky top-0 bg-slate-50"><tr>
          <th className="p-2">日付</th><th className="p-2">総容量</th><th className="p-2">予約枠</th><th className="p-2">実効容量</th>
          <th className="p-2">固定</th><th className="p-2">維持する仮予定</th><th className="p-2">置換対象の現予定</th>
          <th className="p-2">現予定合計</th><th className="p-2">提案</th><th className="p-2">提案後残</th>
        </tr></thead><tbody>{result.days.map(day => <tr key={day.date} className="border-t">
          <td className="p-2">{day.date}</td><td className="p-2">{day.grossCapacityMinutes}</td><td className="p-2">{day.totalReservedMinutes}</td>
          <td className="p-2">{day.effectiveRepairCapacityMinutes}</td><td className="p-2">{day.fixedLoadMinutes}</td>
          <td className="p-2">{day.preservedProvisionalLoadMinutes}</td><td className="p-2">{day.replaceableCurrentLoadMinutes}</td>
          <td className="p-2">{day.currentPlanLoadMinutes}</td><td className="p-2">{day.proposedLoadMinutes}</td>
          <td className="p-2">{day.remainingCapacityMinutes}</td>
        </tr>)}</tbody></table></div>
      </details>
    </div>}
  </section>;
}
