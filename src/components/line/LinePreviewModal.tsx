"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Send } from "lucide-react";

interface LinePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    recipientName: string;
    messageText: string;
    attachmentType?: "pdf" | "image" | null;
    attachmentTitle?: string;
    onSend: () => void;
}

export function LinePreviewModal({
    isOpen,
    onClose,
    recipientName,
    messageText,
    attachmentType,
    attachmentTitle,
    onSend
}: LinePreviewModalProps) {
    // ダイアログが開いた時点のタイムスタンプ（SSR/CSRの差異を防ぐためuseEffectで設定）
    const [timestamp, setTimestamp] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        const now = new Date();
        setTimestamp(
            `${now.toLocaleDateString("ja-JP", { timeZone: 'Asia/Tokyo' })} ${now.toLocaleTimeString("ja-JP", { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}`
        );
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md p-0 overflow-hidden bg-zinc-900 border-zinc-800">
                <div className="flex flex-col h-[600px] w-full bg-[#709fb0] relative">
                    {/* ヘッダー */}
                    <div className="bg-[#2c3d50] text-white p-3 flex items-center justify-between shadow-sm z-10">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">LINE プレビュー</span>
                        </div>
                        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
                    </div>

                    {/* チャットエリア */}
                    <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
                        {/* タイムスタンプ */}
                        <div className="text-center">
                            <span className="bg-[rgba(0,0,0,0.1)] text-white text-[10px] px-2 py-1 rounded-full">
                                {timestamp}
                            </span>
                        </div>

                        {/* メッセージバブル */}
                        <div className="flex gap-2">
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border shrink-0">
                                <span className="font-bold text-[10px] text-zinc-700">工房</span>
                            </div>
                            <div className="flex flex-col gap-1 max-w-[85%]">
                                <span className="text-[10px] text-white drop-shadow-md">ヨシダ時計修理工房</span>

                                {/* テキストバブル */}
                                <div className="bg-white p-3 rounded-lg rounded-tl-none shadow-sm text-sm text-zinc-800 whitespace-pre-wrap">
                                    {recipientName} 様{'\n\n'}
                                    {messageText}
                                </div>

                                {/* 添付ファイルバブル */}
                                {attachmentType === "pdf" && (
                                    <div className="bg-white p-3 rounded-lg rounded-tl-none shadow-sm flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity">
                                        <div className="w-10 h-12 bg-red-100 border border-red-200 rounded flex items-center justify-center text-red-600 font-bold text-xs">
                                            PDF
                                        </div>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="text-sm font-bold truncate text-zinc-800">{attachmentTitle || "document.pdf"}</span>
                                            <span className="text-[10px] text-zinc-500">ドキュメント</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* フッター */}
                    <div className="bg-white p-3 flex items-center justify-between border-t border-zinc-200">
                        <div className="text-xs text-zinc-500">
                            ※これは送信プレビューです
                        </div>
                        <Button type="button" onClick={onSend} className="bg-[#06c755] hover:bg-[#05b34c] text-white gap-2 h-9">
                            <Send className="w-4 h-4" /> 送信実行
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
