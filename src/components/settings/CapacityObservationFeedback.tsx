import React from "react";
import type { CapacityObservationFeedback as Feedback } from "@/lib/capacity-observation-feedback";

const minutes = (value: number | null) => value === null ? "—" : `${Number(value.toFixed(1))}分`;

export default function CapacityObservationFeedback({ feedback }: { feedback: Feedback }) {
  return <section className="space-y-3 rounded border bg-white p-5 shadow-sm">
    <h2 className="text-lg font-semibold">日別の計測実績と作業容量（記述的な参照のみ・学習容量ではありません）</h2>
    <p className="text-sm text-zinc-700">東京時間で今日より前に完了した日を対象に、計測がある{feedback.observedDayCount}日を表示します。{feedback.firstObservedDate && feedback.lastObservedDate && `観測日: ${feedback.firstObservedDate}〜${feedback.lastObservedDate}。`}未計測日は0分として扱いません。</p>
    <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">タイマーの利用が全業務を網羅しているかは不明です。表示分数は計測された実績だけで、総業務量、未計測時間、空き時間、学習済み容量を示しません。推奨容量の算出や設定・予定への自動反映はしません。</p>
    <p className="text-sm text-zinc-700">計測がある日だけの平均: 修理 {minutes(feedback.observedDayMeans.repair)}／修理以外 {minutes(feedback.observedDayMeans.nonRepair)}／計測合計 {minutes(feedback.observedDayMeans.total)}。</p>
    <p className="text-xs text-zinc-600">総容量には、各観測日について現在DBに保存されているWorkCalendarの値を使用します（その日の例外行がなければ480分）。後日編集された場合、当時の値とは限りません。予定確認枠と共通業務予約枠は過去の設定履歴がないため、現在の設定値を各日へ当てた参考値です。修理向け実効容量と予約超過は、この日別総容量と現在の予約枠からTask192の計算方法で表示します。</p>
    <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b bg-zinc-50">{["日付", "WorkCalendar総容量", "現在の予定確認枠", "現在の共通業務予約枠", "現在設定の修理向け実効容量", "予約超過", "計測修理", "計測修理以外", "計測合計"].map(label => <th key={label} className="whitespace-nowrap p-2">{label}</th>)}</tr></thead><tbody>
      {feedback.days.map(day => <tr key={day.date} className="border-b"><td className="whitespace-nowrap p-2">{day.date}</td><td className="p-2">{minutes(day.grossCapacityMinutes)}</td><td className="p-2">{minutes(day.scheduleReviewReservedMinutes)}</td><td className="p-2">{minutes(day.activityReservedMinutes)}</td><td className="p-2">{minutes(day.effectiveRepairCapacityMinutes)}</td><td className="p-2">{minutes(day.overReservedMinutes)}</td><td className="p-2">{minutes(day.measuredRepairMinutes)}</td><td className="p-2">{minutes(day.measuredNonRepairMinutes)}</td><td className="p-2">{minutes(day.totalMeasuredMinutes)}</td></tr>)}
      {!feedback.days.length && <tr><td colSpan={9} className="p-3 text-zinc-600">今日より前の完了日に計測実績はありません。</td></tr>}
    </tbody></table></div>
  </section>;
}
