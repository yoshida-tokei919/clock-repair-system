"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useWorkTimer } from "@/components/work-time/WorkTimerProvider";
import { SCAN_MODES, timerDecision, type ScanMode } from "@/lib/scan-session-domain";
import { useScanSession } from "./ScanSessionProvider";

const MODE_LABELS: Record<ScanMode, string> = {
  OPEN_REPAIR: "案件を開く",
  TIMER: "作業タイマー",
  BATCH_SELECT: "一括選択",
  DELIVERY_NOTE: "納品書対象",
  SHIPMENT_SELECT: "発送対象",
  LOCATION_MOVE: "保管場所移動",
  LOCATION_AUDIT: "保管場所棚卸し",
};

export function ScanReceiverBar() {
  const { mode, selected, candidate, feedback, scanning, queuedCount, destination, moving, auditResult, auditing,
    setMode, scan, remove, clear, confirmTimer, confirmLocationMove, confirmLocationAudit,
    resetLocationDestination } = useScanSession();
  const timer = useWorkTimer();
  const [manual, setManual] = useState("");
  const selecting = mode === "BATCH_SELECT" || mode === "DELIVERY_NOTE" || mode === "SHIPMENT_SELECT" ||
    mode === "LOCATION_MOVE" || mode === "LOCATION_AUDIT";
  const timerAction = candidate ? timerDecision(timer.active, candidate.repairId) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    scan(manual);
    setManual("");
  };

  return (
    <section aria-label="タグ読み取り" className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm">
      <div className="mx-auto max-w-7xl space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="scan-mode" className="font-medium text-zinc-800">読取モード</label>
          <select id="scan-mode" value={mode} onChange={event => setMode(event.target.value as ScanMode)}
            className="rounded border border-zinc-300 bg-white px-2 py-1.5">
            {SCAN_MODES.map(value => <option key={value} value={value}>{MODE_LABELS[value]}</option>)}
          </select>
          <form onSubmit={submit} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <label htmlFor="scan-manual" className="sr-only">タグの読み取り値を手入力</label>
            <input id="scan-manual" value={manual} onChange={event => setManual(event.target.value)}
              autoComplete="off" placeholder={(mode === "LOCATION_MOVE" || mode === "LOCATION_AUDIT") && !destination ?
                "Locationタグ / LOCコード" : "PhysicalTag / PTコード"}
              className="min-w-48 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5" />
            <button type="submit" disabled={auditing} className="rounded bg-blue-700 px-3 py-1.5 font-medium text-white disabled:opacity-50">
              照合
            </button>
          </form>
          {scanning && <span role="status" className="text-zinc-600">照合中（待機 {queuedCount} 件）</span>}
        </div>
        {feedback && <p role={feedback.kind === "error" ? "alert" : "status"}
          className={feedback.kind === "error" ? "text-red-700" : "text-zinc-700"}>{feedback.message}</p>}
        {mode === "LOCATION_MOVE" && <div className="flex flex-wrap items-center gap-2">
          {destination ? <span>移動先: <strong>{destination.name}</strong> / {destination.locationType}
            {destination.shortCode ? ` / ${destination.shortCode}` : ""}</span>
            : <span>移動先のLocationタグを読み取ってください</span>}
          {destination && <button type="button" onClick={resetLocationDestination}
            disabled={moving} className="text-blue-700 underline disabled:opacity-50">移動先を変更</button>}
          <button type="button" onClick={() => void confirmLocationMove()}
            disabled={!destination || selected.length === 0 || moving || scanning}
            className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
            {moving ? "移動中..." : "この保管場所へ移動"}
          </button>
        </div>}
        {mode === "LOCATION_AUDIT" && <div className="flex flex-wrap items-center gap-2">
          {destination ? <span>棚卸し場所: <strong>{destination.name}</strong> / {destination.locationType}
            {destination.shortCode ? ` / ${destination.shortCode}` : ""}</span>
            : <span>棚卸し場所のLocationタグ / LOCコードを読み取ってください</span>}
          {destination && <button type="button" onClick={resetLocationDestination}
            disabled={auditing} className="text-blue-700 underline disabled:opacity-50">棚卸し場所を変更</button>}
          <button type="button" onClick={() => void confirmLocationAudit()}
            disabled={!destination || auditing || scanning || queuedCount > 0}
            className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
            {auditing ? "確認中..." : "棚卸し結果を確認"}
          </button>
        </div>}
        {mode === "LOCATION_AUDIT" && auditResult && <div className="space-y-1 rounded border border-zinc-300 bg-white px-3 py-2">
          <p className="font-medium">棚卸し結果: 一致 {auditResult.counts.match}件 / 別場所 {auditResult.counts.otherLocation}件 /
            保管場所未登録 {auditResult.counts.unassigned}件 / 未検出 {auditResult.counts.missing}件</p>
          {auditResult.scanned.filter(item => item.classification !== "MATCH").map(item => {
            const selectedItem = selected.find(repair => repair.repairId === item.repairId);
            return <p key={item.repairId}>
              {item.classification === "OTHER_LOCATION" ? "別場所" : "保管場所未登録"}: {item.inquiryNumber}
              {selectedItem ? ` / ${selectedItem.shortCode}` : ""}
              {item.classification === "OTHER_LOCATION" ? ` / 現在地: ${item.currentLocation?.name ?? "不明"}` : ""}
            </p>;
          })}
          {auditResult.missing.map(item => <p key={item.repairId}>未検出: {item.inquiryNumber}（案件ID {item.repairId}）</p>)}
        </div>}
        {mode === "TIMER" && candidate && (
          <div className="flex flex-wrap items-center gap-2 rounded border border-blue-200 bg-white px-2 py-1.5">
            <span>候補: <strong>{candidate.inquiryNumber}</strong> / {candidate.shortCode}</span>
            <button type="button" onClick={() => void confirmTimer()}
              disabled={timer.loading || !timer.ready || timer.busy || timerAction === "ALREADY_ACTIVE"}
              className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50">
              {timerAction === "SWITCH" ? "現在のタイマーを終了して切替" :
                timerAction === "ALREADY_ACTIVE" ? "計測中" : "確認して計測開始"}
            </button>
            {(timer.loading || !timer.ready) && <span className="text-zinc-600">タイマーを確認中です。</span>}
          </div>
        )}
        {selecting && (
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">選択中: {selected.length}件</span>
              {selected.length > 0 && <button type="button" onClick={clear} disabled={auditing}
                className="text-blue-700 underline disabled:opacity-50">すべて解除</button>}
              <span className="text-zinc-600">モード切替時に選択はクリアされます。</span>
            </div>
            {selected.length > 0 && <ul className="flex flex-wrap gap-2 pt-1">
              {selected.map(item => <li key={item.repairId} className="rounded border border-zinc-300 bg-white px-2 py-1">
                {item.inquiryNumber} / {item.shortCode}{" "}
                <button type="button" onClick={() => remove(item.repairId)}
                  disabled={auditing} aria-label={`${item.inquiryNumber} を選択から外す`}
                  className="text-blue-700 underline disabled:opacity-50">解除</button>
              </li>)}
            </ul>}
          </div>
        )}
      </div>
    </section>
  );
}
