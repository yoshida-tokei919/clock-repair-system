import type { Prisma } from "@prisma/client";

import { addConfirmedRepairStatusLog, reconcileRepairPartAllocations } from "@/lib/repair-part-allocation";
import { getRepairStatusTransition } from "@/lib/repair-status-transition";
import { APPROVAL_EVENT_PREFIX } from "@/lib/repair-approval-audit";

export const REPAIR_STATUSES = ["送付待ち", "受付", "見積中", "承認待ち", "部品待ち(未注文)", "部品待ち(注文済み)", "部品入荷済み", "作業待ち", "作業中", "作業完了", "納品済み", "修理不可返却", "キャンセル返却", "キャンセル", "保留"] as const;
const RETURN_STATUSES = new Set(["修理不可返却", "キャンセル返却"]);

export class ManualStatusValidationError extends Error {}

export function assertRepairStatus(value: unknown): asserts value is string {
  if (typeof value !== "string" || !REPAIR_STATUSES.includes(value as typeof REPAIR_STATUSES[number])) {
    throw new ManualStatusValidationError("無効なステータスです。");
  }
}

export function assertGenericRepairPatchAllowed(currentStatus: string) {
  if (RETURN_STATUSES.has(currentStatus)) {
    throw new ManualStatusValidationError("返却処理済みの案件は通常編集できません。納品済みへの更新はステータス操作から行ってください。");
  }
}

export function assertManualRepairStatusTransition(currentStatus: string, requestedStatus: string, allowReturnStatus = false) {
  if (RETURN_STATUSES.has(requestedStatus) && !allowReturnStatus) {
    throw new ManualStatusValidationError("返却ステータスは専用の返却処理から確定してください。");
  }
}

/** Date-only input is the start of the selected day in Japan. */
export function parseManualDate(value: unknown, withTime = false): Date {
  if (typeof value !== "string") throw new ManualStatusValidationError("日時を入力してください。");
  const match = withTime
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
    : /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  if (!match) throw new ManualStatusValidationError("日時の形式が正しくありません。");
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = withTime ? Number(hourText) : 0, minute = withTime ? Number(minuteText) : 0;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) {
    throw new ManualStatusValidationError("実在する日時を入力してください。");
  }
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
}

export async function correctManualStatusDate(
  tx: Prisma.TransactionClient,
  repairId: number,
  status: string,
  date: Date,
  actorId: number | null,
  currentStatus: string,
) {
  assertRepairStatus(status);
  if (RETURN_STATUSES.has(status)) throw new ManualStatusValidationError("返却処理の履歴日は通常のステータス編集から変更できません。");
  const log = await tx.repairStatusLog.findFirst({
    where: { repairId, status }, orderBy: { id: "desc" }, select: { id: true },
  });
  if (!log) throw new ManualStatusValidationError(`「${status}」の履歴がないため日付を修正できません。`);
  if (status === "受付") {
    if (currentStatus === "送付待ち") throw new ManualStatusValidationError("送付待ち中は受付日を設定できません。");
    await tx.repair.update({ where: { id: repairId }, data: { receptionDate: date } });
  }
  await tx.repairStatusLog.update({ where: { id: log.id }, data: { changedAt: date, changedBy: actorId } });
}

export async function persistManualRepairStatus(
  tx: Prisma.TransactionClient,
  repairId: number,
  requestedStatus: string,
  actorId: number | null,
  date?: Date,
  reconcile: typeof reconcileRepairPartAllocations = reconcileRepairPartAllocations,
  options: { allowReturnStatus?: boolean } = {},
) {
  assertRepairStatus(requestedStatus);
  const current = await tx.repair.findUniqueOrThrow({ where: { id: repairId }, select: { status: true } });
  assertManualRepairStatusTransition(current.status, requestedStatus, options.allowReturnStatus);
  const priorLog = await tx.repairStatusLog.findFirst({ where: { repairId }, orderBy: { id: "desc" }, select: { id: true } });
  if (current.status !== requestedStatus) {
    await tx.repair.update({ where: { id: repairId }, data: { status: requestedStatus, ...getRepairStatusTransition(current.status, requestedStatus) } });
  }
  const reconciliation = await reconcile(tx, repairId, { requestedStatus });
  const finalStatus = reconciliation.status;
  if (finalStatus !== requestedStatus) date = undefined;
  await addConfirmedRepairStatusLog(tx, repairId, finalStatus);
  await tx.repairStatusLog.updateMany({
    where: { repairId, id: { gt: priorLog?.id ?? 0 }, status: { not: { startsWith: APPROVAL_EVENT_PREFIX } } },
    data: { changedBy: actorId },
  });
  if (date) await correctManualStatusDate(tx, repairId, finalStatus, date, actorId, finalStatus);
  return { repair: await tx.repair.findUniqueOrThrow({ where: { id: repairId } }), reconciliation };
}
