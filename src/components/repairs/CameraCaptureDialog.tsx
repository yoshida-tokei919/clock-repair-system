"use client";

import React, { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Check, X, CameraOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface CameraCaptureDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (blob: Blob) => void;
}

export function CameraCaptureDialog({ isOpen, onClose, onCapture }: CameraCaptureDialogProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
    const [error, setError] = useState<string | null>(null);

    // Get available video devices
    useEffect(() => {
        if (!isOpen) return;

        const getDevices = async () => {
            try {
                const allDevices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
                setDevices(videoDevices);
                if (videoDevices.length > 0 && !selectedDeviceId) {
                    setSelectedDeviceId(videoDevices[0].deviceId);
                }
            } catch (err) {
                console.error("Error listing devices:", err);
            }
        };

        getDevices();
    }, [isOpen]);

    // Start camera stream
    useEffect(() => {
        if (!isOpen || !selectedDeviceId) return;

        let activeStream: MediaStream | null = null;

        const startCamera = async () => {
            try {
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                }

                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                        width: { ideal: 3840 }, // Ask for 4K for S5IIX
                        height: { ideal: 2160 }
                    }
                });

                activeStream = newStream;
                setStream(newStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = newStream;
                }
                setError(null);
            } catch (err) {
                console.error("Error starting camera:", err);
                setError("カメラの起動に失敗しました。接続と設定を確認してください。");
            }
        };

        startCamera();

        return () => {
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [isOpen, selectedDeviceId]);

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        // Match canvas size to video stream
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext("2d");
        if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (blob) {
                    onCapture(blob);
                }
            }, "image/jpeg", 0.95);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-zinc-800">
                <DialogHeader className="p-4 bg-zinc-900 border-b border-zinc-800 flex flex-row items-center justify-between">
                    <DialogTitle className="text-white flex items-center gap-2">
                        <Camera className="w-5 h-5 text-blue-500" />
                        高画質撮影 (LUMIX S5IIX 連携)
                    </DialogTitle>
                    <div className="flex items-center gap-2">
                        {devices.length > 1 && (
                            <select
                                className="bg-zinc-800 text-white text-xs p-1 rounded border border-zinc-700 outline-none"
                                value={selectedDeviceId}
                                onChange={(e) => setSelectedDeviceId(e.target.value)}
                            >
                                {devices.map(device => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                                    </option>
                                ))}
                            </select>
                        )}
                        <Button variant="ghost" size="icon" onClick={onClose} className="text-zinc-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                </DialogHeader>

                <div className="relative aspect-video bg-zinc-950 flex items-center justify-center">
                    {error ? (
                        <div className="text-center p-8">
                            <CameraOff className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                            <p className="text-zinc-400 text-sm">{error}</p>
                        </div>
                    ) : (
                        <>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-contain"
                            />
                            {/* HUD overlay */}
                            <div className="absolute inset-0 pointer-events-none border-[1px] border-white/10 flex items-center justify-center">
                                <div className="w-48 h-48 border border-white/20 rounded-full" />
                                <div className="absolute top-4 left-4 text-[10px] font-mono text-white/50 bg-black/40 px-2 py-1 rounded">
                                    LIVE PREVIEW 4K SOURCE
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-6 bg-zinc-900 flex justify-center items-center gap-8">
                    <Button
                        size="lg"
                        onClick={capturePhoto}
                        className="w-20 h-20 rounded-full bg-white hover:bg-zinc-200 border-8 border-zinc-800 shadow-2xl transition-transform active:scale-90"
                        disabled={!!error || !stream}
                    >
                        <div className="w-8 h-8 rounded-full border-2 border-zinc-400" />
                    </Button>
                </div>

                <canvas ref={canvasRef} className="hidden" />
            </DialogContent>
        </Dialog>
    );
}
