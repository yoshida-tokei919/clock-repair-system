import assert from "node:assert/strict";
import test from "node:test";

import { shouldCloseInquiry } from "./inquiry-lifecycle";

const promotedAt = new Date("2026-09-22T00:00:00.000Z");

test("closes after the final declined review watch", () => {
  assert.equal(shouldCloseInquiry([
    { decision: "DECLINED", promotedAt: null },
    { decision: "DECLINED", promotedAt: null },
  ]), true);
});

test("closes when requested watches are promoted and remaining watches are declined", () => {
  assert.equal(shouldCloseInquiry([
    { decision: "REQUESTED", promotedAt },
    { decision: "DECLINED", promotedAt: null },
  ]), true);
});

test("stays open while any review watch is pending", () => {
  assert.equal(shouldCloseInquiry([
    { decision: "REQUESTED", promotedAt },
    { decision: "PENDING", promotedAt: null },
    { decision: "DECLINED", promotedAt: null },
  ]), false);
});

test("stays open when a requested watch has not been promoted", () => {
  assert.equal(shouldCloseInquiry([
    { decision: "REQUESTED", promotedAt: null },
  ]), false);
});

test("does not close an Inquiry with no review watches", () => {
  assert.equal(shouldCloseInquiry([]), false);
});
