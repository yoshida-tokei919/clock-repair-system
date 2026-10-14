/** The approval action must use the estimate and case data currently saved on the server. */
export function hasUnsavedApprovalDraft(baseline: string, current: string): boolean {
  return baseline !== current;
}
