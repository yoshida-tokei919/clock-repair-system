export type CompletionNoticeStatus =
  | "APPROVED" | "CLAIMED" | "PRE_SEND_FAILED"
  | "POST_UNCONFIRMED" | "CONFIRMED" | "CANCELLED";

export type CompletionNoticeState = {
  eligible: boolean;
  hasVerifiedLineDestination: boolean;
  notice: { status: CompletionNoticeStatus } | null;
};

export const COMPLETION_NOTICE_TEXT_LIMIT = 5000;

export function defaultRepairCompletionNoticeText() {
  return "修理作業が完了しました。これから発送準備を進めます。ご希望の配達日・時間帯がございましたらお知らせください。";
}

export function canPrepareRepairCompletionNotice(state: CompletionNoticeState | null, text: string) {
  return Boolean(state?.eligible && state.hasVerifiedLineDestination && !state.notice &&
    text.trim() && text.length <= COMPLETION_NOTICE_TEXT_LIMIT);
}

export const completionNoticeStatusLabels: Record<CompletionNoticeStatus, string> = {
  APPROVED: "送信待ち",
  CLAIMED: "送信処理中",
  PRE_SEND_FAILED: "送信前エラー",
  POST_UNCONFIRMED: "送信結果の確認待ち",
  CONFIRMED: "送信済み",
  CANCELLED: "取消済み",
};
