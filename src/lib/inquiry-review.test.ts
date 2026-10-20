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

test("review classification preserves old nulls and accepts explicit wristwatch or custom hall clock", () => {
  const base = { fieldValues: [], masterSelections: {} };
  assert.equal(parseInquiryWatchReviewPatch(base).timepieceClassification, undefined);
  assert.deepEqual(parseInquiryWatchReviewPatch({ ...base, timepieceType: null, timepieceTypeLabel: null }).timepieceClassification, { timepieceType: null, timepieceTypeLabel: null });
  assert.deepEqual(parseInquiryWatchReviewPatch({ ...base, timepieceType: "WRISTWATCH", timepieceTypeLabel: null }).timepieceClassification, { timepieceType: "WRISTWATCH", timepieceTypeLabel: null });
  assert.deepEqual(parseInquiryWatchReviewPatch({ ...base, timepieceType: "OTHER", timepieceTypeLabel: " ホールクロック " }).timepieceClassification, { timepieceType: "OTHER", timepieceTypeLabel: "ホールクロック" });
});

test("review classification rejects malformed enum and label combinations", () => {
  const base = { fieldValues: [], masterSelections: {} };
  for (const classification of [
    { timepieceType: "CLOCK", timepieceTypeLabel: null },
    { timepieceType: "OTHER", timepieceTypeLabel: "  " },
    { timepieceType: "OTHER", timepieceTypeLabel: "x".repeat(101) },
    { timepieceType: "WALL_CLOCK", timepieceTypeLabel: "掛時計" },
    { timepieceType: null, timepieceTypeLabel: "ホールクロック" },
    { timepieceType: "WRISTWATCH", timepieceTypeLabel: 4 },
  ]) {
    assert.throws(() => parseInquiryWatchReviewPatch({ ...base, ...classification }), InquiryWatchReviewInputError);
  }
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
