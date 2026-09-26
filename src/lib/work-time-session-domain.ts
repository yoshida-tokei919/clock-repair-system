export const WORK_TIME_ACTIVITY_TYPES = [
  "REPAIR", "ESTIMATE", "INTAKE", "INQUIRY", "CUSTOMER_CONTACT",
  "PARTS_ORDER", "SHIPPING", "ADMIN", "OTHER",
] as const;

export type WorkTimeActivityType = typeof WORK_TIME_ACTIVITY_TYPES[number];
export type StartInput = {
  activityType: WorkTimeActivityType;
  repairId: number | null;
  inquiryId: number | null;
  orderRequestId: number | null;
  repairLineItemId: number | null;
  label: string | null;
};
export type CorrectionInput = { startedAt: Date; endedAt: Date; reason: string };

export class WorkTimeInputError extends Error {}

function objectBody(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkTimeInputError("Body must be an object.");
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !allowed.includes(key))) {
    throw new WorkTimeInputError("Unknown field in body.");
  }
  return body;
}

export function parsePositiveId(value: unknown, field = "id"): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new WorkTimeInputError(`${field} must be a positive integer.`);
  }
  return value;
}

export function parsePathId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new WorkTimeInputError("id must be a positive integer.");
  return parsePositiveId(Number(value));
}

function optionalId(value: unknown, field: string): number | null {
  return value === undefined || value === null ? null : parsePositiveId(value, field);
}

function normalizedText(value: unknown, field: string, max: number, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) throw new WorkTimeInputError(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new WorkTimeInputError(`${field} must be a string.`);
  const text = value.trim();
  if (required && !text) throw new WorkTimeInputError(`${field} is required.`);
  if (text.length > max) throw new WorkTimeInputError(`${field} must be at most ${max} characters.`);
  return text || null;
}

export function parseStartInput(value: unknown): StartInput {
  const body = objectBody(value, ["activityType", "repairId", "inquiryId", "orderRequestId", "repairLineItemId", "label"]);
  if (!WORK_TIME_ACTIVITY_TYPES.includes(body.activityType as WorkTimeActivityType)) {
    throw new WorkTimeInputError("Invalid activityType.");
  }
  const repairId = optionalId(body.repairId, "repairId");
  const repairLineItemId = optionalId(body.repairLineItemId, "repairLineItemId");
  if ((body.activityType === "REPAIR" || body.activityType === "ESTIMATE") && !repairId) {
    throw new WorkTimeInputError("repairId is required for REPAIR and ESTIMATE.");
  }
  if (repairLineItemId && !repairId) throw new WorkTimeInputError("repairId is required with repairLineItemId.");
  if (repairLineItemId && body.activityType !== "REPAIR") {
    throw new WorkTimeInputError("repairLineItemId is only valid for REPAIR.");
  }
  return {
    activityType: body.activityType as WorkTimeActivityType,
    repairId,
    inquiryId: optionalId(body.inquiryId, "inquiryId"),
    orderRequestId: optionalId(body.orderRequestId, "orderRequestId"),
    repairLineItemId,
    label: normalizedText(body.label, "label", 200, false),
  };
}

export function secondPrecision(value: Date): Date {
  if (Number.isNaN(value.getTime())) throw new WorkTimeInputError("Invalid timestamp.");
  return new Date(Math.floor(value.getTime() / 1000) * 1000);
}

export function parseTimestamp(value: unknown, field: string): Date {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value) : null;
  if (!match) {
    throw new WorkTimeInputError(`${field} must be ISO 8601 with a timezone.`);
  }
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (year === 0 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
      calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour ||
      calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) {
    throw new WorkTimeInputError(`${field} is invalid.`);
  }
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) throw new WorkTimeInputError(`${field} is invalid.`);
  return secondPrecision(date);
}

export function parseCorrectionInput(value: unknown): CorrectionInput {
  const body = objectBody(value, ["startedAt", "endedAt", "reason"]);
  const startedAt = parseTimestamp(body.startedAt, "startedAt");
  const endedAt = parseTimestamp(body.endedAt, "endedAt");
  if (endedAt < startedAt) throw new WorkTimeInputError("endedAt must not be before startedAt.");
  return { startedAt, endedAt, reason: normalizedText(body.reason, "reason", 500, true)! };
}

export function parseReasonInput(value: unknown): string {
  const body = objectBody(value, ["reason"]);
  return normalizedText(body.reason, "reason", 500, true)!;
}

export function isActive(session: { endedAt: Date | null; invalidatedAt: Date | null }): boolean {
  return session.endedAt === null && session.invalidatedAt === null;
}

