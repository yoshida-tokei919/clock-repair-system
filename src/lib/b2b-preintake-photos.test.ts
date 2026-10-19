import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mapBatchRepairs, uploadOutcome } from "./b2b-preintake-photos";

test("maps returned repairs to the frozen submitted row order", () => {
  assert.deepEqual(mapBatchRepairs([7, 3], [
    { id: 41, inquiryNumber: "A-001" }, { id: 42, inquiryNumber: "A-002" },
  ]), [
    { rowKey: 7, id: 41, inquiryNumber: "A-001" },
    { rowKey: 3, id: 42, inquiryNumber: "A-002" },
  ]);
  assert.equal(mapBatchRepairs([7, 3], [{ id: 41, inquiryNumber: "A-001" }]), null);
  assert.equal(mapBatchRepairs([7, 3], [{ id: 41, inquiryNumber: "A-001" }, { id: 41, inquiryNumber: "A-002" }]), null);
  assert.equal(mapBatchRepairs([7, 3], [{ id: 41, inquiryNumber: "A-001" }, { id: 42, inquiryNumber: "A-001" }]), null);
  assert.equal(mapBatchRepairs([7, 3], [{ id: 41, inquiryNumber: "A-001" }, { id: 0, inquiryNumber: "A-002" }]), null);
});

test("only a confirmed matching upload succeeds; ambiguous outcomes stay unknown", () => {
  assert.equal(uploadOutcome(200, { success: true, photo: { repairId: 41 } }, 41), "success");
  assert.equal(uploadOutcome(200, { success: true, photo: { repairId: 42 } }, 41), "unknown");
  assert.equal(uploadOutcome(500, { success: false }, 41), "unknown");
  assert.equal(uploadOutcome(400, { success: false }, 41), "failed");
});
