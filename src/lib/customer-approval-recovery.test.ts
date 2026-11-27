import assert from "node:assert/strict";
import test from "node:test";
import { canRecoverApprovedStatus, matchesApprovedOptionSelection } from "./customer-approval-recovery";
import { createApprovalSubmitLatch } from "./customer-approval-submit-latch";

const attempt = { pdfFileId: 7, optionSourceHash: "issued-v2", planChoiceId: 3, addOnChoiceIds: [5, 9], approverName: "担当者" };
const committed = { approvalStatus: "approved", repairStatus: "承認待ち", optionApproval: {
  pdfFileId: 7, optionSourceHash: "issued-v2", planChoiceId: 3, addOnChoiceIds: [9, 5], approverName: "担当者",
} };

test("a lost response can confirm the committed selection without another POST", () => {
  assert.equal(matchesApprovedOptionSelection(committed, attempt), true);
  assert.equal(matchesApprovedOptionSelection(committed, { pdfFileId: 7, optionSourceHash: "issued-v2", planChoiceId: 3, addOnChoiceIds: [5, 9] }), true);
});

test("pending or unknown status cannot be shown as approved", () => {
  assert.equal(matchesApprovedOptionSelection({ ...committed, approvalStatus: "pending" }, attempt), false);
  assert.equal(matchesApprovedOptionSelection({ approvalStatus: "unknown" }, attempt), false);
});

test("a different choice, PDF, or issued estimate cannot confirm the attempted approval", () => {
  assert.equal(matchesApprovedOptionSelection(committed, { ...attempt, planChoiceId: 4 }), false);
  assert.equal(matchesApprovedOptionSelection(committed, { ...attempt, addOnChoiceIds: [5] }), false);
  assert.equal(matchesApprovedOptionSelection(committed, { ...attempt, pdfFileId: 8 }), false);
  assert.equal(matchesApprovedOptionSelection(committed, { ...attempt, optionSourceHash: "issued-v3" }), false);
  assert.equal(matchesApprovedOptionSelection(committed, { ...attempt, approverName: "別の担当者" }), false);
  const individualAttempt = { pdfFileId: 7, optionSourceHash: "issued-v2", planChoiceId: 3, addOnChoiceIds: [5, 9] };
  assert.equal(matchesApprovedOptionSelection(committed, { ...individualAttempt, optionSourceHash: "other" }), false);
  assert.equal(matchesApprovedOptionSelection(committed, { ...individualAttempt, addOnChoiceIds: [5] }), false);
});

test("terminal repair outcomes cannot be recovered as approval success", () => {
  for (const repairStatus of ["キャンセル", "キャンセル返却", "修理不可返却", "納品済み"]) {
    const snapshot = { ...committed, repairStatus };
    assert.equal(canRecoverApprovedStatus(snapshot), false);
    assert.equal(matchesApprovedOptionSelection(snapshot, attempt), false);
  }
  assert.equal(canRecoverApprovedStatus(committed), true);
});

test("two clicks in one render can begin only one request", () => {
  const latch = createApprovalSubmitLatch();
  let posts = 0;
  for (let click = 0; click < 2; click++) if (latch.tryStart()) posts++;
  assert.equal(posts, 1);
  latch.finish();
  assert.equal(latch.tryStart(), true);
});
