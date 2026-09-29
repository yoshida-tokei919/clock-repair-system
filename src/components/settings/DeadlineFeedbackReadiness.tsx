import React from "react";
import type { DeadlineFeedbackReadiness as Readiness } from "@/lib/deadline-feedback-readiness";

const days = (value: number | null) => value === null ? "未設定" : `${value}暦日`;

export default function DeadlineFeedbackReadiness({ readiness }: { readiness: Readiness }) {
  const { currentBuffers, repairCounts } = readiness;
  return <section className="space-y-3 rounded border bg-white p-5 shadow-sm">
    <h2 className="text-lg font-semibold">納期フィードバックのデータ状況（参照のみ）</h2>
    <p className="text-sm text-zinc-700">保存済み現在設定: ランニングテスト {days(currentBuffers.runningTestDays)}、再調整余裕 {days(currentBuffers.reworkBufferDays)}、発送余裕 {days(currentBuffers.shippingBufferDays)}。過去の設定履歴はないため、当時の設定値とは比較できません。</p>
    <p className="text-sm text-zinc-700">Repair 全{repairCounts.total}件のうち、納品予定日（deliveryDateExpected）あり {repairCounts.expectedDeliveryDate}件、実納品日（deliveryDateActual）あり {repairCounts.actualDeliveryDate}件、両方あり {repairCounts.bothDeliveryDates}件。</p>
    <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">これらは列の入力件数であり、遅延件数や納期遵守率ではありません。納品予定日は編集可能で当初の約束日の履歴がなく、実納品日の現行入力経路も確認できません。RepairStatusLog の日付は手入力・過去日入力が可能で、WorkTimeSession の終了や予定 segment の日付も作業完了日時を証明しません。</p>
    <p className="text-sm text-zinc-700">修理作業完了・ランニングテスト・再調整・実発送・配達の確定イベントが不足しています。実発送日時は Task199 以降の Shipment 基盤で扱う予定です。配達完了との連携も後続 Task の対象です。現状では工程別の遅延原因や適切なバッファ日数を算出できません。</p>
  </section>;
}
