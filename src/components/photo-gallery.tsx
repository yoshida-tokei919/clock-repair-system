
"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Plus, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";

interface PhotoGalleryProps {
    photos: string[];
    repairId: string; // Needed for upload
}

export function PhotoGallery({ photos, repairId }: PhotoGalleryProps) {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        setIsUploading(true);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("repairId", repairId);
        formData.append("category", "appearance");

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            if (res.ok) {
                router.refresh(); // Refresh page to show new photo
            } else {
                alert("アップロードに失敗しました");
            }
        } catch (err) {
            console.error(err);
            alert("エラーが発生しました");
        } finally {
            setIsUploading(false);
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="space-y-4">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileSelect}
            // Optional: capture="environment" for mobile camera logic if needed, but 'image/*' usually prompts choice
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Add Button */}
                <Card
                    className="aspect-square flex flex-col items-center justify-center border-dashed border-2 border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer text-slate-500"
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                >
                    {isUploading ? (
                        <Loader2 className="w-8 h-8 mb-2 animate-spin text-blue-500" />
                    ) : (
                        <Camera className="w-8 h-8 mb-2" />
                    )}
                    <span className="text-xs font-bold">
                        {isUploading ? "送信中..." : "写真を追加"}
                    </span>
                </Card>

                {photos.map((photo, i) => (
                    <Dialog key={i}>
                        <DialogTrigger asChild>
                            <div className="relative aspect-square cursor-pointer overflow-hidden rounded-md border border-slate-200 hover:opacity-90 transition-opacity group">
                                {/* Using standard img for broad compatibility */}
                                <img
                                    src={photo}
                                    alt={`Repair Photo ${i + 1}`}
                                    className="object-cover w-full h-full transition-transform group-hover:scale-105"
                                />
                            </div>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl w-full p-0 overflow-hidden bg-black/90 border-none">
                            <div className="relative w-full h-[60vh] flex items-center justify-center">
                                <img
                                    src={photo}
                                    alt="Full size"
                                    className="max-h-full max-w-full object-contain"
                                />
                            </div>
                        </DialogContent>
                    </Dialog>
                ))}
            </div>
        </div>
    );
}
