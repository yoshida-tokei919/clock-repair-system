export const APPROVAL_EVENT_PREFIX = "EVENT:APPROVAL_";

export function approvalAuditStatus(kind: "RECORDED" | "DATE_CORRECTED", approvalDate: Date): string {
  return `${APPROVAL_EVENT_PREFIX}${kind}:${approvalDate.toISOString()}`;
}

export function isApprovalAuditStatus(status: string): boolean {
  return status.startsWith(APPROVAL_EVENT_PREFIX);
}
