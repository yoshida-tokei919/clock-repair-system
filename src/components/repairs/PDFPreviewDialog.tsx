
"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import { EstimateDocument } from "@/components/pdf/EstimateDocument";
import { DeliveryDocument } from "@/components/pdf/DeliveryDocument";
import { InvoiceDocument } from "@/components/pdf/InvoiceDocument";
import { WarrantyDocument } from "@/components/pdf/WarrantyDocument";
import { Loader2, Printer, Download } from "lucide-react";
import QRCode from "qrcode";
import { formatPartDisplay } from "@/lib/formatPartDisplay";

interface PDFPreviewDialogProps {
    isOpen: boolean;
    onClose: () => void;
    repairData: any; // The raw data from form or DB
}

export default function PDFPreviewDialog({ isOpen, onClose, repairData }: PDFPreviewDialogProps) {
    const [activeTab, setActiveTab] = useState("estimate");
    const [isClient, setIsClient] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | undefined>(undefined);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // --- QR CODE GENERATION ---
    useEffect(() => {
        if (!isOpen || !repairData?.id) return;

        // Construct URL for the specific repair (e.g., status or landing page)
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : "";
        const targetUrl = `${baseUrl}/repairs/${repairData.id}/register`;

        QRCode.toDataURL(targetUrl, {
            width: 300,
            margin: 2,
            color: { dark: "#000000", light: "#ffffff" }
        })
            .then(url => setQrCodeUrl(url))
            .catch(err => console.error("QR Gen Error:", err));
    }, [isOpen, repairData?.id]);

    if (!isOpen || !repairData) return null;

    // --- DATA MAPPING (Raw -> PDF Props) ---
    const commonCustomer = {
        name: repairData.customer?.name || "顧客名なし",
        address: repairData.customer?.address || "",
        type: repairData.customer?.type || 'individual'
    };

    // Construct "Jobs" array (even if single repair, we treat as list of 1)
    const singleJob = {
        id: repairData.id || "preview",
        inquiryNumber: repairData.inquiryNumber || "DRAFT",
        partnerRef: repairData.partnerRef || "", // 貴社管理No
        endUserName: repairData.endUserName || "",
        watch: {
            brand: repairData.watch?.brand || repairData.watch?.brandName || "",
            model: repairData.watch?.model || repairData.watch?.modelName || "",
            ref: repairData.watch?.ref || repairData.watch?.refName || "",
            serial: repairData.watch?.serial || repairData.watch?.serialNumber || ""
        },
        items: repairData.estimate?.items?.map((i: any) => ({
            name: i.name || i.itemName,
            price: i.price || i.unitPrice || 0,
            type: i.type || (i.partsMasterId ? 'part' : 'labor'),
            grade: i.grade || i.partsMaster?.grade || '',
            note2: i.note2 || i.partsMaster?.notes2 || '',
            displayName: (i.type || (i.partsMasterId ? 'part' : 'labor')) === 'part'
                ? formatPartDisplay({
                    name: i.name || i.itemName,
                    grade: i.grade || i.partsMaster?.grade || '',
                    note2: i.note2 || i.partsMaster?.notes2 || '',
                })
                : (i.name || i.itemName),
        })) || []
    };

    const jobsList = [singleJob]; // Currently single mode only

    // Document Props Generators
    const estimateData = {
        estimateNumber: `E-${repairData.inquiryNumber || "DRAFT"}`,
        date: new Date().toLocaleDateString("ja-JP"),
        customer: commonCustomer,
        jobs: jobsList
    };

    const deliveryData = {
        deliveryNumber: `D-${repairData.inquiryNumber || "DRAFT"}`,
        date: new Date().toLocaleDateString("ja-JP"),
        customer: commonCustomer,
        jobs: jobsList,
        taxRate: 0.1,
        shippingFee: repairData.shippingFee || 0
    };

    const invoiceData = {
        invoiceNumber: `IV-${repairData.inquiryNumber || "DRAFT"}`,
        date: new Date().toLocaleDateString("ja-JP"),
        dueDate: "別途通知",
        customer: commonCustomer,
        items: jobsList.map(j => ({
            date: new Date().toLocaleDateString("ja-JP"),
            slipNumber: `D-${j.inquiryNumber}`,
            description: `時計修理代 (${j.watch.brand} ${j.watch.model})`,
            amount: j.items.reduce((s: number, x: any) => s + x.price, 0)
        })),
        taxRate: 0.1
    };

    // Warranty Date Calculation (Fix: +1 Year)
    const today = new Date();
    const oneYearLater = new Date(today);
    oneYearLater.setFullYear(today.getFullYear() + 1);

    const warrantyData = {
        warrantyNumber: `W-${repairData.inquiryNumber || "DRAFT"}`,
        issueDate: today.toLocaleDateString("ja-JP"),
        guaranteeStart: today.toLocaleDateString("ja-JP"),
        guaranteeEnd: oneYearLater.toLocaleDateString("ja-JP"),
        watch: singleJob.watch,
        repairSummary: singleJob.items.map((i: any) => i.name).join(", "),
        qrCodeUrl: qrCodeUrl // Pass the generated QR
    };

    return (
        <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-[90vw] h-[90vh] flex flex-col p-0 gap-0 bg-zinc-100">
                <div className="p-2 border-b bg-white flex justify-between items-center shadow-sm z-10">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-lg">
                        <TabsList className="grid w-full grid-cols-4 h-8">
                            <TabsTrigger value="estimate" className="text-xs">見積書</TabsTrigger>
                            <TabsTrigger value="delivery" className="text-xs">納品書</TabsTrigger>
                            <TabsTrigger value="invoice" className="text-xs">請求書</TabsTrigger>
                            <TabsTrigger value="warranty" className="text-xs">保証書</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onClose} >閉じる</Button>
                    </div>
                </div>

                <div className="flex-1 bg-zinc-500 overflow-hidden relative">
                    {!isClient ? (
                        <div className="flex items-center justify-center h-full text-white gap-2">
                            <Loader2 className="w-6 h-6 animate-spin" /> Preparing PDF...
                        </div>
                    ) : (
                        <PDFViewer width="100%" height="100%" className="border-0">
                            {activeTab === 'estimate' ? <EstimateDocument data={estimateData} /> :
                                activeTab === 'delivery' ? <DeliveryDocument data={deliveryData} /> :
                                    activeTab === 'invoice' ? <InvoiceDocument data={invoiceData} /> :
                                        <WarrantyDocument data={warrantyData} />}
                        </PDFViewer>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
