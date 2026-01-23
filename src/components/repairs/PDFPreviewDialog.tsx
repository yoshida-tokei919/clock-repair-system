"use client";

import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { usePDF } from "@react-pdf/renderer";
import { EstimateDocument, EstimateDocumentProps } from "@/components/pdf/EstimateDocument";
import { InvoiceDocument, InvoiceDocumentProps } from "@/components/pdf/InvoiceDocument";
import { WarrantyDocument, WarrantyDocumentProps } from "@/components/pdf/WarrantyDocument"; // Import Warranty

// Union type for data prop
type PDFData = EstimateDocumentProps['data'] | InvoiceDocumentProps['data'] | WarrantyDocumentProps['data'];

interface PDFPreviewDialogProps {
    data: PDFData;
    className?: string;
    onLineSend?: () => void;
    mode?: 'estimate' | 'invoice' | 'warranty' | 'delivery'; // Added delivery while at it?
}

export default function PDFPreviewDialog({ data, className, onLineSend, mode = 'estimate' }: PDFPreviewDialogProps) {
    // Select Document Component
    let MyDoc;
    let title = "プレビュー";
    let buttonLabel = "作成";

    switch (mode) {
        case 'invoice':
            MyDoc = <InvoiceDocument data={data as InvoiceDocumentProps['data']} />;
            title = "請求書プレビュー";
            buttonLabel = "請求書作成 (PDF)";
            break;
        case 'warranty':
            MyDoc = <WarrantyDocument data={data as WarrantyDocumentProps['data']} />;
            title = "保証書プレビュー";
            buttonLabel = "保証書発行 (PDF)";
            break;
        default:
            MyDoc = <EstimateDocument data={data as EstimateDocumentProps['data']} />;
            title = "見積書プレビュー";
            buttonLabel = "見積書作成 (PDF)";
    }

    const [instance, updateInstance] = usePDF({ document: MyDoc });
    const [isOpen, setIsOpen] = React.useState(false);

    useEffect(() => {
        if (isOpen) {
            updateInstance(MyDoc);
        }
    }, [data, isOpen, updateInstance, mode]);

    const handleLineClick = (e: React.MouseEvent) => {
        e.preventDefault();
        if (onLineSend) {
            setIsOpen(false);
            onLineSend();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className={className}>
                    <FileText className="w-4 h-4 mr-1" /> {buttonLabel}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                <DialogHeader className="flex flex-row items-center justify-between pr-8">
                    <DialogTitle>{title}</DialogTitle>
                    {onLineSend && mode !== 'warranty' && ( // Usually don't send warranty via LINE immediately? Optional.
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-[#06c755] border-[#06c755] hover:bg-green-50 gap-2 mr-4"
                            onClick={handleLineClick}
                        >
                            <span className="font-bold">LINEで送る</span>
                        </Button>
                    )}
                </DialogHeader>
                <div className="flex-1 w-full bg-zinc-100 rounded overflow-hidden relative">
                    {instance.loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-2">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                            <span className="text-zinc-500">Generating PDF...</span>
                        </div>
                    ) : instance.error ? (
                        <div className="flex items-center justify-center h-full text-red-500">
                            Error: {String(instance.error)}
                        </div>
                    ) : instance.url ? (
                        <iframe src={instance.url} className="w-full h-full" title={title} />
                    ) : (
                        <div className="flex items-center justify-center h-full text-zinc-400">
                            No Data
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
