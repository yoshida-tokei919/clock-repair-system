export const INQUIRY_WATCH_FIELDS = [
  "BRAND",
  "MODEL",
  "PRODUCT_REF",
  "CASE_REF",
  "CALIBER",
  "BASE_CALIBER",
  "MOVEMENT_TYPE",
  "ERA",
] as const;

export type InquiryWatchFieldName = (typeof INQUIRY_WATCH_FIELDS)[number];
export type InquiryWatchConfirmationStatus = "PENDING" | "CONFIRMED";

export const INQUIRY_WATCH_MASTER_SELECTION_KEYS = [
  "brandId",
  "modelId",
  "referenceId",
  "caseReferenceId",
  "caliberId",
  "baseCaliberId",
] as const;

export type InquiryWatchMasterSelectionKey = (typeof INQUIRY_WATCH_MASTER_SELECTION_KEYS)[number];

export type InquiryWatchFieldChange = {
  field: InquiryWatchFieldName;
  value: string;
  confirmationStatus: InquiryWatchConfirmationStatus;
};

export type InquiryWatchReviewPatch = {
  fieldValues: InquiryWatchFieldChange[];
  masterSelections: Partial<Record<InquiryWatchMasterSelectionKey, number | null>>;
};

export class InquiryWatchReviewInputError extends Error {}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InquiryWatchReviewInputError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nullableId(value: unknown, name: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new InquiryWatchReviewInputError(`${name} must be a positive integer or null`);
  }
  return value as number;
}

function isField(value: unknown): value is InquiryWatchFieldName {
  return typeof value === "string" && (INQUIRY_WATCH_FIELDS as readonly string[]).includes(value);
}

export function parseInquiryWatchReviewPatch(input: unknown): InquiryWatchReviewPatch {
  const body = object(input, "body");
  if (!Array.isArray(body.fieldValues)) {
    throw new InquiryWatchReviewInputError("fieldValues must be an array");
  }
  if (body.fieldValues.length > INQUIRY_WATCH_FIELDS.length) {
    throw new InquiryWatchReviewInputError("fieldValues contains too many items");
  }

  const seenFields = new Set<string>();
  const fieldValues = body.fieldValues.map((value, index) => {
    const item = object(value, `fieldValues[${index}]`);
    if (!isField(item.field)) {
      throw new InquiryWatchReviewInputError(`fieldValues[${index}].field is invalid`);
    }
    if (seenFields.has(item.field)) {
      throw new InquiryWatchReviewInputError(`fieldValues[${index}].field is duplicated`);
    }
    seenFields.add(item.field);
    if (typeof item.value !== "string" || !item.value.trim() || item.value.trim().length > 500) {
      throw new InquiryWatchReviewInputError(`fieldValues[${index}].value is invalid`);
    }
    if (item.confirmationStatus !== "PENDING" && item.confirmationStatus !== "CONFIRMED") {
      throw new InquiryWatchReviewInputError(`fieldValues[${index}].confirmationStatus is invalid`);
    }
    return {
      field: item.field,
      value: item.value.trim(),
      confirmationStatus: item.confirmationStatus as InquiryWatchConfirmationStatus,
    };
  });

  const selectionsInput = object(body.masterSelections ?? {}, "masterSelections");
  const masterSelections: InquiryWatchReviewPatch["masterSelections"] = {};
  for (const key of INQUIRY_WATCH_MASTER_SELECTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(selectionsInput, key)) {
      masterSelections[key] = nullableId(selectionsInput[key], `masterSelections.${key}`);
    }
  }

  return { fieldValues, masterSelections };
}

type ExistingFieldValue = {
  value: string;
  source: "AI_CANDIDATE" | "MANUAL";
};

// An unchanged AI value keeps its candidate provenance. Any human edit becomes
// MANUAL, so later AI reanalysis cannot overwrite it.
export function fieldValueWriteData(
  existing: ExistingFieldValue | undefined,
  change: InquiryWatchFieldChange,
  now: Date,
) {
  const keepsAiCandidate = existing?.source === "AI_CANDIDATE" && existing.value === change.value;
  return {
    value: change.value,
    confirmationStatus: change.confirmationStatus,
    confirmedAt: change.confirmationStatus === "CONFIRMED" ? now : null,
    ...(keepsAiCandidate ? {} : { source: "MANUAL" as const, sourceAiCandidateId: null }),
  };
}
