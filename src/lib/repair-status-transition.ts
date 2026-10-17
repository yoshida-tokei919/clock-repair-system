export const SHIPPING_WAITING_STATUS = "送付待ち";
export const RECEPTION_STATUS = "受付";
export const ESTIMATING_STATUS = "見積中";

export function getStatusDateUpdates(
    draftStatusLog: Record<string, string>,
    savedStatusLog: Record<string, string>,
    requestedStatus: string,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(draftStatusLog).filter(([status, date]) =>
            date && (status === requestedStatus || Object.hasOwn(savedStatusLog, status))
            && date !== savedStatusLog[status]
        ),
    );
}

export function getRepairStatusForSave(
    persistedStatus: string,
    selectedStatus: string,
    hasEstimateItems: boolean,
): string {
    if (persistedStatus === SHIPPING_WAITING_STATUS && selectedStatus === RECEPTION_STATUS) {
        return RECEPTION_STATUS;
    }

    return selectedStatus === RECEPTION_STATUS && hasEstimateItems
        ? ESTIMATING_STATUS
        : selectedStatus;
}

export function getRepairStatusTransition(
    currentStatus: string,
    newStatus: string,
): { receptionDate?: Date | null } {
    if (["修理不可返却", "キャンセル返却"].includes(currentStatus) && ![currentStatus, "納品済み"].includes(newStatus)) {
        throw new Error("返却処理済みの案件は作業状態へ戻せません。");
    }
    if (currentStatus === SHIPPING_WAITING_STATUS && newStatus !== RECEPTION_STATUS) {
        throw new Error("送付待ちから進められるのは受付のみです。");
    }

    if (newStatus === SHIPPING_WAITING_STATUS && currentStatus !== RECEPTION_STATUS) {
        throw new Error("送付待ちへ戻せるのは受付の案件のみです。");
    }

    if (currentStatus === SHIPPING_WAITING_STATUS && newStatus === RECEPTION_STATUS) {
        return { receptionDate: new Date() };
    }
    if (newStatus === SHIPPING_WAITING_STATUS) return { receptionDate: null };
    return {};
}
