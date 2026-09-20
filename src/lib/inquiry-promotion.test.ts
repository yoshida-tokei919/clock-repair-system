import assert from "node:assert/strict";
import test from "node:test";
import { InquiryPromotionInputError, parseInquiryPromotionInput } from "./inquiry-promotion";

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
