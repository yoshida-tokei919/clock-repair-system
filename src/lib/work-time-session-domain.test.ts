import assert from "node:assert/strict";
import test from "node:test";
import {
  closedAt, correctionData, isActive, parseCorrectionInput, parsePathId,
  parseReasonInput, parseStartInput, parseTimestamp, repairSnapshot,
  secondPrecision, workLabel, workSnapshot,
} from "./work-time-session-domain";

const time = (value: string) => new Date(value);

test("valid start supports repair, related IDs and general work", () => {
  assert.deepEqual(parseStartInput({ activityType: "REPAIR", repairId: 3, repairLineItemId: 7 }), {
    activityType: "REPAIR", repairId: 3, inquiryId: null, orderRequestId: null,
    repairLineItemId: 7, label: null,
  });
  assert.equal(parseStartInput({ activityType: "ADMIN", label: "  整理  " }).label, "整理");
});

test("start rejects invalid activity, IDs, line context and unknown fields", () => {
  for (const body of [
    {}, { activityType: "BAD" }, { activityType: "REPAIR" },
    { activityType: "ESTIMATE" }, { activityType: "ADMIN", repairId: 0 },
    { activityType: "ADMIN", inquiryId: 1.5 }, { activityType: "ADMIN", orderRequestId: "1" },
    { activityType: "ADMIN", repairLineItemId: 2 },
    { activityType: "ESTIMATE", repairId: 1, repairLineItemId: 2 },
    { activityType: "OTHER", label: "x".repeat(201) },
    { activityType: "OTHER", unexpected: true },
  ]) assert.throws(() => parseStartInput(body));
  for (const id of ["0", "-1", "1.0", "abc", "9007199254740992"]) {
    assert.throws(() => parsePathId(id));
  }
});

test("timestamps require ISO timezone and normalize to seconds", () => {
  assert.equal(parseTimestamp("2026-09-27T15:01:02.999+09:00", "startedAt").toISOString(), "2026-09-27T06:01:02.000Z");
  assert.equal(secondPrecision(time("2026-09-27T06:01:02.999Z")).getUTCMilliseconds(), 0);
  for (const value of ["2026-09-27T06:01:02", "2026-09-27", "2026-02-30T00:00:00Z", "bad", 1]) {
    assert.throws(() => parseTimestamp(value, "startedAt"));
  }
});

test("correction and invalidation require nonempty bounded reasons", () => {
  const input = { startedAt: "2026-09-27T01:00:00Z", endedAt: "2026-09-27T02:00:00Z", reason: " 修正 " };
  assert.equal(parseCorrectionInput(input).reason, "修正");
  for (const reason of [undefined, " ", "x".repeat(501)]) {
    assert.throws(() => parseCorrectionInput({ ...input, reason }));
    assert.throws(() => parseReasonInput({ reason }));
  }
  assert.throws(() => parseCorrectionInput({ ...input, endedAt: "2026-09-27T00:00:00Z" }));
  assert.throws(() => parseCorrectionInput({ ...input, invalidatedAt: null }));
  assert.throws(() => parseReasonInput({ reason: "ok", extra: 1 }));
});

test("active means both endedAt and invalidatedAt are null", () => {
  assert.equal(isActive({ endedAt: null, invalidatedAt: null }), true);
  assert.equal(isActive({ endedAt: time("2026-01-01T00:00:00Z"), invalidatedAt: null }), false);
  assert.equal(isActive({ endedAt: null, invalidatedAt: time("2026-01-01T00:00:00Z") }), false);
  assert.equal(closedAt(time("2026-01-01T00:00:01Z"), time("2026-01-01T00:00:00Z")).toISOString(), "2026-01-01T00:00:01.000Z");
});

