"use client";

import React, { useState, useRef } from "react";
import { Camera, Image as ImageIcon, Upload, CheckCircle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import imageCompression from "browser-image-compression";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export default function MobileUploadPage({ params }: { params: { id: string } }) {
    const repairId = params.id;
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedCount, setUploadedCount] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsUploading(true);

        try {
            for (const file of files) {
                // 1. Compress
                const options = {
                    maxSizeMB: 1,
                    maxWidthOrHeight: 3000,
                    useWebWorker: true,
                    fileType: 'image/webp' as const
                };

                // imageCompression expects file type to be implicitly handled, cast explicitly for options
                const compressedBlob = await imageCompression(file, options as any);

                // 2. Upload
                const formData = new FormData();
                const fileName = `mobile-${Date.now()}.webp`;
                formData.append("file", compressedBlob, fileName);
                formData.append("repairId", repairId);
                formData.append("source", "mobile"); // Mark as mobile upload

                const res = await fetch("/api/upload", {
                    method: "POST",
                    body: formData,
                });

                if (res.ok) {
                    setUploadedCount(prev => prev + 1);
                    toast({ title: "アップロード完了", description: "PCの画面に反映されます", className: "bg-green-500 text-white" });
                } else {
                    throw new Error("Upload failed");
                }
            }
        } catch (error) {
            console.error(error);
            toast({ title: "エラー", description: "アップロードに失敗しました", variant: "destructive" });
        } finally {
            setIsUploading(false);
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 flex flex-col items-center">
            <div className="w-full max-w-md space-y-6 mt-8">

                <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
                        <Smartphone className="w-8 h-8" />
                    </div>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">スマホ連携撮影</h1>
                    <p className="text-sm text-zinc-400">修理ID: <span className="font-mono text-white">#{repairId}</span></p>
                </div>

                <Card className="bg-zinc-900/50 border-zinc-800 p-6 flex flex-col items-center gap-6">
                    <input
                        type="file"
                        accept="image/*"
                        capture="environment" // Launch camera directly
                        multiple
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                    />

                    <div className="grid grid-cols-2 gap-4 w-full">
                        <Button
                            size="lg"
                            className="h-32 flex flex-col gap-3 bg-blue-600 hover:bg-blue-500 border-0 rounded-2xl shadow-lg shadow-blue-900/20 active:scale-95 transition-all"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                            ) : (
                                <Camera className="w-10 h-10" />
                            )}
                            <span className="font-bold">カメラを起動</span>
                        </Button>

                        <Button
                            variant="outline"
                            size="lg"
                            className="h-32 flex flex-col gap-3 bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded-2xl active:scale-95 transition-all"
                            onClick={() => {
                                // Remove capture attribute to allow gallery selection if needed, 
                                // but for now simple click is fine. 
                                // To specifically open gallery we might need another input without 'capture'
                                // but standard behavior usually offers choice.
                                fileInputRef.current?.click();
                            }}
                            disabled={isUploading}
                        >
                            <ImageIcon className="w-10 h-10" />
                            <span className="font-medium">ライブラリから</span>
                        </Button>
                    </div>

                    {uploadedCount > 0 && (
                        <div className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                            <div className="flex-1">
                                <p className="text-sm font-bold text-emerald-400">転送完了: {uploadedCount}枚</p>
                                <p className="text-xs text-emerald-500/70">PCの画面を確認してください</p>
                            </div>
                        </div>
                    )}

                    <div className="text-xs text-zinc-500 text-center max-w-[200px]">
                        撮影した写真は自動的に圧縮・最適化されてPCに転送されます
                    </div>
                </Card>
            </div>
        </div>
    );
}
