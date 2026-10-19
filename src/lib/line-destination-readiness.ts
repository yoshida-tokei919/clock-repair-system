export type LineDestinationReadiness = "unlinked" | "multiple_users" | "unverified_chat" | "no_inquiry" | "ready";

export function lineDestinationReadiness(input: {
  customerId: number;
  linkedUserCount: number;
  lineUserId: number;
  linkedCustomerId: number | null;
  chatLineUserId: number | null;
  chatVerifiedAt: Date | null;
  hasInquiry: boolean;
}): LineDestinationReadiness {
  if (input.linkedUserCount !== 1 || input.linkedCustomerId !== input.customerId) {
    return input.linkedUserCount > 1 ? "multiple_users" : "unlinked";
  }
  if (!input.chatVerifiedAt || input.chatLineUserId !== input.lineUserId) return "unverified_chat";
  if (!input.hasInquiry) return "no_inquiry";
  return "ready";
}
