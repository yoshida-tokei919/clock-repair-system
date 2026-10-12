type Draft = { id: number; replyDraft: string | null; stale: boolean } | null;

// The displayed brief is only a candidate. The authenticated GET response is authoritative at click time.
export function canApplyCommunicationAiDraft(displayed: Draft, fresh: Draft, replyDraftAllowed: boolean) {
  return Boolean(replyDraftAllowed && displayed && fresh && !displayed.stale && !fresh.stale &&
    displayed.id === fresh.id && displayed.replyDraft && displayed.replyDraft === fresh.replyDraft);
}
