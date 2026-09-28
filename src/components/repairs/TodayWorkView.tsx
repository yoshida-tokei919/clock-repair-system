import React from "react";
import Link from "next/link";
import { WorkTimerStartButton } from "@/components/work-time/WorkTimerStartButton";
import type { buildTodayWork, TodaySection, TodayWorkRow } from "@/lib/today-work";

type TodayWork = ReturnType<typeof buildTodayWork>;
const sections: { key: TodaySection; label: string; detail: string }[] = [
  { key: "ready", label: "今日実行できる作業", detail: "予定済みで、作業中断や部品不足がありません。" },
  { key: "resume", label: "再開可能日を迎えた中断案件", detail: "中断は継続中です。案件で再開操作を確認してください。" },
  { key: "blocked", label: "中断中", detail: "再開可能日前、または再開可能日が未設定です。" },
  { key: "parts", label: "部品待ち・準備状況要確認", detail: "部品の確保状況を確認してください。" },
  { key: "status", label: "その他の確認事項", detail: "案件状態または作業時間を確認してください。" },
];

const date = (value: string | null) => value ? value.slice(0, 10).replaceAll("-", "/") : "未設定";
const receptionDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value))
  : "未設定";
const blockReasons: Record<string, string> = {
  ADDITIONAL_PART_POSSIBLE: "追加部品の可能性", REPAIR_METHOD_REVIEW: "修理方法の検討",
  WAITING_CUSTOMER: "お客様確認待ち", WAITING_OUTSOURCE: "外注待ち",
  WAITING_PARTS: "部品待ち", OTHER: "その他",
};

function stateLabel(row: TodayWorkRow) {
  switch (row.section) {
    case "ready": return "実行可能";
    case "resume": return "再開日到来・中断中";
    case "blocked": return "中断中";
    case "parts": return row.partsReadinessState === "LEGACY_UNKNOWN" ? "部品状態要確認" : "部品待ち";
    case "status": return "状態確認";
  }
}

function attention(row: TodayWorkRow) {
  const notes: string[] = [];
  if (row.overdue) notes.push("納期超過");
  if (row.deadlineConflict) notes.push("工程期限を超過");
  if (row.blocked) notes.push("作業中断中");
  if (row.section === "parts") notes.push(row.partsReadinessState === "LEGACY_UNKNOWN" ? "部品状況不明" : "部品未確保");
  return notes;
}

export function TodayWorkView({ work }: { work: TodayWork }) {
  const { capacity, rows } = work;
  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
    <header>
      <h1 className="text-2xl font-bold text-zinc-900">今日の作業</h1>
      <p className="mt-1 text-sm text-zinc-600">{date(work.date)}（日本時間）の現在の予定と実行状態</p>
    </header>

    <section aria-label="今日の作業容量" className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="font-semibold text-zinc-900">今日の容量</h2>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p>総作業容量 <strong className="block text-xl">{capacity.grossMinutes} 分</strong></p>
        <p>実効作業容量 <strong className="block text-xl">{capacity.effectiveMinutes} 分</strong></p>
        <p>予定負荷 <strong className="block text-xl">{capacity.plannedMinutes} 分</strong></p>
        <p>残容量 <strong className="block text-xl">{capacity.remainingMinutes} 分</strong></p>
      </div>
      <p className="mt-3 text-xs text-zinc-600">実効容量 = 総容量 − スケジュール確認・共通業務の予約 {capacity.reservedMinutes} 分（下限 0 分）。予定負荷は今日の予定明細と、明細のない案件の旧予定日だけを集計します。</p>
      {capacity.overReservedMinutes > 0 && <p className="mt-2 text-sm font-medium text-amber-700">予約時間が総容量を {capacity.overReservedMinutes} 分超過しています。</p>}
      {capacity.overbookedMinutes > 0 && <p className="mt-2 text-sm font-medium text-red-700">予定負荷が実効容量を {capacity.overbookedMinutes} 分超過しています。</p>}
    </section>

    {rows.length === 0 && <p className="rounded-lg border border-zinc-200 bg-white p-6 text-zinc-600">今日の予定作業はありません。</p>}
    {sections.map(section => {
      const items = rows.filter(row => row.section === section.key);
      if (!items.length) return null;
      return <section key={section.key} aria-label={section.label} className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">{section.label}（{items.length}件）</h2>
        <p className="mt-1 text-sm text-zinc-600">{section.detail}</p>
        <div className="mt-4 space-y-3">
          {items.map(row => <article key={row.id} className="rounded-md border border-zinc-200 p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/repairs/${row.id}`} className="font-semibold text-blue-700 hover:underline">{row.inquiryNumber}</Link>
                <span className="ml-3 rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{stateLabel(row)}</span>
                <p className="mt-2 text-zinc-700">{row.status} · 優先度 {row.priorityScore} · 今日 {row.plannedMinutes} 分（{row.planSource === "segment" ? "予定明細" : "旧予定日"}）</p>
                <p className="mt-1 text-zinc-600">納期 {date(row.deliveryDateExpected)} · 受付 {receptionDate(row.receptionDate)} · 予定 {date(work.date)}</p>
                {row.blocked && <p className="mt-1 text-zinc-600">再開可能日 {date(row.resumeEligibleDate)} · 再確認日 {date(row.reviewDate)}{row.blockReason ? ` · 中断理由 ${blockReasons[row.blockReason] ?? row.blockReason}` : ""}</p>}
                {row.section === "parts" && <p className="mt-1 text-zinc-600">部品準備見込み {date(row.partsReadyDate)}</p>}
                {row.plannedMinutes <= 0 && <p className="mt-1 text-amber-700">作業時間を確認してください。</p>}
                {attention(row).length > 0 && <p className="mt-2 font-medium text-red-700">要注意: {attention(row).join(" · ")}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.section === "ready" && <WorkTimerStartButton input={{ activityType: "REPAIR", repairId: row.id, label: row.inquiryNumber }}>修理タイマー開始 {row.inquiryNumber}</WorkTimerStartButton>}
                <Link href={`/repairs/${row.id}#repair-timer-heading`} className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50">案件のタイマーへ</Link>
              </div>
            </div>
          </article>)}
        </div>
      </section>;
    })}
  </div>;
}
