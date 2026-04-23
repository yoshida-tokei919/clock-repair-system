"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { LinePreviewModal } from "./LinePreviewModal";

interface LineButtonProps {
    repairId: string;
    customerName: string;
    status: string;
}

export function LineButton({ repairId, customerName, status }: LineButtonProps) {
    const [isOpen, setIsOpen] = useState(false);

    // Mock Message Generation based on status
    const getMessage = () => {
        if (status === '受付') return "時計のお預かり連絡です。診断結果が出るまで今しばらくお待ちください。";
        if (status === '見積中') return "お見積もりが完了しました。詳細をご確認ください。";
        if (status === '部品待ち(未注文)' || status === '部品待ち(注文済み)') return "部品の手配を行っております。入荷まで少々お待ちください。";
        if (status === '作業完了') return "修理が完了いたしました。ご都合の良い時にお受け取りにお越しください。";
        return "ステータスが更新されました。";
    };

    return (
        <>
            <Button
                onClick={() => setIsOpen(true)}
                className="bg-[#06c755] hover:bg-[#05b34c] text-white border-none"
                size="sm"
            >
                <MessageCircle className="w-4 h-4 mr-2" /> LINE通知
            </Button>

            <LinePreviewModal
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                recipientName={customerName}
                messageText={getMessage()}
                attachmentType="pdf" // Mocking a PDF attachment for now
                attachmentTitle={`Repair-${repairId}.pdf`}
                onSend={() => {
                    alert("LINE送信を実行しました (Mock)");
                    setIsOpen(false);
                }}
            />
        </>
    );
}
