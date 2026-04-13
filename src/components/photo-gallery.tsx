"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Camera, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { CameraCaptureDialog } from "@/components/repairs/CameraCaptureDialog";
import { getPhotoDisplayUrl } from "@/lib/supabase-storage";

interface PhotoGalleryProps {
    photos: string[];     // storageKey の配列（Base64旧形式・Supabaseパス新形式の両方に対応）
    repairId: string;
}

export function PhotoGallery({ photos, repairId }: PhotoGalleryProps) {
    const [isCameraOpen, setIsCameraOpen]     = useState(false);
    const [lightboxSrc,  setLightboxSrc]      = useState<string | null>(null);
    const router = useRouter();

    const handleSaved = () => {
        router.refresh();
    };

    return (
        <div className="space-y-4">
            {/* カメラ撮影ダイアログ */}
            <CameraCaptureDialog
                isOpen={isCameraOpen}
                onClose={() => setIsCameraOpen(false)}
                repairId={parseInt(repairId)}
                category="general"
                onSaved={handleSaved}
            />

            {/* ライトボックス */}
            <Dialog open={!!lightboxSrc} onOpenChange={(open) => !open && setLightboxSrc(null)}>
                <DialogContent className="max-w-3xl w-full p-0 overflow-hidden bg-black/90 border-none">
                    {lightboxSrc && (
                        <div className="relative w-full h-[70vh] flex items-center justify-center">
                            <img
                                src={lightboxSrc}
                                alt="拡大表示"
                                className="max-h-full max-w-full object-contain"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* グリッド */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* 追加ボタン */}
                <Card
                    className="aspect-square flex flex-col items-center justify-center border-dashed border-2 border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer text-slate-500 transition-colors"
                    onClick={() => setIsCameraOpen(true)}
                >
                    <Camera className="w-7 h-7 mb-1.5" />
                    <span className="text-xs font-bold">写真を追加</span>
                </Card>

                {/* 写真一覧 */}
                {photos.map((storageKey, i) => {
                    const displayUrl = getPhotoDisplayUrl(storageKey);
                    return (
                        <div
                            key={i}
                            className="relative aspect-square cursor-pointer overflow-hidden rounded-md border border-slate-200 hover:opacity-90 transition-opacity group"
                            onClick={() => setLightboxSrc(displayUrl)}
                        >
                            <img
                                src={displayUrl}
                                alt={`修理写真 ${i + 1}`}
                                className="object-cover w-full h-full transition-transform group-hover:scale-105"
                            />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-[10px] text-white/70 px-1 py-0.5 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {i + 1} / {photos.length}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
