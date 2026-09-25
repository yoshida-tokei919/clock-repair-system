export const DEFAULT_WORK_MINUTES = 480;

export type WorkCalendarInput = {
  date: string;
  workDate: Date;
  availableMinutes: number;
  note: string | null;
};

export type WorkCalendarException = {
  workDate: Date;
  availableMinutes: number;
  note: string | null;
};

export function parseWorkDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
    throw new Error("date must be a valid YYYY-MM-DD calendar date.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("date must be a valid YYYY-MM-DD calendar date.");
  }
  return date;
}

export function serializeWorkDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("Invalid calendar date.");
  return date.toISOString().slice(0, 10);
}

export function parseWorkMonth(value: unknown): { month: string; start: Date; end: Date } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value) || value.startsWith("0000")) {
    throw new Error("month must be YYYY-MM.");
  }
  const start = parseWorkDate(`${value}-01`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { month: value, start, end };
}

export function parseWorkCalendarInput(value: unknown): WorkCalendarInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Calendar body must be an object.");
  }
  const body = value as Record<string, unknown>;
  const keys = ["date", "availableMinutes", "note"];
  if (Object.keys(body).length !== keys.length || Object.keys(body).some(key => !keys.includes(key))) {
    throw new Error("Calendar body must contain only date, availableMinutes, and note.");
  }
  const workDate = parseWorkDate(body.date);
  if (!Number.isInteger(body.availableMinutes) || (body.availableMinutes as number) < 0 || (body.availableMinutes as number) > 1440) {
    throw new Error("availableMinutes must be an integer from 0 to 1440.");
  }
  if (body.note !== null && typeof body.note !== "string") {
    throw new Error("note must be a string or null.");
  }
  const note = typeof body.note === "string" ? body.note.trim() || null : null;
  if (note && note.length > 200) throw new Error("note must be at most 200 characters.");
  return { date: body.date as string, workDate, availableMinutes: body.availableMinutes as number, note };
}

export function isDefaultWorkDay(value: Pick<WorkCalendarInput, "availableMinutes" | "note">): boolean {
  return value.availableMinutes === DEFAULT_WORK_MINUTES && value.note === null;
}

export function availableMinutesForDate(date: string, exceptions: readonly WorkCalendarException[]): number {
  parseWorkDate(date);
  return exceptions.find(row => serializeWorkDate(row.workDate) === date)?.availableMinutes ?? DEFAULT_WORK_MINUTES;
}
