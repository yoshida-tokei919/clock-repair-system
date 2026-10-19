import assert from "node:assert/strict";
import test from "node:test";
import { lineDestinationReadiness } from "./line-destination-readiness";

const ready = {
  customerId: 7, linkedUserCount: 1, lineUserId: 5, linkedCustomerId: 7,
  chatLineUserId: 5, chatVerifiedAt: new Date("2026-10-01T00:00:00Z"), hasInquiry: true,
};

test("business LINE readiness requires one linked user, verified chat, and same-user Inquiry", () => {
  assert.equal(lineDestinationReadiness(ready), "ready");
  assert.equal(lineDestinationReadiness({ ...ready, linkedUserCount: 0, linkedCustomerId: null }), "unlinked");
  assert.equal(lineDestinationReadiness({ ...ready, linkedUserCount: 2 }), "multiple_users");
  assert.equal(lineDestinationReadiness({ ...ready, linkedUserCount: 2, chatVerifiedAt: null, hasInquiry: false }), "multiple_users");
  assert.equal(lineDestinationReadiness({ ...ready, linkedCustomerId: 8 }), "unlinked");
  assert.equal(lineDestinationReadiness({ ...ready, chatVerifiedAt: null }), "unverified_chat");
  assert.equal(lineDestinationReadiness({ ...ready, chatLineUserId: null }), "unverified_chat");
  assert.equal(lineDestinationReadiness({ ...ready, chatLineUserId: 6 }), "unverified_chat");
  assert.equal(lineDestinationReadiness({ ...ready, hasInquiry: false }), "no_inquiry");
});
