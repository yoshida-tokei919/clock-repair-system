'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { photoSharingFallbacks, repairPhotoCategory, repairPhotoStage } from '@/lib/repair-photo-sharing';

/**
 * SupabaseStorageにアップロード済みの写真パスをDBに保存する。
 * アップロード自体はブラウザ側（supabase-storage.ts）で行う。
 */
export async function saveRepairPhoto(
    repairId: number,
    storageKey: string,
    category: string = 'OTHER',
    stage?: string | null,
): Promise<{ success: boolean; error?: string }> {
    try {
        const normalizedCategory = repairPhotoCategory(category);
        const [preset, repair] = await Promise.all([
            prisma.photoSharingDefault.findUnique({ where: { category: normalizedCategory } }),
            prisma.repair.findUnique({ where: { id: repairId }, select: { photoPostingOptOut: true } }),
        ]);
        if (!repair) return { success: false, error: 'Repair not found' };
        const sharing = preset ?? photoSharingFallbacks[normalizedCategory];
        await prisma.repairPhoto.create({
            data: {
                repairId,
                storageKey,
                stage: repairPhotoStage(stage),
                category: normalizedCategory,
                customerVisible: sharing.customerVisible,
                publicCaseVisible: repair.photoPostingOptOut ? false : sharing.publicCaseVisible,
                snsVisible: repair.photoPostingOptOut ? false : sharing.snsVisible,
                mimeType: 'image/webp',
                fileName: storageKey.split('/').pop() ?? null
            }
        });

        revalidatePath(`/repairs/${repairId}`);
        return { success: true };
    } catch (error: any) {
        console.error('saveRepairPhoto エラー:', error);
        return { success: false, error: error.message };
    }
}
