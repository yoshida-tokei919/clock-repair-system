"use client";

import { WorkTimerStartButton } from "@/components/work-time/WorkTimerStartButton";

type LaborLine = {
  id: number;
  itemNameSnapshot: string;
  estimateDisplayNameSnapshot: string | null;
};

export function RepairWorkTimerPanel({ repairId, laborLines }: { repairId: number; laborLines: LaborLine[] }) {
  return (
    <section aria-labelledby="repair-timer-heading" className="mx-auto mt-4 max-w-7xl rounded-lg border border-zinc-200 bg-white p-5">
      <h2 id="repair-timer-heading" className="text-lg font-semibold text-zinc-900">作業タイマー</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <WorkTimerStartButton input={{ activityType: "ESTIMATE", repairId, label: `Repair #${repairId} 見積` }}>
          見積開始
        </WorkTimerStartButton>
      </div>
      {laborLines.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-zinc-700">修理作業（技術料明細）</p>
          {laborLines.map(line => (
            <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2 text-sm">
              <span className="text-zinc-700">{line.estimateDisplayNameSnapshot?.trim() || line.itemNameSnapshot}</span>
              <WorkTimerStartButton input={{ activityType: "REPAIR", repairId, repairLineItemId: line.id, label: line.estimateDisplayNameSnapshot?.trim() || line.itemNameSnapshot }}>
                修理開始
              </WorkTimerStartButton>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
