"use client";

import { useWorkTimer, type WorkTimerStartInput } from "./WorkTimerProvider";

export const ACTIVITY_LABELS = {
  REPAIR: "修理",
  ESTIMATE: "見積",
  INTAKE: "受付",
  INQUIRY: "問い合わせ対応",
  CUSTOMER_CONTACT: "顧客連絡",
  PARTS_ORDER: "発注作業",
  SHIPPING: "発送",
  ADMIN: "事務",
  OTHER: "その他",
} as const;

const QUICK_START: WorkTimerStartInput[] = [
  { activityType: "INTAKE", label: "受付" },
  { activityType: "CUSTOMER_CONTACT", label: "顧客連絡" },
  { activityType: "SHIPPING", label: "発送" },
  { activityType: "ADMIN", label: "事務" },
  { activityType: "OTHER", label: "その他" },
];

function formatElapsed(seconds: number | null) {
  if (seconds === null) return "--:--:--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function WorkTimerBar() {
  const { active, loading, ready, busy, error, elapsedSeconds, refresh, start, stop } = useWorkTimer();
  const disabled = loading || !ready || busy;

  return (
    <div className="sticky top-12 z-30 border-b border-zinc-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 text-sm">
        {active ? (
          <>
            <span className="font-semibold text-zinc-900">{ACTIVITY_LABELS[active.activityType]}</span>
            {active.workLabelSnapshot && <span className="text-zinc-600">{active.workLabelSnapshot}</span>}
            <span role="timer" className="font-mono tabular-nums text-zinc-900">{formatElapsed(elapsedSeconds)}</span>
            <button type="button" onClick={() => void stop()} disabled={disabled}
              className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50">
              {busy ? "処理中…" : "停止"}
            </button>
          </>
        ) : <span className="font-medium text-zinc-700">{loading ? "タイマーを確認中…" : "タイマー停止中"}</span>}
        <div className="flex flex-wrap items-center gap-2" aria-label="共通業務タイマー">
          {QUICK_START.map(item => {
            const same = active?.activityType === item.activityType &&
              active.repairId === null && active.inquiryId === null && active.orderRequestId === null;
            return (
              <button key={item.activityType} type="button" onClick={() => void start(item)} disabled={disabled || same}
                className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                {same ? `${item.label}を計測中` : `${item.label}開始`}
              </button>
            );
          })}
        </div>
        {error && (
          <span role="alert" className="text-red-700">
            {error} <button type="button" onClick={() => void refresh()} disabled={loading || busy} className="underline disabled:opacity-50">再取得</button>
          </span>
        )}
      </div>
    </div>
  );
}
