import type { ShipmentStatus } from "@prisma/client";

export type ScheduleGroup = "OVERDUE" | "TODAY" | "TOMORROW" | "THIS_WEEK" | "NEXT_WEEK" | "LATER" | "UNPLANNED";

export const SCHEDULE_GROUPS: { key: ScheduleGroup; label: string }[] = [
  { key: "OVERDUE", label: "遅延" },
  { key: "TODAY", label: "今日" },
  { key: "TOMORROW", label: "明日" },
  { key: "THIS_WEEK", label: "今週" },
  { key: "NEXT_WEEK", label: "来週" },
  { key: "LATER", label: "それ以降" },
  { key: "UNPLANNED", label: "予定日未設定" },
];

export function shipmentRepairSummary(repairs: readonly { repair: { status: string; deliveryNoteId: number | null } }[]) {
  const total = repairs.length;
  const workCompleted = repairs.filter(({ repair }) => repair.status === "作業完了").length;
  const notesIssued = repairs.filter(({ repair }) => repair.deliveryNoteId !== null).length;
  const deliveryNoteState = notesIssued === 0 ? "未発行" : notesIssued === total ? "全件発行済み" : "一部発行済み";
  return { total, workCompleted, notesIssued, deliveryNoteState };
}

export function tokyoDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function shipmentScheduleGroup(
  plannedShipDate: string | null,
  today: string,
  status: ShipmentStatus,
  actualShippedAt: string | null,
): ScheduleGroup | null {
  if (status === "CANCELLED" || actualShippedAt !== null) return null;
  if (plannedShipDate === null) return "UNPLANNED";
  if (plannedShipDate < today) return "OVERDUE";
  if (plannedShipDate === today) return "TODAY";
  if (plannedShipDate === addDays(today, 1)) return "TOMORROW";
  const day = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const nextMonday = addDays(today, day === 0 ? 1 : 8 - day);
  if (plannedShipDate < nextMonday) return "THIS_WEEK";
  if (plannedShipDate < addDays(nextMonday, 7)) return "NEXT_WEEK";
  return "LATER";
}
