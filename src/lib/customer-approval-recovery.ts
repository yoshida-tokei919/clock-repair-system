export type ApprovalStatusSnapshot = {
  approvalStatus: string;
  repairStatus?: string;
  optionApproval?: {
    pdfFileId: number;
    optionSourceHash: string;
    planChoiceId: number | null;
    addOnChoiceIds: unknown;
    approverName: string;
  } | null;
};

export function matchesApprovedOptionSelection(
  snapshot: ApprovalStatusSnapshot,
  attempt: { pdfFileId: number; optionSourceHash: string; planChoiceId: number | null; addOnChoiceIds: number[]; approverName: string },
): boolean {
  const saved = snapshot.optionApproval;
  return canRecoverApprovedStatus(snapshot) && !!saved &&
    saved.pdfFileId === attempt.pdfFileId && saved.optionSourceHash === attempt.optionSourceHash &&
    saved.approverName === attempt.approverName &&
    saved.planChoiceId === attempt.planChoiceId && Array.isArray(saved.addOnChoiceIds) &&
    saved.addOnChoiceIds.every((id: unknown) => Number.isSafeInteger(id)) &&
    JSON.stringify([...saved.addOnChoiceIds].sort((a: number, b: number) => a - b)) ===
      JSON.stringify([...attempt.addOnChoiceIds].sort((a, b) => a - b));
}

export function isTerminalApprovalRepairStatus(status: string): boolean {
  return ["キャンセル", "キャンセル返却", "修理不可返却", "納品済み"].includes(status);
}

export function canRecoverApprovedStatus(snapshot: Pick<ApprovalStatusSnapshot, "approvalStatus" | "repairStatus">): boolean {
  return snapshot.approvalStatus === "approved" && typeof snapshot.repairStatus === "string" &&
    !isTerminalApprovalRepairStatus(snapshot.repairStatus);
}
