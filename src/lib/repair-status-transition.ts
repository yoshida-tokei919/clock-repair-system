export const SHIPPING_WAITING_STATUS = "送付待ち";
export const RECEPTION_STATUS = "受付";

export function getRepairStatusTransition(
    currentStatus: string,
    newStatus: string,
): { receptionDate?: Date | null } {
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
