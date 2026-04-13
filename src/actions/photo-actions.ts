'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

/**
 * SupabaseStorageにアップロード済みの写真パスをDBに保存する。
 * アップロード自体はブラウザ側（supabase-storage.ts）で行う。
 */
export async function saveRepairPhoto(
    repairId: number,
    storageKey: string,
    category: string = 'general'
): Promise<{ success: boolean; error?: string }> {
    try {
        await prisma.repairPhoto.create({
            data: {
                repairId,
                storageKey,
                category,
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
