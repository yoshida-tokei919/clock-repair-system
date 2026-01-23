"use client";

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { usePDF } from "@react-pdf/renderer";
import { TagDocument, TagDocumentProps } from "@/components/pdf/TagDocument"; // Check path
import QRCode from "qrcode";

interface TagPreviewDialogProps {
    data: Omit<TagDocumentProps, 'qrCodeDataUrl'> & { id: string; date?: string; }; // id alias repairId? Check usage
    className?: string;
}

// Helper to bridge prop names if needed
// TagDocumentProps has: repairId, modelName, customerName, qrCodeDataUrl

interface TagPDFViewerProps {
    data: TagDocumentProps;
}

const TagPDFViewer = ({ data }: TagPDFViewerProps) => {
    // Pass flat props to TagDocument
    const [instance] = usePDF({ document: <TagDocument {...data} /> });

    if (instance.loading) {
        return (
            <div className="flex flex-col items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span>Generating PDF...</span>
            </div>
        );
    }

    if (instance.error) {
        return <div className="text-red-500">Error generating PDF: {String(instance.error)}</div>;
    }

    return (
        <iframe src={instance.url!} className="w-full h-full border shadow-sm" title="Tag PDF" />
    );
};

export default function TagPreviewDialog({ data, className }: TagPreviewDialogProps) {
    const [qrUrl, setQrUrl] = useState<string>("");
    const [isOpen, setIsOpen] = useState(false);

    // Generate QR Code when dialog opens
    useEffect(() => {
        if (isOpen && data.id) {
            setQrUrl(""); // Reset
            // Link to detail page (assuming /repairs/[id])
            const targetUrl = `${window.location.origin}/repairs/${data.id}`;
            QRCode.toDataURL(targetUrl, { width: 200, margin: 1 })
                .then(url => setQrUrl(url))
                .catch(err => console.error("QR Gen Error", err));
        }
    }, [isOpen, data.id]);

    const fullData: TagDocumentProps | null = qrUrl ? {
        ...data,
        qrCodeDataUrl: qrUrl,
        // Ensure required props are present if they differ
        // If data.id is used as repairId:
        repairId: data.repairId || data.id
    } : null;

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className={className}>
                    <Printer className="w-4 h-4 mr-1" /> タグ印刷
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl h-[80vh]">
                <DialogHeader>
                    <DialogTitle>管理タグ印刷プレビュー</DialogTitle>
                </DialogHeader>
                <div className="flex-1 w-full h-full bg-zinc-100 rounded overflow-hidden flex flex-col items-center justify-center p-4">
                    <div className="mb-2 text-xs text-zinc-500">
                        ラベルプリンター(80mm x 50mmなど)に合わせて印刷してください。
                    </div>

                    {!fullData ? (
                        <div className="flex flex-col items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-400"></div>
                            <span>Generating QR Code...</span>
                        </div>
                    ) : (
                        <TagPDFViewer data={fullData} />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
