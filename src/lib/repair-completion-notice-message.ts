export type CompletionNoticeStatus =
  | "APPROVED" | "CLAIMED" | "PRE_SEND_FAILED"
  | "POST_UNCONFIRMED" | "CONFIRMED" | "CANCELLED";

export type CompletionNoticeState = {
  eligible: boolean;
  hasVerifiedLineDestination: boolean;
  notice: { status: CompletionNoticeStatus } | null;
};

export const COMPLETION_NOTICE_TEXT_LIMIT = 5000;
export const COMPLETION_NOTICE_INTRO_LIMIT = 4000;

export function defaultRepairCompletionNoticeText() {
  return "修理作業が完了しました。これから発送準備を進めます。";
}

export function parseRepairCompletionNoticeIntro(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("入力が不正です。");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => key !== "confirmed" && key !== "introText") ||
      body.confirmed !== true || typeof body.introText !== "string") {
    throw new Error("入力が不正です。");
  }
  const introText = body.introText.trim();
  if (!introText || introText.length > COMPLETION_NOTICE_INTRO_LIMIT) throw new Error("作業完了連絡の本文が不正です。");
  return introText;
}

export function parseRepairCompletionNoticeSubmission(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("入力が不正です。");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["confirmed", "introText", "reviewedText"].includes(key)) ||
      body.confirmed !== true || typeof body.introText !== "string" || typeof body.reviewedText !== "string") {
    throw new Error("入力が不正です。");
  }
  const introText = body.introText.trim();
  if (!introText || introText.length > COMPLETION_NOTICE_INTRO_LIMIT ||
      !body.reviewedText || body.reviewedText.length > COMPLETION_NOTICE_TEXT_LIMIT) {
    throw new Error("作業完了連絡の本文が不正です。");
  }
  return { introText, reviewedText: body.reviewedText };
}

export function buildRepairCompletionNoticeText(introText: string, deliveryUrl: string) {
  const intro = introText.trim();
  if (!intro || intro.length > COMPLETION_NOTICE_INTRO_LIMIT) throw new Error("作業完了連絡の本文が不正です。");
  let url: URL;
  try { url = new URL(deliveryUrl); }
  catch { throw new Error("配達希望回答URLが不正です。"); }
  if (!/^https?:$/.test(url.protocol) || !url.pathname.startsWith("/customer/delivery/")) {
    throw new Error("配達希望回答URLが不正です。");
  }
  return [
    intro,
    "配達日時のご希望について、下記ページからご回答をお願いします。",
    "ご希望がない場合も、ページ内で「希望なし」を選択してください。",
    `配達希望を回答する\n${deliveryUrl}`,
  ].join("\n\n");
}

export function canPrepareRepairCompletionNotice(state: CompletionNoticeState | null, text: string) {
  return Boolean(state?.eligible && state.hasVerifiedLineDestination && !state.notice &&
    text.trim() && text.length <= COMPLETION_NOTICE_INTRO_LIMIT);
}

export const completionNoticeStatusLabels: Record<CompletionNoticeStatus, string> = {
  APPROVED: "送信待ち",
  CLAIMED: "送信処理中",
  PRE_SEND_FAILED: "送信前エラー",
  POST_UNCONFIRMED: "送信結果の確認待ち",
  CONFIRMED: "送信済み",
  CANCELLED: "取消済み",
};
