export const INTAKE_LOAD_ERROR = "受付ページを読み込めませんでした。時間をおいて、もう一度お試しください。";
export const INTAKE_SUBMIT_ERROR = "送付受付を送信できませんでした。時間をおいて、もう一度お試しください。";

const messages: Record<string, string> = {
  INVALID_TOKEN: "この送付受付リンクは利用できません。LINEからご確認ください。",
  EXPIRED_TOKEN: "この送付受付リンクの有効期限が切れています。LINEから新しいリンクをご依頼ください。",
  USED_TOKEN: "この送付受付リンクは使用済みです。受付は完了しているため、新たに送信しないでください。",
  REVOKED_TOKEN: "この送付受付リンクは内容変更のため無効になりました。新しいリンクをご利用ください。",
  INVALID_INPUT: "入力内容を確認して、もう一度お試しください。",
  INVALID_BRAND: "時計のブランドを選び直して、もう一度お試しください。",
  INQUIRY_NOT_READY: "この受付は現在送信できません。LINEからお問い合わせください。",
  CUSTOMER_NOT_FOUND: "お客様情報を確認できませんでした。LINEからお問い合わせください。",
  B2B_CUSTOMER: "この受付フォームは個人のお客様向けです。LINEからお問い合わせください。",
  LINE_USER_NOT_FOUND: "LINEの連携情報を確認できませんでした。LINEからお問い合わせください。",
  LINE_USER_ALREADY_LINKED: "LINEの連携情報を確認できませんでした。LINEからお問い合わせください。",
};

export function repairIntakeCustomerMessage(code: string | undefined, fallback: string): string {
  return code && Object.prototype.hasOwnProperty.call(messages, code) ? messages[code] : fallback;
}
