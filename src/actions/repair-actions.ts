'use server';

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateRepairStatus(repairId: number, newStatus: string, note?: string) {
    try {
        const statusMap: Record<string, string> = {
            'reception': '受付',
            'diagnosing': '見積中',
            'parts_wait': '部品待 (未注文)',
            'parts_wait_ordered': '部品待 (注文済)',
            'in_progress': '作業中',
            'completed': '完了',
            'delivered': '納品済',
            'canceled': 'キャンセル'
        };

        const statusLabel = statusMap[newStatus] || newStatus;

        await prisma.$transaction(async (tx) => {
            // 1. Fetch current to check approvalDate
            const current = await tx.repair.findUnique({ where: { id: repairId } });
            if (!current) throw new Error(`Repair ID ${repairId} not found`);

            const isApprovalStatus = ['in_progress', 'parts_wait', 'parts_wait_ordered', 'completed', 'delivered'].includes(newStatus);
            const shouldSetApprovalDate = isApprovalStatus && !current.approvalDate;

            console.log(`Updating Repair ${repairId} to status ${newStatus}. Should set approval date: ${shouldSetApprovalDate}`);

            // 2. Update Repair Status
            await tx.repair.update({
                where: { id: repairId },
                data: {
                    status: newStatus,
                    approvalDate: shouldSetApprovalDate ? new Date() : undefined
                }
            });

            // 3. Add Log
            // Check if admin 1 exists (fallback to null if not)
            const admin = await tx.admin.findUnique({ where: { id: 1 } });

            await tx.repairStatusLog.create({
                data: {
                    repairId: repairId,
                    status: statusLabel,
                    changedBy: admin ? 1 : null
                }
            });
        });

        revalidatePath(`/repairs/${repairId}`);
        revalidatePath('/repairs');
        revalidatePath('/repairs/board');

        return { success: true };
    } catch (error: any) {
        console.error("Status Update Error Detailed:", {
            message: error.message,
            stack: error.stack,
            repairId,
            newStatus
        });
        return { success: false, error: error.message || "Failed to update status" };
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
            parts_wait: 0,
            parts_wait_ordered: 0
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

export async function getPendingParts() {
    try {
        const items = await prisma.estimateItem.findMany({
            where: {
                type: 'part',
                orderStatus: { in: ['pending', 'ordered'] }
            },
            include: {
                estimate: {
                    select: {
                        repair: {
                            select: {
                                id: true,
                                inquiryNumber: true,
                                partnerRef: true,
                                status: true,
                                watch: {
                                    select: {
                                        brand:     { select: { name: true, nameEn: true } },
                                        model:     { select: { name: true, nameJp: true } },
                                        reference: { select: { name: true } },
                                        caliber:   { select: { name: true } }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });
        return items;
    } catch (error) {
        console.error("Failed to get pending parts:", error);
        return [];
    }
}
export async function updatePartOrderStatus(itemId: number, status: string) {
    try {
        const item = await prisma.estimateItem.update({
            where: { id: itemId },
            data: {
                orderStatus: status,
                orderedAt: status === 'ordered' ? new Date() : undefined
            },
            include: {
                estimate: {
                    include: {
                        repair: true,
                        items: true
                    }
                }
            }
        });

        const repairId = item.estimate.repairId;
        const allItems = item.estimate.items.filter(i => i.type === 'part');

        // 部品ステータスに基づく修理ステータスの自動連動
        // 全件入荷済み                       → 作業中
        // 全件注文済み以上（未注文なし）     → 部品待ち(注文済み)
        // 1件でも未注文                      → 部品待ち(未注文)
        const hasPending  = allItems.some(i => !i.orderStatus || i.orderStatus === 'pending');
        const allReceived = allItems.length > 0 && allItems.every(i => i.orderStatus === 'received');

        let targetStatus: string | null = null;
        if (allReceived) {
            targetStatus = 'in_progress';
        } else if (hasPending) {
            targetStatus = 'parts_wait';
        } else if (allItems.length > 0) {
            targetStatus = 'parts_wait_ordered';
        }

        // 連動対象：見積中・部品待ち系・作業中（完了/納品済/キャンセル/受付中は対象外）
        const currentStatus = item.estimate.repair.status;
        const isAutoSyncable = ['diagnosing', 'parts_wait', 'parts_wait_ordered', 'in_progress']
            .includes(currentStatus);
        if (targetStatus && isAutoSyncable) {
            await updateRepairStatus(repairId, targetStatus);
        }

        revalidatePath(`/repairs/${repairId}`);
        return { success: true };
    } catch (error) {
        console.error("Failed to update part order status:", error);
        return { success: false };
    }
}
