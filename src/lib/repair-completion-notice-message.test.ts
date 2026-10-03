import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRepairCompletionNoticeText,
  canPrepareRepairCompletionNotice,
  completionNoticeStatusLabels,
  COMPLETION_NOTICE_INTRO_LIMIT,
  defaultRepairCompletionNoticeText,
  parseRepairCompletionNoticeSubmission,
} from "./repair-completion-notice-message";

test("completion notice preview adds the required delivery answer URL and no-preference instruction", () => {
  const intro = defaultRepairCompletionNoticeText();
  assert.match(intro, /修理作業が完了/);
  assert.match(intro, /発送準備/);
  const text = buildRepairCompletionNoticeText(intro, "https://example.test/customer/delivery/token-12345678901234567890");
  assert.match(text, /配達日時のご希望/);
  assert.match(text, /希望なし/);
  assert.match(text, /https:\/\/example\.test\/customer\/delivery\//);
  assert.doesNotMatch(text, /発送しました|追跡|配達完了/);
});

test("submission parser requires the exact reviewed text field and bounded intro", () => {
  assert.deepEqual(parseRepairCompletionNoticeSubmission({ confirmed: true, introText: " 完了 ", reviewedText: "確認済み" }), {
    introText: "完了", reviewedText: "確認済み",
  });
  assert.throws(() => parseRepairCompletionNoticeSubmission({ confirmed: true, introText: "完了" }));
  assert.throws(() => parseRepairCompletionNoticeSubmission({ confirmed: true, introText: "x".repeat(COMPLETION_NOTICE_INTRO_LIMIT + 1), reviewedText: "x" }));
});

test("only eligible, verified, outbox-free state permits a bounded intro", () => {
  const ready = { eligible: true, hasVerifiedLineDestination: true, notice: null };
  assert.equal(canPrepareRepairCompletionNotice(ready, "完了"), true);
  assert.equal(canPrepareRepairCompletionNotice(ready, "x".repeat(COMPLETION_NOTICE_INTRO_LIMIT)), true);
  assert.equal(canPrepareRepairCompletionNotice(ready, " "), false);
  assert.equal(canPrepareRepairCompletionNotice(ready, "x".repeat(COMPLETION_NOTICE_INTRO_LIMIT + 1)), false);
  assert.equal(canPrepareRepairCompletionNotice(null, "完了"), false);
  assert.equal(canPrepareRepairCompletionNotice({ ...ready, eligible: false }, "完了"), false);
  assert.equal(canPrepareRepairCompletionNotice({ ...ready, hasVerifiedLineDestination: false }, "完了"), false);
  for (const status of Object.keys(completionNoticeStatusLabels) as (keyof typeof completionNoticeStatusLabels)[]) {
    assert.equal(canPrepareRepairCompletionNotice({ ...ready, notice: { status } }, "完了"), false);
  }
  assert.equal(completionNoticeStatusLabels.APPROVED, "送信待ち");
  assert.equal(completionNoticeStatusLabels.CONFIRMED, "送信済み");
});
