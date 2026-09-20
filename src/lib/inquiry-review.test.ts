import assert from "node:assert/strict";
import test from "node:test";
import {
  fieldValueWriteData,
  InquiryWatchReviewInputError,
  parseInquiryWatchReviewPatch,
} from "./inquiry-review";

test("accepts Base Cal as a reviewable field and existing master selection", () => {
  const patch = parseInquiryWatchReviewPatch({
    fieldValues: [{ field: "BASE_CALIBER", value: "ETA 2892.A2", confirmationStatus: "CONFIRMED" }],
    masterSelections: { baseCaliberId: 31 },
  });

  assert.deepEqual(patch.fieldValues, [{ field: "BASE_CALIBER", value: "ETA 2892.A2", confirmationStatus: "CONFIRMED" }]);
  assert.equal(patch.masterSelections.baseCaliberId, 31);
});

test("rejects unknown review fields", () => {
  assert.throws(
    () => parseInquiryWatchReviewPatch({ fieldValues: [{ field: "UNKNOWN", value: "x", confirmationStatus: "PENDING" }], masterSelections: {} }),
    InquiryWatchReviewInputError,
  );
});

test("preserves unchanged AI provenance and makes edited values manual", () => {
  const now = new Date("2026-09-20T00:00:00.000Z");
  assert.deepEqual(
    fieldValueWriteData({ value: "OMEGA 1120", source: "AI_CANDIDATE" }, { field: "CALIBER", value: "OMEGA 1120", confirmationStatus: "CONFIRMED" }, now),
    { value: "OMEGA 1120", confirmationStatus: "CONFIRMED", confirmedAt: now },
  );
  assert.deepEqual(
    fieldValueWriteData({ value: "OMEGA 1120", source: "AI_CANDIDATE" }, { field: "CALIBER", value: "ETA 2892.A2", confirmationStatus: "PENDING" }, now),
    { value: "ETA 2892.A2", confirmationStatus: "PENDING", confirmedAt: null, source: "MANUAL", sourceAiCandidateId: null },
  );
});
