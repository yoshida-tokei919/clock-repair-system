'use server';

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateRepairStatus(repairId: number, newStatus: string, note?: string) {
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Fetch current to check approvalDate
            const current = await tx.repair.findUnique({ where: { id: repairId } });
            if (!current) throw new Error(`Repair ID ${repairId} not found`);

            const isApprovalStatus = ['作業中', '部品待ち(未注文)', '部品待ち(注文済み)', '作業完了', '納品済み'].includes(newStatus);
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
            const admin = await tx.admin.findUnique({ where: { id: 1 } });

            await tx.repairStatusLog.create({
                data: {
                    repairId: repairId,
                    status: newStatus,
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
            '受付': 0,
            '見積中': 0,
            '承認待ち': 0,
            '部品待ち(未注文)': 0,
            '部品待ち(注文済み)': 0,
            '部品入荷済み': 0,
            '作業待ち': 0,
            '作業中': 0,
            '作業完了': 0,
            '納品済み': 0,
            'キャンセル': 0,
            '保留': 0,
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
                    include: { repair: true }
                }
            }
        });

        const repairId = item.estimate.repairId;

        // 更新後の最新状態を再取得（includeのitemsは更新対象自身が古い値を返す場合があるため）
        const freshItems = await prisma.estimateItem.findMany({
            where: { estimateId: item.estimateId, type: 'part' }
        });

        // 部品ステータスに基づく修理ステータスの自動連動
        // 全件入荷済み                       → 作業中
        // 全件注文済み以上（未注文なし）     → 部品待ち(注文済み)
        // 1件でも未注文                      → 部品待ち(未注文)
        const hasPending  = freshItems.some(i => !i.orderStatus || i.orderStatus === 'pending');
        const allReceived = freshItems.length > 0 && freshItems.every(i => i.orderStatus === 'received');

        let targetStatus: string | null = null;
        if (allReceived) {
            targetStatus = '部品入荷済み';
        } else if (hasPending) {
            targetStatus = '部品待ち(未注文)';
        } else if (freshItems.length > 0) {
            targetStatus = '部品待ち(注文済み)';
        }

        // 連動対象：見積中・部品待ち系・作業中（完了/納品済/キャンセル/受付中は対象外）
        const currentStatus = item.estimate.repair.status;
        const isAutoSyncable = ['見積中', '部品待ち(未注文)', '部品待ち(注文済み)', '作業中']
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
