import { RepairBlockReason } from "@prisma/client";

export class RepairPlanningInputError extends Error {}

export type PlanningAction =
  | { action: "block"; blockReason: RepairBlockReason; blockReasonNote: string | null;
      remainingWorkMinutes: number | null; resumeEligibleDate: Date | null; reviewDate: Date | null }
  | { action: "resume" };

function dateField(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new RepairPlanningInputError(`${field} は YYYY-MM-DD で入力してください。`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new RepairPlanningInputError(`${field} は有効な日付で入力してください。`);
  return date;
}

export function parseRepairPlanningAction(value: unknown): PlanningAction {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RepairPlanningInputError("入力形式が正しくありません。");
  const input = value as Record<string, unknown>;
  if (input.action === "resume") {
    if (Object.keys(input).some(key => key !== "action"))
      throw new RepairPlanningInputError("再開操作に余分な項目があります。");
    return { action: "resume" };
  }
  const allowed = ["action", "blockReason", "blockReasonNote", "remainingWorkMinutes", "resumeEligibleDate", "reviewDate"];
  if (input.action !== "block" || Object.keys(input).some(key => !allowed.includes(key)))
    throw new RepairPlanningInputError("入力項目が正しくありません。");
  if (!Object.values(RepairBlockReason).includes(input.blockReason as RepairBlockReason))
    throw new RepairPlanningInputError("中断理由が正しくありません。");
  const minutes = input.remainingWorkMinutes;
  if (minutes !== undefined && minutes !== null &&
      (typeof minutes !== "number" || !Number.isSafeInteger(minutes) || minutes < 0 || minutes > 2147483647))
    throw new RepairPlanningInputError("残作業時間は0以上の整数分で入力してください。");
  const note = input.blockReasonNote;
  if (note !== undefined && note !== null && typeof note !== "string")
    throw new RepairPlanningInputError("理由メモが正しくありません。");
  return {
    action: "block", blockReason: input.blockReason as RepairBlockReason,
    blockReasonNote: typeof note === "string" ? note.trim() || null : null,
    remainingWorkMinutes: minutes === undefined ? null : minutes as number | null,
    resumeEligibleDate: dateField(input.resumeEligibleDate, "再開可能日"),
    reviewDate: dateField(input.reviewDate, "再確認日"),
  };
}

export function planningStateView(state: {
  blocked: boolean; blockReason: RepairBlockReason | null; blockReasonNote: string | null;
  remainingWorkMinutes: number | null; resumeEligibleDate: Date | null; reviewDate: Date | null;
} | null) {
  return {
    blocked: state?.blocked ?? false,
    blockReason: state?.blockReason ?? null,
    blockReasonNote: state?.blockReasonNote ?? null,
    remainingWorkMinutes: state?.remainingWorkMinutes ?? null,
    resumeEligibleDate: state?.resumeEligibleDate?.toISOString().slice(0, 10) ?? null,
    reviewDate: state?.reviewDate?.toISOString().slice(0, 10) ?? null,
  };
}
