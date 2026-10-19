import assert from "node:assert/strict";
import test from "node:test";
import { BatchPrintStopped, printBatchFrom, validatePreparedBatchLabels, type BatchPrintItem } from "./b2b-batch-print-progress";

const items = [1, 2, 3].map(id => ({ repairId: id, label: { inquiryNumber: `B-${id}` } })) as BatchPrintItem[];

function prepared(repairId: number, tagId: number): BatchPrintItem {
  const shortCode = `PT-${String(tagId).padStart(6, "0")}`;
  return { repairId, physicalTagId: tagId, shortCode, nfcUid: null, reused: false,
    label: { inquiryNumber: `B-${repairId}`, customerType: "business", shortCode, qrPayload: `private-${tagId}` } } as BatchPrintItem;
}

test("single-repair preparation validates identity before print and rejects a changed or shared tag", () => {
  const requested = [{ id: 1, inquiryNumber: "B-1" }];
  const first = prepared(1, 10);
  assert.deepEqual(validatePreparedBatchLabels([first], requested), [first]);
  assert.throws(() => validatePreparedBatchLabels([prepared(2, 10)], requested));
  assert.throws(() => validatePreparedBatchLabels([{ ...first, label: { ...first.label, inquiryNumber: "B-2" } }], requested));
  assert.throws(() => validatePreparedBatchLabels([prepared(1, 11)], requested, { 1: first }));
  assert.throws(() => validatePreparedBatchLabels([prepared(2, 10)], [{ id: 2, inquiryNumber: "B-2" }], { 1: first }));
});

test("batch preparation rejects duplicate QR payloads across different repairs", () => {
  const first = prepared(1, 10);
  const second = prepared(2, 11);
  assert.deepEqual(validatePreparedBatchLabels([first, second], [
    { id: 1, inquiryNumber: "B-1" }, { id: 2, inquiryNumber: "B-2" },
  ]), [first, second]);
  assert.throws(() => validatePreparedBatchLabels([first, { ...second, label: { ...second.label, qrPayload: first.label.qrPayload } }], [
    { id: 1, inquiryNumber: "B-1" }, { id: 2, inquiryNumber: "B-2" },
  ]));
  assert.throws(() => validatePreparedBatchLabels([first, { ...second, physicalTagId: first.physicalTagId }], [
    { id: 1, inquiryNumber: "B-1" }, { id: 2, inquiryNumber: "B-2" },
  ]));
});

test("sequential printing stops at uncertain label and resumes only unattempted tail", async () => {
  const attempted: number[] = [];
  const completed: number[] = [];
  await assert.rejects(() => printBatchFrom(items, 0, async label => {
    const id = Number(label.inquiryNumber.slice(2));
    attempted.push(id);
    if (id === 2) throw new Error("EndPrint failed");
  }, index => completed.push(index)), error => error instanceof BatchPrintStopped && error.failedIndex === 1);
  assert.deepEqual(attempted, [1, 2]);
  assert.deepEqual(completed, [0]);
  await printBatchFrom(items, 2, async label => { attempted.push(Number(label.inquiryNumber.slice(2))); }, index => completed.push(index));
  assert.deepEqual(attempted, [1, 2, 3]);
  assert.deepEqual(completed, [0, 2]);
});
