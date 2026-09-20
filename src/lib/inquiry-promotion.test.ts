import assert from "node:assert/strict";
import test from "node:test";
import {
  InquiryPromotionInputError,
  inquiryWatchPromotionState,
  parseInquiryPromotionInput,
  promoteInquiryWatches,
} from "./inquiry-promotion";

test("accepts one or more distinct InquiryWatch IDs for one explicit Customer", () => {
  assert.deepEqual(
    parseInquiryPromotionInput({ customerId: 12, watchIds: [7, 8] }),
    { customerId: 12, watchIds: [7, 8] },
  );
});

test("rejects an empty or duplicated promotion selection before a transaction begins", () => {
  assert.throws(() => parseInquiryPromotionInput({ customerId: 12, watchIds: [] }), InquiryPromotionInputError);
  assert.throws(() => parseInquiryPromotionInput({ customerId: 12, watchIds: [7, 7] }), InquiryPromotionInputError);
});

test("classifies complete, empty, and partial promotion markers", () => {
  assert.equal(inquiryWatchPromotionState({ promotedWatchId: null, promotedRepairId: null, promotedAt: null }), "UNPROMOTED");
  assert.equal(inquiryWatchPromotionState({ promotedWatchId: 1, promotedRepairId: 2, promotedAt: new Date() }), "PROMOTED");
  assert.equal(inquiryWatchPromotionState({ promotedWatchId: 1, promotedRepairId: null, promotedAt: null }), "PARTIAL");
});

function promotionWatch(id: number, position: number, promoted: boolean) {
  return {
    id,
    position,
    inquiryId: 7,
    brandId: 1,
    modelId: null,
    referenceId: null,
    caseReferenceId: null,
    caliberId: null,
    baseCaliberId: null,
    promotedWatchId: promoted ? 100 + id : null,
    promotedRepairId: promoted ? 200 + id : null,
    promotedAt: promoted ? new Date("2026-09-20T00:00:00.000Z") : null,
    fieldValues: [{ field: "BRAND", value: "TEST", confirmationStatus: "CONFIRMED" }],
  };
}

function promotionTx(watches: any[], repairs: any[] = []) {
  const writes: string[] = [];
  const tx: any = {
    inquiry: { findUnique: async () => ({ id: 7, lineUserId: 3 }) },
    $executeRaw: async () => undefined,
    customer: {
      findUnique: async () => ({ id: 12, type: "individual", prefix: "C", currentSeq: 2 }),
      update: async () => { writes.push("customer-update"); },
    },
    inquiryWatch: {
      findMany: async () => watches,
      update: async () => { writes.push("inquiry-watch-update"); },
    },
    repair: {
      findMany: async () => repairs,
      create: async () => { writes.push("repair-create"); },
    },
    watch: { create: async () => { writes.push("watch-create"); } },
    repairStatusLog: { create: async () => { writes.push("status-log-create"); } },
  };
  return { tx, writes };
}

test("fully promoted retry returns existing results without writes", async () => {
  const watches = [promotionWatch(1, 1, true), promotionWatch(2, 2, true)];
  const { tx, writes } = promotionTx(watches, [
    { id: 201, watchId: 101, customerId: 12, inquiryNumber: "C-001", watch: { customerId: 12 } },
    { id: 202, watchId: 102, customerId: 12, inquiryNumber: "C-002", watch: { customerId: 12 } },
  ]);

  const result = await promoteInquiryWatches(tx, { inquiryId: 7, customerId: 12, watchIds: [1, 2] });
  assert.equal(result.deduplicated, true);
  assert.deepEqual(result.promotions, [
    { inquiryWatchId: 1, watchId: 101, repairId: 201, inquiryNumber: "C-001" },
    { inquiryWatchId: 2, watchId: 102, repairId: 202, inquiryNumber: "C-002" },
  ]);
  assert.deepEqual(writes, []);
});

test("fully promoted retry rejects an inconsistent formal Watch customer without writes", async () => {
  const watches = [promotionWatch(1, 1, true)];
  const { tx, writes } = promotionTx(watches, [
    { id: 201, watchId: 101, customerId: 12, inquiryNumber: "C-001", watch: { customerId: 99 } },
  ]);
  await assert.rejects(
    () => promoteInquiryWatches(tx, { inquiryId: 7, customerId: 12, watchIds: [1] }),
    /inconsistent promotion result/,
  );
  assert.deepEqual(writes, []);
});

test("mixed promoted and unpromoted selection fails without writes", async () => {
  const { tx, writes } = promotionTx([
    promotionWatch(1, 1, true),
    promotionWatch(2, 2, false),
  ]);
  await assert.rejects(
    () => promoteInquiryWatches(tx, { inquiryId: 7, customerId: 12, watchIds: [1, 2] }),
    /Promoted and unpromoted watches cannot be processed together/,
  );
  assert.deepEqual(writes, []);
});

test("partial promotion markers fail without writes", async () => {
  const partial = promotionWatch(1, 1, false);
  partial.promotedWatchId = 101;
  const { tx, writes } = promotionTx([partial]);
  await assert.rejects(
    () => promoteInquiryWatches(tx, { inquiryId: 7, customerId: 12, watchIds: [1] }),
    /incomplete promotion result/,
  );
  assert.deepEqual(writes, []);
});
