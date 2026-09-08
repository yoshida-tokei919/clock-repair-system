import type { Prisma } from "@prisma/client";

/**
 * Enforce the non-restoring part of a repair-wide photo posting opt-out.
 *
 * Customer visibility is deliberately not included: it is independent from
 * PublicCase/SNS permission. Turning the opt-out off also deliberately does
 * not restore either flag.
 */
export async function enforceRepairPhotoPostingOptOut(
    tx: Prisma.TransactionClient,
    repairId: number,
    photoPostingOptOut: boolean,
) {
    if (!photoPostingOptOut) return;

    await tx.repairPhoto.updateMany({
        where: { repairId },
        data: { publicCaseVisible: false, snsVisible: false },
    });
}
