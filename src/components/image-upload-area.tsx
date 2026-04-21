"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { compressImageForUpload } from '@/lib/image-compression';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Camera, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface UploadedImage {
    file: File;
    previewUrl: string;
}

interface ImageUploadAreaProps {
    onImagesProcessed: (files: File[]) => void;
    className?: string;
}

export function ImageUploadArea({ onImagesProcessed, className }: ImageUploadAreaProps) {
    const [images, setImages] = useState<UploadedImage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    const processFiles = async (files: File[]) => {
        setIsProcessing(true);
        setProgress({ current: 0, total: files.length });

        const newImages: UploadedImage[] = [];

        // Process sequentially to avoid browser freeze on low-end devices, 
        // or Promise.all if we are confident. 
        // Given "Batch 10 images", parallel is better but let's limit concurrency if needed.
        // For simplicity and progress tracking, we'll do:

        for (let i = 0; i < files.length; i++) {
            try {
                const result = await compressImageForUpload(files[i]);
                newImages.push(result);
            } catch (e) {
                console.error("Failed to process", files[i].name, e);
            }
            setProgress(prev => ({ ...prev, current: i + 1 }));
        }

        setImages(prev => {
            const updated = [...prev, ...newImages];
            onImagesProcessed(updated.map(u => u.file));
            return updated;
        });

        setIsProcessing(false);
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            processFiles(acceptedFiles);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        noClick: true // We handle click buttons manually
    });

    const removeImage = (index: number) => {
        setImages(prev => {
            const updated = [...prev];
            updated.splice(index, 1);
            onImagesProcessed(updated.map(u => u.file));
            return updated;
        });
    };

    // Hidden input for direct camera access
    const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(Array.from(e.target.files));
        }
    };

    return (
        <div className={cn("space-y-4", className)}>
            {/* Drop Zone */}
            <div
                {...getRootProps()}
                className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center transition-colors relative bg-card/50 hover:bg-card/80",
                    isDragActive ? "border-primary bg-primary/10" : "border-muted-foreground/25"
                )}
            >
                <input {...getInputProps()} /> {/* Main file input (hidden) */}

                <div className="flex flex-col items-center gap-2">
                    <div className="p-3 bg-secondary rounded-full">
                        <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="font-semibold text-lg">写真をアップロード</h3>
                        <p className="text-sm text-muted-foreground">
                            ドラッグ&ドロップ、または下のボタンから追加
                        </p>
                    </div>

                    <div className="flex gap-3 mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={open}
                            disabled={isProcessing}
                        >
                            ファイルを選択
                        </Button>

                        {/* Camera Button (Mobile Friendly) */}
                        <div className="relative">
                            <Button
                                type="button"
                                disabled={isProcessing}
                                className="gap-2"
                            >
                                <Camera className="w-4 h-4" />
                                カメラ
                            </Button>
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={handleCameraCapture}
                                disabled={isProcessing}
                            />
                        </div>
                    </div>
                </div>

                {isProcessing && (
                    <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center p-4">
                        <div className="w-full max-w-xs space-y-2">
                            <div className="flex justify-between text-sm font-medium">
                                <span>圧縮中...</span>
                                <span>{progress.current} / {progress.total}</span>
                            </div>
                            <ProgressBar value={progress.current} max={progress.total} />
                        </div>
                    </div>
                )}
            </div>

            {/* Preview Grid */}
            {images.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {images.map((img, idx) => (
                        <div key={idx} className="group relative aspect-square rounded-md overflow-hidden border bg-background">
                            <img
                                src={img.previewUrl}
                                alt="プレビュー"
                                className="w-full h-full object-cover"
                            />
                            <button
                                type="button"
                                onClick={() => removeImage(idx)}
                                className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1">
                                <p className="text-[10px] text-white text-center truncate">
                                    {(img.file.size / 1024).toFixed(0)} KB (WebP)
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