test("completed correction preserves the first original timestamps", () => {
  const first = correctionData({
    startedAt: time("2026-01-01T01:00:00Z"), endedAt: time("2026-01-01T02:00:00Z"),
    originalStartedAt: null, originalEndedAt: null, invalidatedAt: null,
  }, parseCorrectionInput({
    startedAt: "2026-01-01T01:05:00Z", endedAt: "2026-01-01T02:05:00Z", reason: "first",
  }), time("2026-01-02T00:00:00.999Z"));
  assert.equal(first.originalStartedAt.toISOString(), "2026-01-01T01:00:00.000Z");
  assert.equal(first.originalEndedAt.toISOString(), "2026-01-01T02:00:00.000Z");
  assert.equal(first.adjustedAt.getUTCMilliseconds(), 0);
  const second = correctionData({ ...first, invalidatedAt: null }, parseCorrectionInput({
    startedAt: "2026-01-01T01:10:00Z", endedAt: "2026-01-01T02:10:00Z", reason: "second",
  }), time("2026-01-03T00:00:00Z"));
  assert.equal(second.originalStartedAt, first.originalStartedAt);
  assert.equal(second.originalEndedAt, first.originalEndedAt);
  assert.throws(() => correctionData({ ...first, endedAt: null, invalidatedAt: null }, parseCorrectionInput({
    startedAt: "2026-01-01T01:10:00Z", endedAt: "2026-01-01T02:10:00Z", reason: "x",
  }), new Date()));
  assert.throws(() => correctionData({ ...first, invalidatedAt: new Date() }, parseCorrectionInput({
    startedAt: "2026-01-01T01:10:00Z", endedAt: "2026-01-01T02:10:00Z", reason: "x",
  }), new Date()));
});

test("repair and watch snapshot retains current IDs and names", () => {
  const snapshot = repairSnapshot({
    inquiryNumber: "T-001", movementMakerId: 1, movementMaker: { name: "Maker" },
    movementCaliberId: 2, movementCaliber: { name: "Cal" },
    baseMovementMakerId: 3, baseMovementMaker: { name: "Base Maker" },
    baseMovementCaliberId: 4, baseMovementCaliber: { name: "Base Cal" },
    watchId: 5, watch: {
      brandId: 6, brand: { name: "Brand" }, modelId: 7, model: { name: "Model" },
      referenceId: 8, reference: { name: "Ref" }, caseReferenceId: 9, caseReference: { name: "Case Ref" },
      caliberId: 10, caliber: { name: "Watch Cal" }, baseCaliberId: 11, baseCaliber: { name: "Watch Base" },
      driveType: "MECHANICAL",
    },
  });
  assert.equal(snapshot.inquiryNumber, "T-001");
  assert.equal(snapshot.movementCaliberName, "Cal");
  assert.equal(snapshot.watchBaseCaliberId, 11);
  assert.equal(snapshot.caseReferenceName, "Case Ref");
  assert.equal(snapshot.driveType, "MECHANICAL");
});

test("LABOR snapshot retains existing display values without line item ID", () => {
  const line = {
    lineType: "LABOR" as const, itemNameSnapshot: "OH", estimateDisplayNameSnapshot: "オーバーホール",
    repairWorkCategoryId: 1, categoryNameSnapshot: "ムーブメント",
    repairWorkCategory: { repairType: "INTERNAL", displayName: "Changed" },
    targetPartNameId: "part-name", targetPartNameSnapshot: "ゼンマイ", targetPartName: { nameJa: "Changed" },
    repairWorkActionId: 2, actionNameSnapshot: "交換", repairWorkAction: { displayName: "Changed" },
    detailLabelSnapshot: "詳細",
  };
  const snapshot = workSnapshot(line);
  assert.equal(snapshot.repairType, "INTERNAL");
  assert.equal(snapshot.repairWorkCategoryName, "ムーブメント");
  assert.equal(snapshot.targetPartNameId, "part-name");
  assert.equal(snapshot.repairWorkActionName, "交換");
  assert.equal(workLabel(line), "オーバーホール");
  assert.equal("repairLineItemId" in snapshot, false);
  assert.equal("repairWorkNameId" in snapshot, false);
  assert.throws(() => workSnapshot({ ...line, lineType: "PART" }));
});
