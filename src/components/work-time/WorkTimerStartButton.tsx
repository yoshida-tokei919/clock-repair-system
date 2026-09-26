"use client";

import { useWorkTimer, type WorkTimerStartInput } from "./WorkTimerProvider";

export function WorkTimerStartButton({ input, children }: { input: WorkTimerStartInput; children: React.ReactNode }) {
  const { active, loading, ready, busy, start } = useWorkTimer();
  const same = active?.activityType === input.activityType &&
    active.repairId === (input.repairId ?? null) &&
    active.inquiryId === (input.inquiryId ?? null) &&
    active.orderRequestId === (input.orderRequestId ?? null) &&
    (input.repairLineItemId === undefined ||
      (input.label !== undefined && active.workLabelSnapshot === input.label));

  return (
    <button type="button" onClick={() => void start(input)} disabled={loading || !ready || busy || same}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
      {same ? "計測中" : children}
    </button>
  );
}
