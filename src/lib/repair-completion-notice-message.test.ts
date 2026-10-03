import assert from "node:assert/strict";
import test from "node:test";
import {
  canPrepareRepairCompletionNotice, completionNoticeStatusLabels,
  defaultRepairCompletionNoticeText,
} from "./repair-completion-notice-message";

test("default text says work is complete, shipping preparation follows, and asks for a delivery preference", () => {
  const text = defaultRepairCompletionNoticeText();
  assert.match(text, /修理作業が完了/);
  assert.match(text, /発送準備/);
  assert.match(text, /希望.*配達日・時間帯/);
  assert.doesNotMatch(text, /発送しました|追跡|配達完了/);
  assert.ok(text.length <= 5000);
});

test("only eligible, verified, outbox-free state permits a bounded draft", () => {
  const ready = { eligible: true, hasVerifiedLineDestination: true, notice: null };
  assert.equal(canPrepareRepairCompletionNotice(ready, "完了"), true);
  assert.equal(canPrepareRepairCompletionNotice(ready, "x".repeat(5000)), true);
  assert.equal(canPrepareRepairCompletionNotice(ready, " "), false);
  assert.equal(canPrepareRepairCompletionNotice(ready, "x".repeat(5001)), false);
  assert.equal(canPrepareRepairCompletionNotice(null, "完了"), false);
  assert.equal(canPrepareRepairCompletionNotice({ ...ready, eligible: false }, "完了"), false);
  assert.equal(canPrepareRepairCompletionNotice({ ...ready, hasVerifiedLineDestination: false }, "完了"), false);
  for (const status of Object.keys(completionNoticeStatusLabels) as (keyof typeof completionNoticeStatusLabels)[]) {
    assert.equal(canPrepareRepairCompletionNotice({ ...ready, notice: { status } }, "完了"), false);
  }
  assert.equal(completionNoticeStatusLabels.APPROVED, "送信待ち");
  assert.equal(completionNoticeStatusLabels.CONFIRMED, "送信済み");
});
