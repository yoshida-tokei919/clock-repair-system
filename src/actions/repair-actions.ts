'use server';

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateRepairStatus(repairId: number, newStatus: string, note?: string) {
    try {
        const statusMap: Record<string, string> = {
            'reception': '受付 (Reception)',
            'diagnosing': '見積中 (Estimating)',
            'parts_wait': '部品待 (Waiting Parts)',
            'in_progress': '作業中 (In Progress)',
            'completed': '完了 (Completed)',
            'delivered': '納品済 (Delivered)',
            'canceled': 'キャンセル (Canceled)'
        };

        const statusLabel = statusMap[newStatus] || newStatus;

        await prisma.$transaction(async (tx) => {
            // 1. Fetch current to check approvalDate
            const current = await tx.repair.findUnique({ where: { id: repairId } });
            if (!current) throw new Error("Repair not found");

            const isApprovalStatus = ['in_progress', 'parts_wait', 'completed', 'delivered'].includes(newStatus);
            const shouldSetApprovalDate = isApprovalStatus && !current.approvalDate;

            // 2. Update Repair Status
            await tx.repair.update({
                where: { id: repairId },
                data: {
                    status: newStatus,
                    approvalDate: shouldSetApprovalDate ? new Date() : undefined
                }
            });

            // 3. Add Log
            await tx.repairStatusLog.create({
                data: {
                    repairId: repairId,
                    status: statusLabel,
                    changedBy: 1
                }
            });
        });

        revalidatePath(`/repairs/${repairId}`);
        revalidatePath('/repairs');

        return { success: true };
    } catch (error) {
        console.error("Status Update Error:", error);
        return { success: false, error: "Failed to update status" };
    }
}

export async function updateRepairPublicStatus(repairId: number, isB2C: boolean, isB2B: boolean) {
    try {
        await prisma.repair.update({
            where: { id: repairId },
            data: {
                isPublicB2C: isB2C,
                isPublicB2B: isB2B
            }
        });
        revalidatePath(`/repairs/${repairId}`);
        return { success: true };
    } catch (error) {
        console.error("Failed to update public status:", error);
        return { success: false, error: "Failed to update public status" };
    }
}

export async function getRepairStats() {
    try {
        const counts = await prisma.repair.groupBy({
            by: ['status'],
            _count: {
                _all: true
            }
        });

        // Initialize with 0
        const stats: Record<string, number> = {
            reception: 0,
            diagnosing: 0,
            in_progress: 0,
            completed: 0,
            delivered: 0,
            parts_wait: 0
        };

        counts.forEach(c => {
            if (c.status in stats) {
                stats[c.status] = c._count._all;
            }
        });

        return stats;
    } catch (error) {
        console.error("Failed to get repair stats:", error);
        return null;
    }
}

export async function getRecentRepairs(limit: number = 5) {
    try {
        const repairs = await prisma.repair.findMany({
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                customer: true,
                watch: {
                    include: {
                        model: true,
                        brand: true
                    }
                }
            }
        });
        return repairs;
    } catch (error) {
        console.error("Failed to get recent repairs:", error);
        return [];
    }
}
