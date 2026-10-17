"use client";

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, Loader2 } from "lucide-react";
import QRCode from "qrcode";

interface MobileConnectDialogProps {
    isOpen: boolean;
    onClose: () => void;
    repairId: string;
    onPhotosUploaded: () => void; // Callback to refresh default photo list
}

export function MobileConnectDialog({ isOpen, onClose, repairId, onPhotosUploaded }: MobileConnectDialogProps) {
    const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
    const [isListening, setIsListening] = useState(false);
    const [qrError, setQrError] = useState(false);

    // Generate QR Code
    useEffect(() => {
        if (isOpen && repairId) {
            // Get current host. In production, this should be the actual domain.
            // For local dev, we need the local IP, but localhost won't work on mobile.
            // Assuming the user can access via the network IP or a tunnel.
            // For this implementation, we use window.location.origin
            const baseUrl = window.location.origin;
            let cancelled = false;
            setQrCodeUrl("");
            setQrError(false);
            setIsListening(false);
            fetch(`/api/repairs/${repairId}/mobile-photo-token`, { method: "POST", cache: "no-store" })
                .then(async (response) => {
                    if (!response.ok) throw new Error("Could not create mobile upload link");
                    const { token } = await response.json();
                    const targetUrl = `${baseUrl}/mobile/repairs/${repairId}/upload#token=${encodeURIComponent(token)}`;
                    return QRCode.toDataURL(targetUrl, { width: 400, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
                })
                .then(url => { if (!cancelled) { setQrCodeUrl(url); setIsListening(true); } })
                .catch(err => { if (!cancelled) { console.error(err); setQrError(true); } });
            return () => { cancelled = true; setIsListening(false); };
        } else {
            setIsListening(false);
            setQrCodeUrl("");
        }
    }, [isOpen, repairId]);

    // Polling for new photos (simple implementation)
    // In a real app, use WebSockets or Server-Sent Events
    useEffect(() => {
        if (!isListening) return;

        const interval = setInterval(() => {
            // We'll trust the parent to diff the photos or just blindly refresh
            // Here we simply trigger the refresh callback occasionally
            onPhotosUploaded();
        }, 3000);

        return () => clearInterval(interval);
    }, [isListening, onPhotosUploaded]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader className="text-center">
                    <DialogTitle className="text-xl flex items-center justify-center gap-2 text-zinc-800">
                        <Smartphone className="w-6 h-6 text-blue-500" />
                        スマホで撮影
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500">
                        以下のQRコードをスマートフォンのカメラで読み取ってください。
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center py-6 space-y-6">
                    <div className="relative group">
                        {qrCodeUrl ? (
                            <div className="p-4 bg-white rounded-xl border-2 border-dashed border-blue-200 shadow-sm">
                                <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64" />
                            </div>
                        ) : qrError ? (
                            <div className="w-64 h-64 bg-zinc-100 rounded-xl flex items-center justify-center text-sm text-red-600 text-center p-4">QRコードを作成できませんでした。閉じて再度お試しください。</div>
                        ) : (
                            <div className="w-64 h-64 bg-zinc-100 rounded-xl flex items-center justify-center">
                                <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
                            </div>
                        )}

                        {/* Status Badge */}
                        {qrCodeUrl && <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-2 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            接続待機中...
                        </div>}
                    </div>

                    <div className="text-center space-y-1">
                        <p className="font-bold text-zinc-700">準備完了</p>
                        <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                            アプリのインストールは不要です。<br />
                            撮影した写真は自動的にこのPC画面に表示されます。
                        </p>
                    </div>
                </div>

                <div className="flex justify-center">
                    <Button variant="outline" onClick={onClose} className="w-full sm:w-auto min-w-[120px]">
                        閉じる
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
