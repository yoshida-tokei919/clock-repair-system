"use client";

import { useWorkTimer, type WorkTimerStartInput } from "./WorkTimerProvider";
import { cardKey } from "@/lib/work-timer-cards";

export function WorkTimerStartButton({ input, children }: { input: WorkTimerStartInput; children: React.ReactNode }) {
  const { active, loading, ready, busy, start } = useWorkTimer();
  const same = ready && active !== null && cardKey(input) === cardKey({
    activityType: active.activityType, repairId: active.repairId ?? undefined,
    inquiryId: active.inquiryId ?? undefined, orderRequestId: active.orderRequestId ?? undefined,
    label: active.workLabelSnapshot ?? undefined,
  });

  return (
    <button type="button" onClick={() => void start(input)} disabled={loading || !ready || busy || same}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
      {same ? "計測中" : children}
    </button>
  );
}
