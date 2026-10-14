export function canSelectRepairStatusStep(currentStatus: string, stepStatus: string): boolean {
    if (currentStatus === "送付待ち" && stepStatus !== "受付") return false;
    if (stepStatus === "送付待ち" && currentStatus !== "受付") return false;
    return true;
}

export function shouldSelectStatusStepOnDateChange(
    currentStatus: string,
    stepStatus: string,
    previousDate: string,
    nextDate: string,
): boolean {
    return !!nextDate && nextDate !== previousDate && canSelectRepairStatusStep(currentStatus, stepStatus);
}
