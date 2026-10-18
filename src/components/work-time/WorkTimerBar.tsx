"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { matchesCard, type TimerCard } from "@/lib/work-timer-cards";
import { useWorkTimer, type WorkTimerStartInput } from "./WorkTimerProvider";

export const ACTIVITY_LABELS = {
  REPAIR: "修理", ESTIMATE: "見積", INTAKE: "受付", INQUIRY: "問い合わせ対応",
  CUSTOMER_CONTACT: "顧客連絡", PARTS_ORDER: "発注作業", SHIPPING: "発送",
  ADMIN: "事務", OTHER: "その他",
} as const;

const QUICK_START: WorkTimerStartInput[] = [
  { activityType: "INTAKE", label: "受付" },
  { activityType: "CUSTOMER_CONTACT", label: "顧客連絡" },
  { activityType: "SHIPPING", label: "発送" },
  { activityType: "ADMIN", label: "事務" },
  { activityType: "OTHER", label: "その他" },
];

export function formatElapsed(seconds: number | null) {
  if (seconds === null) return "--:--:--";
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function target(card: TimerCard) {
  if (card.input.repairId) return { href: `/repairs/${card.input.repairId}#repair-timer-heading`, text: `Repair #${card.input.repairId}` };
  if (card.input.inquiryId) return { href: `/inquiries/${card.input.inquiryId}/review`, text: `問い合わせ #${card.input.inquiryId}` };
  if (card.input.orderRequestId) return { href: "/orders", text: `発注 #${card.input.orderRequestId}` };
  return null;
}

export function StopwatchDial({ seconds, running }: { seconds: number | null; running: boolean }) {
  const circumference = 2 * Math.PI * 37;
  const progress = seconds === null ? 0 : (seconds % 60) / 60;
  return <svg viewBox="0 0 100 100" aria-label={running ? "計測中のストップウォッチ" : "停止中のストップウォッチ"} className="h-[92px] w-[92px] shrink-0">
    <circle cx="50" cy="50" r="37" stroke="#e4e4e7" strokeWidth="6" fill="white" />
    <circle cx="50" cy="50" r="37" stroke={running ? "#16a34a" : "#64748b"} strokeWidth="6"
      fill="none" strokeLinecap="round" strokeDasharray={`${circumference * progress} ${circumference}`}
      transform="rotate(-90 50 50)" />
    <text x="50" y="46" textAnchor="middle" fontSize="12" fontWeight="700" fill="#18181b"
      fontFamily="ui-monospace, monospace">{formatElapsed(seconds)}</text>
    <text x="50" y="62" textAnchor="middle" fontSize="10" fill={running ? "#15803d" : "#71717a"}>
      {running ? "計測中" : seconds === null ? "集計待ち" : "停止"}
    </text>
  </svg>;
}

export function WorkTimerBar() {
  const timer = useWorkTimer();
  const [expanded, setExpanded] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  // SSRと初回hydrateの表示を合わせ、デスクトップだけ既定で複数カードを常時表示する。
  useEffect(() => { setExpanded(window.matchMedia("(min-width: 1024px)").matches); }, []);
  const disabled = timer.loading || !timer.ready || timer.busy;
  const activeCard = timer.cards.find(card => matchesCard(card, timer.active));

  return <aside aria-label="作業タイマー" className={`fixed bottom-3 right-3 z-40 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-xl border border-zinc-300 bg-white shadow-xl lg:sticky lg:top-12 lg:bottom-auto lg:right-auto lg:z-20 lg:mx-2 lg:h-[calc(100dvh-3rem)] lg:self-start lg:shrink-0 ${expanded ? "lg:w-[19rem]" : "lg:w-64"}`}>
    <div className="flex items-center gap-2 rounded-t-xl bg-zinc-900 px-3 py-3 text-white">
      <span aria-label={timer.ready && timer.active ? "計測中" : "停止中"} className={`h-2.5 w-2.5 shrink-0 rounded-full ${timer.ready && timer.active ? "animate-pulse bg-green-400" : "bg-zinc-400"}`} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{timer.ready && timer.active ? activeCard?.title || timer.active.workLabelSnapshot || ACTIVITY_LABELS[timer.active.activityType] : timer.loading ? "確認中" : timer.ready ? "停止中" : "状態を確認してください"}</span>
      <span role="timer" className="font-mono text-xs tabular-nums">{timer.ready && timer.active ? formatElapsed(timer.elapsedSeconds) : "--:--:--"}</span>
      {timer.active && <button type="button" onClick={() => void timer.stop()} disabled={disabled} className="rounded bg-red-700 px-2 py-1 text-xs disabled:opacity-50">停止</button>}
      <button type="button" aria-expanded={expanded} aria-controls="work-timer-cards" onClick={() => setExpanded(value => !value)} className="shrink-0 rounded bg-zinc-700 px-2 py-1 text-xs">{expanded ? "閉じる" : `一覧 ${timer.cards.length}`}</button>
    </div>
    {expanded && <div id="work-timer-cards" className="max-h-[60dvh] min-h-0 space-y-3 overflow-y-auto px-3 py-3 text-sm lg:max-h-none lg:flex-1">
      {timer.error && <p role="alert" className="text-red-700">{timer.error} <button type="button" onClick={() => void timer.refresh()} disabled={timer.loading || timer.busy} className="underline">再取得</button></p>}
      {!timer.error && !timer.ready && <button type="button" onClick={() => void timer.refresh()} className="text-blue-700 underline">再取得</button>}
      <div className="flex flex-wrap gap-1" aria-label="共通業務タイマー追加">
        {QUICK_START.map(input => <button key={input.activityType} type="button" onClick={() => timer.addCard(input)} className="rounded border border-zinc-300 px-2 py-1 text-xs">＋{input.label}</button>)}
      </div>
      {timer.cards.length === 0 && <p className="text-zinc-600">共通業務を追加するか、各画面の開始ボタンからカードを登録してください。</p>}
      <ol className="space-y-2">{timer.cards.map((card, index) => {
        const running = timer.ready && matchesCard(card, timer.active);
        const link = target(card);
        const completed = timer.totalsReady ? timer.totals[card.key] ?? 0 : null;
        const cumulative = completed === null ? null : completed + (running ? timer.elapsedSeconds ?? 0 : 0);
        return <li key={card.key} className={`rounded-lg border p-2 ${running ? "border-green-500 bg-green-50" : "border-zinc-200 bg-zinc-50/50"}`}>
          <div className="flex items-center gap-2">
            <StopwatchDial seconds={cumulative} running={running} />
            <div className="min-w-0 flex-1">
              {editingKey === card.key ? <form className="flex gap-1" onSubmit={event => {
                event.preventDefault(); timer.renameCard(card.key, draftTitle); setEditingKey(null);
              }}>
                <input aria-label="カード名" maxLength={100} autoFocus value={draftTitle} onChange={event => setDraftTitle(event.target.value)} className="min-w-0 w-full rounded border border-zinc-300 px-1 text-xs" />
                <button type="submit" className="text-xs text-blue-700">保存</button>
              </form> : <p className="break-words text-sm font-semibold">{card.title}</p>}
              <p className="truncate text-xs text-zinc-600">{ACTIVITY_LABELS[card.input.activityType]} · {link ? <Link href={link.href} className="underline">{link.text}</Link> : "共通業務"}</p>
              {card.input.repairLineItemId && <p className="text-[11px] text-amber-800">同名LABORは作業名単位で合算</p>}
              {card.needsReselection && <p className="text-[11px] text-red-700">明細が変更されました。Repair画面で再選択してください。</p>}
              <button type="button" onClick={() => { setEditingKey(card.key); setDraftTitle(card.title); }} className="text-xs text-blue-700 underline">ラベル変更</button>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => void timer.start(card.input)} disabled={disabled || running || card.needsReselection} className="rounded bg-blue-700 px-3 py-1 text-xs text-white disabled:opacity-50">{running ? "計測中" : "開始／再開"}</button>
                <button type="button" aria-label={`${card.title}を上へ`} onClick={() => timer.moveCard(card.key, -1)} disabled={index === 0} className="disabled:opacity-30">↑</button>
                <button type="button" aria-label={`${card.title}を下へ`} onClick={() => timer.moveCard(card.key, 1)} disabled={index === timer.cards.length - 1} className="disabled:opacity-30">↓</button>
                <button type="button" aria-label={`${card.title}を除去`} onClick={() => timer.removeCard(card.key)} className="text-red-700">×</button>
              </div>
            </div>
          </div>
        </li>;
      })}</ol>
      <p className="text-xs text-zinc-500">カードはこのブラウザに保存します。実績時間はサーバーの有効な記録を再集計します。休憩や洗浄機の自動運転中は停止してください。</p>
    </div>}
  </aside>;
}
