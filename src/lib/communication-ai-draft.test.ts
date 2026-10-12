import assert from "node:assert/strict";
import test from "node:test";
import { canApplyCommunicationAiDraft } from "./communication-ai-draft";

const opened = { id: 1, replyDraft: "old draft", stale: false };

test("page-open then new message blocks a now stale AI draft", () => {
  assert.equal(canApplyCommunicationAiDraft(opened, { ...opened, stale: true }, true), false);
  assert.equal(canApplyCommunicationAiDraft(opened, { id: 2, replyDraft: "new draft", stale: false }, true), false);
  assert.equal(canApplyCommunicationAiDraft(opened, opened, true), true);
});

test("destination ambiguity and missing drafts fail closed", () => {
  assert.equal(canApplyCommunicationAiDraft(opened, opened, false), false);
  assert.equal(canApplyCommunicationAiDraft(opened, null, true), false);
  assert.equal(canApplyCommunicationAiDraft(opened, { ...opened, replyDraft: null }, true), false);
});
