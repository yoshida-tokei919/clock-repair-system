import { supabase } from './supabase-client';

const BUCKET = 'repair-photos';

/**
 * Webカメラキャプチャ画像（WebP Blob）をSupabase Storageにアップロードする。
 * パス構造: repairs/{repairId}/{YYYYMM}/{uuid}.webp
 *   - repairIdでグループ化 → 案件ごとの一括削除が容易
 *   - 年月フォルダで分散 → 数万枚でもディレクトリ肥大化を防止
 */
export async function uploadRepairPhoto(
    blob: Blob,
    repairId: number
): Promise<{ path: string; publicUrl: string }> {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const uuid = crypto.randomUUID();
    const path = `repairs/${repairId}/${ym}/${uuid}.webp`;

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, {
            contentType: 'image/webp',
            cacheControl: '31536000', // 1年間ブラウザキャッシュ
            upsert: false
        });

    if (error) throw new Error(`Supabase Storageアップロード失敗: ${error.message}`);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
}

/**
 * storageKeyから表示用URLを生成する。
 * - Base64（旧形式）: そのまま返す
 * - http(s) URL（旧形式）: そのまま返す
 * - Supabaseパス（新形式）: 公開URLを生成して返す
 */
export function getPhotoDisplayUrl(storageKey: string): string {
    if (storageKey.startsWith('data:') || storageKey.startsWith('http')) {
        return storageKey;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storageKey);
    return data.publicUrl;
}
