import { availableMinutesForDate, parseWorkDate, serializeWorkDate, type WorkCalendarException } from "./work-calendar";

export const SCHEDULABLE_STATUS = "作業待ち";
export const SCHEDULE_HORIZON_DAYS = 180;
const TERMINAL_STATUSES = new Set(["作業完了", "納品済み", "キャンセル"]);

export type ScheduleRepair = {
  id: number;
  inquiryNumber: string;
  status: string;
  scheduleLocked: boolean;
  scheduledDate: Date | null;
  estimatedWorkMinutes: number;
  priorityScore: number;
  deliveryDateExpected: Date | null;
  receptionDate: Date | null;
};

export type SchedulePlacement = {
  id: number;
  inquiryNumber: string;
  priorityScore: number;
  estimatedWorkMinutes: number;
  deliveryDateExpected: string | null;
  previousDate: string | null;
  proposedDate: string | null;
  unplacedReason: string | null;
};

export type ScheduleDayItem = { id: number; inquiryNumber: string; minutes: number };

export type ScheduleDay = {
  date: string;
  availableMinutes: number;
  lockedMinutes: number;
  proposedMinutes: number;
  lockedItems: ScheduleDayItem[];
  proposedItems: ScheduleDayItem[];
};

export type ScheduleExclusion = {
  id: number;
  inquiryNumber: string;
  status: string;
  scheduledDate: string | null;
  estimatedWorkMinutes: number;
  reason: string;
};

export type SchedulePreview = {
  startDate: string;
  endDate: string;
  placements: SchedulePlacement[];
  exclusions: ScheduleExclusion[];
  days: ScheduleDay[];
  lockedWithoutDate: number;
  lockedWithoutEstimate: number;
};

const STATUS_REASONS: Record<string, string> = {
  "送付待ち": "時計の送付待ち",
  "受付": "受付段階",
  "見積中": "見積中",
  "承認待ち": "承認待ち",
  "部品待ち(未注文)": "部品待ち（未注文）",
  "部品待ち(注文済み)": "部品待ち（注文済み）",
  "部品入荷済み": "作業待ちへの変更待ち",
  "作業中": "作業中",
  "保留": "保留中",
};

export function workReadiness(repair: Pick<ScheduleRepair, "status" | "scheduleLocked" | "estimatedWorkMinutes">):
  { kind: "ready" | "completed" | "excluded"; reason: string | null } {
  if (TERMINAL_STATUSES.has(repair.status)) return { kind: "completed", reason: null };
  if (repair.scheduleLocked) return { kind: "excluded", reason: "予定日が固定されています" };
  if (repair.status !== SCHEDULABLE_STATUS) {
    const reason = Object.prototype.hasOwnProperty.call(STATUS_REASONS, repair.status)
      ? STATUS_REASONS[repair.status]
      : `作業待ち以外の状態（${repair.status}）`;
    return { kind: "excluded", reason };
  }
  if (repair.estimatedWorkMinutes <= 0) return { kind: "excluded", reason: "想定作業時間が未入力です" };
  return { kind: "ready", reason: null };
}

export function isScheduleChange(placement: SchedulePlacement): placement is SchedulePlacement & { proposedDate: string } {
  return placement.proposedDate !== null && placement.previousDate !== placement.proposedDate;
}

export function todayInJapan(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateOrNull(date: Date | null): string | null {
  return date ? serializeWorkDate(date) : null;
}

function compareNullableDates(a: Date | null, b: Date | null): number {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return a.getTime() - b.getTime();
}

export function buildSchedulePreview(
  startDate: string,
  repairs: readonly ScheduleRepair[],
  exceptions: readonly WorkCalendarException[],
  horizonDays = SCHEDULE_HORIZON_DAYS,
): SchedulePreview {
  const start = parseWorkDate(startDate);
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 366) {
    throw new Error("Invalid schedule horizon.");
  }
  const days: ScheduleDay[] = Array.from({ length: horizonDays }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    const key = serializeWorkDate(date);
    return { date: key, availableMinutes: availableMinutesForDate(key, exceptions), lockedMinutes: 0, proposedMinutes: 0, lockedItems: [], proposedItems: [] };
  });
  const dayByDate = new Map(days.map(day => [day.date, day]));
  let lockedWithoutDate = 0;
  let lockedWithoutEstimate = 0;

  for (const repair of repairs) {
    if (!repair.scheduleLocked || TERMINAL_STATUSES.has(repair.status)) continue;
    if (repair.estimatedWorkMinutes <= 0) {
      lockedWithoutEstimate++;
      continue;
    }
    if (!repair.scheduledDate) {
      lockedWithoutDate++;
      continue;
    }
    const day = dayByDate.get(serializeWorkDate(repair.scheduledDate));
    if (day) {
      day.lockedMinutes += repair.estimatedWorkMinutes;
      day.lockedItems.push({ id: repair.id, inquiryNumber: repair.inquiryNumber, minutes: repair.estimatedWorkMinutes });
    }
  }

  const exclusions = repairs.flatMap(repair => {
    const readiness = workReadiness(repair);
    return readiness.kind === "excluded" ? [{
      id: repair.id,
      inquiryNumber: repair.inquiryNumber,
      status: repair.status,
      scheduledDate: dateOrNull(repair.scheduledDate),
      estimatedWorkMinutes: repair.estimatedWorkMinutes,
      reason: readiness.reason!,
    }] : [];
  });
  const candidates = repairs
    .filter(repair => workReadiness(repair).kind === "ready")
    .sort((a, b) => b.priorityScore - a.priorityScore
      || compareNullableDates(a.deliveryDateExpected, b.deliveryDateExpected)
      || compareNullableDates(a.receptionDate, b.receptionDate)
      || a.id - b.id);

  const maxGrossMinutes = Math.max(...days.map(item => item.availableMinutes));
  const placements = candidates.map(repair => {
    const day = days.find(item => item.availableMinutes - item.lockedMinutes - item.proposedMinutes >= repair.estimatedWorkMinutes);
    if (day) {
      day.proposedMinutes += repair.estimatedWorkMinutes;
      day.proposedItems.push({ id: repair.id, inquiryNumber: repair.inquiryNumber, minutes: repair.estimatedWorkMinutes });
    }
    return {
      id: repair.id,
      inquiryNumber: repair.inquiryNumber,
      priorityScore: repair.priorityScore,
      estimatedWorkMinutes: repair.estimatedWorkMinutes,
      deliveryDateExpected: dateOrNull(repair.deliveryDateExpected),
      previousDate: dateOrNull(repair.scheduledDate),
      proposedDate: day?.date ?? null,
      unplacedReason: day ? null : repair.estimatedWorkMinutes > maxGrossMinutes
        ? "1日の作業可能時間に収まらないため配置できません"
        : "期間内の空き時間が足りないため配置できません",
    };
  });
  return { startDate, endDate: days.at(-1)!.date, placements, exclusions, days, lockedWithoutDate, lockedWithoutEstimate };
}
