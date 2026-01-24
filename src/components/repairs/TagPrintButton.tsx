'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { pdf } from "@react-pdf/renderer";
import { TagDocument } from "@/components/pdf/TagDocument";

interface Props {
    repair: {
        id: string; // Add DB ID
        inquiryNumber: string;
        watch: {
            brand: string;
            brandJp?: string;
            model: string;
            ref: string;
        };
        customer: {
            name: string;
        };
    };
}

export function TagPrintButton({ repair }: Props) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [qrUrl, setQrUrl] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    // Pre-generate QR for the preview modal
    useEffect(() => {
        const gen = async () => {
            const url = `${window.location.origin}/repairs/${repair.id}`;
            const dataUrl = await QRCode.toDataURL(url, { margin: 2, width: 300 });
            setQrUrl(dataUrl);
        };
        gen();
    }, [repair.id]);

    const handlePrint = async () => {
        try {
            setIsGenerating(true);

            // 1. Generate QR Code pointing to the detail page
            const detailUrl = `${window.location.origin}/repairs/${repair.id}`;
            const qrUrl = await QRCode.toDataURL(detailUrl, { margin: 0, width: 200 });

            // 2. Generate PDF Blob
            const doc = (
                <TagDocument
                    repairId={repair.inquiryNumber}
                    modelName={`${repair.watch.brand} ${repair.watch.brandJp || ""} ${repair.watch.model} ${repair.watch.ref}`}
                    customerName={repair.customer.name}
                    qrCodeDataUrl={qrUrl}
                />
            );

            const blob = await pdf(doc).toBlob();
            const url = URL.createObjectURL(blob);

            // 3. Open in new window (User prints using OS dialog)
            window.open(url, '_blank');

        } catch (error: any) {
            console.error("Print failed", error);
            alert(`印刷データの生成に失敗しました: ${error.message || "Unknown error"}`);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex gap-2">
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                        <QrCode className="w-4 h-4" />
                        QR表示
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xs">
                    <DialogHeader>
                        <DialogTitle className="text-center">修理タグ用QRコード</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center justify-center p-4 gap-4">
                        {qrUrl ? (
                            <img src={qrUrl} alt="Repair QR Code" className="w-48 h-48 border rounded shadow-sm" />
                        ) : (
                            <div className="w-48 h-48 flex items-center justify-center bg-zinc-100 rounded">
                                <Loader2 className="animate-spin text-zinc-400" />
                            </div>
                        )}
                        <div className="text-center">
                            <p className="text-sm font-bold text-zinc-700">{repair.inquiryNumber}</p>
                            <p className="text-xs text-zinc-500">{repair.watch.brand} {repair.watch.brandJp} {repair.watch.model} {repair.watch.ref}</p>
                        </div>
                        <Button className="w-full" onClick={() => { setShowPreview(false); handlePrint(); }}>
                            <Printer className="w-4 h-4 mr-2" /> この内容で印刷
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={isGenerating}
                className="gap-2"
            >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                タグ印刷
            </Button>
        </div>
    );
}