export function closedAt(startedAt: Date, now: Date): Date {
  const time = secondPrecision(now);
  return time < startedAt ? startedAt : time;
}

export function correctionData(
  current: { startedAt: Date; endedAt: Date | null; originalStartedAt: Date | null; originalEndedAt: Date | null; invalidatedAt: Date | null },
  input: CorrectionInput,
  now: Date,
) {
  if (current.invalidatedAt) throw new WorkTimeInputError("Invalidated session cannot be corrected.");
  if (!current.endedAt) throw new WorkTimeInputError("Stop the active session before correction.");
  return {
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    originalStartedAt: current.originalStartedAt ?? current.startedAt,
    originalEndedAt: current.originalEndedAt ?? current.endedAt,
    adjustedAt: secondPrecision(now),
    adjustmentReason: input.reason,
  };
}

export type WorkSnapshotSource = {
  lineType: "LABOR" | "PART";
  itemNameSnapshot: string;
  estimateDisplayNameSnapshot: string | null;
  repairWorkCategoryId: number | null;
  categoryNameSnapshot: string | null;
  repairWorkCategory: { repairType: string; displayName: string } | null;
  targetPartNameId: string | null;
  targetPartNameSnapshot: string | null;
  targetPartName: { nameJa: string } | null;
  repairWorkActionId: number | null;
  actionNameSnapshot: string | null;
  repairWorkAction: { displayName: string } | null;
  detailLabelSnapshot: string | null;
};

export function workSnapshot(line: WorkSnapshotSource) {
  if (line.lineType !== "LABOR") throw new WorkTimeInputError("repairLineItemId must identify a LABOR row.");
  return {
    lineType: line.lineType,
    repairType: line.repairWorkCategory?.repairType ?? null,
    itemName: line.itemNameSnapshot,
    repairWorkCategoryId: line.repairWorkCategoryId,
    repairWorkCategoryName: line.categoryNameSnapshot ?? line.repairWorkCategory?.displayName ?? null,
    targetPartNameId: line.targetPartNameId,
    targetPartName: line.targetPartNameSnapshot ?? line.targetPartName?.nameJa ?? null,
    repairWorkActionId: line.repairWorkActionId,
    repairWorkActionName: line.actionNameSnapshot ?? line.repairWorkAction?.displayName ?? null,
    detailLabel: line.detailLabelSnapshot,
  };
}

export function workLabel(line: WorkSnapshotSource): string {
  return line.estimateDisplayNameSnapshot?.trim() || line.itemNameSnapshot;
}

type Named = { name: string } | null;
export type RepairSnapshotSource = {
  inquiryNumber: string;
  movementMakerId: number | null;
  movementMaker: Named;
  movementCaliberId: number | null;
  movementCaliber: Named;
  baseMovementMakerId: number | null;
  baseMovementMaker: Named;
  baseMovementCaliberId: number | null;
  baseMovementCaliber: Named;
  watchId: number;
  watch: {
    brandId: number;
    brand: Named;
    modelId: number | null;
    model: Named;
    referenceId: number | null;
    reference: Named;
    caseReferenceId: number | null;
    caseReference: Named;
    caliberId: number | null;
    caliber: Named;
    baseCaliberId: number | null;
    baseCaliber: Named;
    driveType: string | null;
  };
};

export function repairSnapshot(repair: RepairSnapshotSource) {
  const watch = repair.watch;
  return {
    inquiryNumber: repair.inquiryNumber,
    movementMakerId: repair.movementMakerId,
    movementMakerName: repair.movementMaker?.name ?? null,
    movementCaliberId: repair.movementCaliberId,
    movementCaliberName: repair.movementCaliber?.name ?? null,
    baseMovementMakerId: repair.baseMovementMakerId,
    baseMovementMakerName: repair.baseMovementMaker?.name ?? null,
    baseMovementCaliberId: repair.baseMovementCaliberId,
    baseMovementCaliberName: repair.baseMovementCaliber?.name ?? null,
    watchId: repair.watchId,
    brandId: watch.brandId,
    brandName: watch.brand?.name ?? null,
    modelId: watch.modelId,
    modelName: watch.model?.name ?? null,
    referenceId: watch.referenceId,
    referenceName: watch.reference?.name ?? null,
    caseReferenceId: watch.caseReferenceId,
    caseReferenceName: watch.caseReference?.name ?? null,
    watchCaliberId: watch.caliberId,
    watchCaliberName: watch.caliber?.name ?? null,
    watchBaseCaliberId: watch.baseCaliberId,
    watchBaseCaliberName: watch.baseCaliber?.name ?? null,
    driveType: watch.driveType,
  };
}
