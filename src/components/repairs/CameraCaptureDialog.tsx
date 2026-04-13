"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Check, X, CameraOff, Loader2, RotateCcw } from "lucide-react";
import { uploadRepairPhoto } from "@/lib/supabase-storage";
import { saveRepairPhoto } from "@/actions/photo-actions";

// キャプチャ時の最大幅（2560px = QHD相当）
// S5M2XのHDMI出力 → キャプチャボードは4K入力だが、WebPで圧縮するため2560pxに制限
const MAX_CAPTURE_WIDTH = 2560;
// WebP品質: 80%（画質とファイルサイズのバランス）
const WEBP_QUALITY = 0.8;

interface CameraCaptureDialogProps {
    isOpen: boolean;
    onClose: () => void;
    repairId: number;
    category?: string;
    onSaved: () => void;
}

type DialogPhase = 'preview' | 'review' | 'uploading';

export function CameraCaptureDialog({
    isOpen,
    onClose,
    repairId,
    category = 'general',
    onSaved
}: CameraCaptureDialogProps) {
    const videoRef   = useRef<HTMLVideoElement>(null);
    const canvasRef  = useRef<HTMLCanvasElement>(null);

    const [phase, setPhase]               = useState<DialogPhase>('preview');
    const [stream, setStream]             = useState<MediaStream | null>(null);
    const [devices, setDevices]           = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
    const [capturedUrl, setCapturedUrl]   = useState<string | null>(null);
    const [captureInfo, setCaptureInfo]   = useState<string>('');
    const [error, setError]               = useState<string | null>(null);
    const [uploadError, setUploadError]   = useState<string | null>(null);

    // ダイアログが閉じたらストリームを停止・状態をリセット
    const handleClose = useCallback(() => {
        if (stream) stream.getTracks().forEach(t => t.stop());
        setStream(null);
        setPhase('preview');
        setCapturedBlob(null);
        if (capturedUrl) URL.revokeObjectURL(capturedUrl);
        setCapturedUrl(null);
        setError(null);
        setUploadError(null);
        onClose();
    }, [stream, capturedUrl, onClose]);

    // デバイス一覧を取得（ダイアログを開くたびに最新化）
    useEffect(() => {
        if (!isOpen) return;
        setPhase('preview');

        navigator.mediaDevices.enumerateDevices()
            .then(all => {
                const video = all.filter(d => d.kind === 'videoinput');
                setDevices(video);
                if (video.length > 0 && !selectedDeviceId) {
                    setSelectedDeviceId(video[0].deviceId);
                }
            })
            .catch(err => console.error('デバイス取得エラー:', err));
    }, [isOpen]);

    // カメラストリームを開始（デバイス変更時も再実行）
    useEffect(() => {
        if (!isOpen || !selectedDeviceId || phase !== 'preview') return;

        let activeStream: MediaStream | null = null;

        const startCamera = async () => {
            try {
                if (stream) stream.getTracks().forEach(t => t.stop());

                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        deviceId: { exact: selectedDeviceId },
                        width:  { ideal: 3840 }, // 4K入力を受け付ける（キャプチャボード対応）
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
                console.error('カメラ起動エラー:', err);
                setError(`カメラの起動に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
            }
        };

        startCamera();

        return () => {
            activeStream?.getTracks().forEach(t => t.stop());
        };
    }, [isOpen, selectedDeviceId, phase]);

    // 撮影: canvasにフレームを描画 → WebP 80% で Blob 生成
    const capturePhoto = () => {
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        // 最大幅を超える場合はリサイズ
        const scale = video.videoWidth > MAX_CAPTURE_WIDTH
            ? MAX_CAPTURE_WIDTH / video.videoWidth
            : 1;
        canvas.width  = Math.round(video.videoWidth  * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (!blob) return;

            const url = URL.createObjectURL(blob);
            setCapturedBlob(blob);
            setCapturedUrl(url);
            setCaptureInfo(`${canvas.width} × ${canvas.height}px / ${(blob.size / 1024).toFixed(0)} KB (WebP)`);
            // ストリームは保持したまま、レビュー画面へ遷移
            setPhase('review');
        }, 'image/webp', WEBP_QUALITY);
    };

    // 再撮影: レビュー画面からプレビュー画面に戻る
    const retake = () => {
        if (capturedUrl) URL.revokeObjectURL(capturedUrl);
        setCapturedBlob(null);
        setCapturedUrl(null);
        setUploadError(null);
        setPhase('preview');
    };

    // 保存: Supabase Storage → DB
    const handleSave = async () => {
        if (!capturedBlob) return;
        setPhase('uploading');
        setUploadError(null);

        try {
            const { path } = await uploadRepairPhoto(capturedBlob, repairId);
            const result = await saveRepairPhoto(repairId, path, category);
            if (!result.success) throw new Error(result.error ?? '保存に失敗しました');

            handleClose();
            onSaved();
        } catch (err) {
            console.error('写真保存エラー:', err);
            setUploadError(err instanceof Error ? err.message : '保存に失敗しました');
            setPhase('review');
        }
    };

    const deviceLabel = (device: MediaDeviceInfo, i: number) =>
        device.label || `カメラ ${i + 1}`;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-zinc-800">
                {/* ヘッダー */}
                <DialogHeader className="p-3 bg-zinc-900 border-b border-zinc-800 flex flex-row items-center justify-between">
                    <DialogTitle className="text-white flex items-center gap-2 text-sm">
                        <Camera className="w-4 h-4 text-blue-400" />
                        {phase === 'review'    ? '撮影確認'  :
                         phase === 'uploading' ? '保存中...' : 'カメラ撮影'}
                    </DialogTitle>
                    <div className="flex items-center gap-2">
                        {phase === 'preview' && devices.length > 1 && (
                            <select
                                className="bg-zinc-800 text-white text-xs p-1 rounded border border-zinc-700 outline-none"
                                value={selectedDeviceId}
                                onChange={(e) => setSelectedDeviceId(e.target.value)}
                            >
                                {devices.map((device, i) => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {deviceLabel(device, i)}
                                    </option>
                                ))}
                            </select>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleClose}
                            className="text-zinc-400 hover:text-white w-7 h-7"
                            disabled={phase === 'uploading'}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </DialogHeader>

                {/* メイン表示エリア */}
                <div className="relative aspect-video bg-zinc-950 flex items-center justify-center">
                    {/* エラー表示 */}
                    {error && phase === 'preview' ? (
                        <div className="text-center p-8">
                            <CameraOff className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                            <p className="text-zinc-400 text-sm">{error}</p>
                        </div>

                    ) : phase === 'review' || phase === 'uploading' ? (
                        /* レビュー・アップロード中: キャプチャ画像を表示 */
                        <div className="relative w-full h-full flex items-center justify-center">
                            {capturedUrl && (
                                <img
                                    src={capturedUrl}
                                    alt="撮影確認"
                                    className="max-w-full max-h-full object-contain"
                                />
                            )}
                            {phase === 'uploading' && (
                                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                                    <p className="text-white text-sm">Supabase Storageに保存中...</p>
                                </div>
                            )}
                        </div>

                    ) : (
                        /* ライブプレビュー */
                        <>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-contain"
                            />
                            {/* フォーカスガイド */}
                            <div className="absolute inset-0 pointer-events-none border border-white/10 flex items-center justify-center">
                                <div className="w-32 h-32 border border-white/20 rounded-full" />
                                <div className="absolute top-3 left-3 text-[10px] font-mono text-white/40 bg-black/40 px-2 py-0.5 rounded">
                                    ライブプレビュー
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* フッター操作ボタン */}
                <div className="p-4 bg-zinc-900 flex justify-center items-center gap-6">
                    {phase === 'preview' && (
                        /* 撮影ボタン */
                        <Button
                            size="lg"
                            onClick={capturePhoto}
                            disabled={!!error || !stream}
                            className="w-16 h-16 rounded-full bg-white hover:bg-zinc-100 border-4 border-zinc-700 shadow-xl transition-transform active:scale-90 p-0"
                            title="撮影"
                        >
                            <div className="w-10 h-10 rounded-full bg-zinc-200" />
                        </Button>
                    )}

                    {phase === 'review' && (
                        <>
                            {uploadError && (
                                <p className="text-red-400 text-xs mr-4">{uploadError}</p>
                            )}
                            {/* 撮影情報 */}
                            {captureInfo && (
                                <span className="text-zinc-500 text-[10px] font-mono absolute left-4 bottom-4">
                                    {captureInfo}
                                </span>
                            )}
                            <Button
                                variant="outline"
                                onClick={retake}
                                className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 gap-2"
                            >
                                <RotateCcw className="w-4 h-4" />
                                再撮影
                            </Button>
                            <Button
                                onClick={handleSave}
                                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                            >
                                <Check className="w-4 h-4" />
                                保存する
                            </Button>
                        </>
                    )}
                </div>

                <canvas ref={canvasRef} className="hidden" />
            </DialogContent>
        </Dialog>
    );
}
