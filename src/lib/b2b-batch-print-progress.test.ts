import assert from "node:assert/strict";
import test from "node:test";
import { BatchPrintStopped, printBatchFrom, type BatchPrintItem } from "./b2b-batch-print-progress";

const items = [1, 2, 3].map(id => ({ repairId: id, label: { inquiryNumber: `B-${id}` } })) as BatchPrintItem[];

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
