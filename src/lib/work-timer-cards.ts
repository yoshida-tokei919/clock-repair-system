import { WORK_TIME_ACTIVITY_TYPES, type WorkTimeActivityType } from "./work-time-session-domain";

export type TimerCardInput = {
  activityType: WorkTimeActivityType;
  repairId?: number;
  inquiryId?: number;
  orderRequestId?: number;
  repairLineItemId?: number;
  label?: string;
};
export type TimerCard = { key: string; input: TimerCardInput; title: string; needsReselection?: boolean };
type SessionIdentity = {
  activityType: WorkTimeActivityType; repairId: number | null; inquiryId: number | null;
  orderRequestId: number | null; workLabelSnapshot: string | null;
};

const id = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
export function cardKey(input: TimerCardInput): string {
  return JSON.stringify([input.activityType, input.repairId ?? null, input.inquiryId ?? null,
    input.orderRequestId ?? null, input.label?.trim() || null]);
}
export function matchesCard(card: TimerCard, session: SessionIdentity | null): boolean {
  return !!session && card.key === cardKey({ activityType: session.activityType,
    repairId: session.repairId ?? undefined, inquiryId: session.inquiryId ?? undefined,
    orderRequestId: session.orderRequestId ?? undefined, label: session.workLabelSnapshot ?? undefined });
}
export function parseCards(value: unknown): TimerCard[] {
  if (!Array.isArray(value)) return [];
  const result: TimerCard[] = [];
  for (const item of value.slice(0, 30)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const card = item as Partial<TimerCard>;
    const input = card.input;
    if (!input || !WORK_TIME_ACTIVITY_TYPES.includes(input.activityType) ||
        [input.repairId, input.inquiryId, input.orderRequestId, input.repairLineItemId].some(value => value !== undefined && !id(value)) ||
        (input.label !== undefined && (typeof input.label !== "string" || input.label.length > 200)) ||
        typeof card.title !== "string" || !card.title.trim() || card.title.length > 100) continue;
    const key = cardKey(input);
    if (result.some(existing => existing.key === key)) continue;
    result.push({ key, input, title: card.title, needsReselection: card.needsReselection === true });
  }
  return result;
}

export function sumCompletedSeconds(rows: { startedAt: Date; endedAt: Date | null; invalidatedAt: Date | null }[]): number {
  return rows.reduce((total, row) => total + (row.endedAt && !row.invalidatedAt
    ? Math.max(0, Math.floor((row.endedAt.getTime() - row.startedAt.getTime()) / 1000)) : 0), 0);
}
