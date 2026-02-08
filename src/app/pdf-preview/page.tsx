
"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { PDFViewer } from "@react-pdf/renderer";
import { EstimateDocument } from "@/components/pdf/EstimateDocument";
import { DeliveryDocument } from "@/components/pdf/DeliveryDocument";
import { InvoiceDocument } from "@/components/pdf/InvoiceDocument";
import { WarrantyDocument } from "@/components/pdf/WarrantyDocument";
import { Button } from "@/components/ui/button";

// --- DUMMY DATA ---
const dummyCustomer = {
    name: "株式会社 タイムピース",
    type: "business" as const,
    address: "東京都新宿区西新宿 1-1-1"
};

const dummyJobs = [
    {
        id: "1",
        inquiryNumber: "R2405-001",
        partnerRef: "TP-9922",
        endUserName: "田中 太郎",
        watch: { brand: "ROLEX", model: "Datejust", ref: "16233", serial: "X123456" },
        items: [
            { name: "オーバーホール工賃 (OH Labor)", price: 35000 },
            { name: "ゼンマイ (Mainspring)", price: 6000 },
            { name: "パッキン一式 (Gasket Set)", price: 1500 },
            { name: "チューブ交換技術料 (Tube Labor)", price: 3000 },
            { name: "チューブ部品 (Tube Part)", price: 4000 }
        ]
    },
    {
        id: "2",
        inquiryNumber: "R2405-002",
        partnerRef: "TP-9923",
        endUserName: "佐藤 花子",
        watch: { brand: "OMEGA", model: "Speedmaster", ref: "3510.50", serial: "55889922" },
        items: [
            { name: "サファイアガラス (Crystal Part)", price: 15000 },
            { name: "ガラス交換技術料 (Labor)", price: 5000 },
            { name: "防水テスト (WR Test)", price: 3000 }
        ]
    },
    {
        id: "3", // A 3rd item to test list length
        inquiryNumber: "R2405-003",
        partnerRef: "TP-9924",
        endUserName: "鈴木 一郎",
        watch: { brand: "SEIKO", model: "Grand Seiko", ref: "SBGA011", serial: "998877" },
        items: [
            { name: "コンプリートサービス工賃", price: 45000 },
            { name: "ライトポリッシュ (Polishing)", price: 10000 }
        ]
    }
];

const dummyInvoiceItems = [
    { date: "2024/05/10", slipNumber: "D-0510-01", description: "修理代 (R2405-001, 002 他)", amount: 67500 },
    { date: "2024/05/15", slipNumber: "D-0515-02", description: "修理代 (R2405-003)", amount: 55000 },
    { date: "2024/05/20", slipNumber: "D-0520-05", description: "部品代 (Generic Parts)", amount: 4500 }
];

export default function PDFPreviewPage() {
    const [tab, setTab] = useState<"estimate" | "delivery" | "invoice" | "warranty">("estimate");
    const [isClient, setIsClient] = useState(false);

    useEffect(() => setIsClient(true), []);

    if (!isClient) return <div className="p-10">Loading PDF engine...</div>;

    return (
        <div className="h-screen bg-zinc-100 p-2 flex flex-col gap-2 overflow-hidden">
            <div className="flex justify-between items-center px-2">
                <h1 className="text-lg font-bold">V2 Documents Preview</h1>
                <div className="flex gap-2">
                    <Button size="sm" variant={tab === "estimate" ? "default" : "outline"} onClick={() => setTab("estimate")}>見積書</Button>
                    <Button size="sm" variant={tab === "delivery" ? "default" : "outline"} onClick={() => setTab("delivery")}>納品書</Button>
                    <Button size="sm" variant={tab === "invoice" ? "default" : "outline"} onClick={() => setTab("invoice")}>請求書</Button>
                    <Button size="sm" variant={tab === "warranty" ? "default" : "outline"} onClick={() => setTab("warranty")}>保証書</Button>
                </div>
            </div>

            <div className="flex-1 bg-zinc-800 rounded border border-zinc-300 overflow-hidden">
                <PDFViewer width="100%" height="100%" className="w-full h-full border-0" showToolbar={true}>
                    {tab === "estimate" ? (
                        <EstimateDocument data={{
                            estimateNumber: "E-2024-0501",
                            date: "2024/05/26",
                            customer: dummyCustomer,
                            jobs: dummyJobs
                        }} />
                    ) : tab === "delivery" ? (
                        <DeliveryDocument data={{
                            deliveryNumber: "D-2024-0501",
                            date: "2024/06/10",
                            customer: dummyCustomer,
                            jobs: dummyJobs,
                            taxRate: 0.1
                        }} />
                    ) : tab === "invoice" ? (
                        <InvoiceDocument data={{
                            invoiceNumber: "IV-2024-05",
                            date: "2024/06/30",
                            dueDate: "2024/07/31",
                            customer: dummyCustomer,
                            items: dummyInvoiceItems,
                            taxRate: 0.1
                        }} />
                    ) : (
                        <WarrantyDocument data={{
                            warrantyNumber: "W-12345",
                            issueDate: "2024/06/10",
                            guaranteeStart: "2024/06/10",
                            guaranteeEnd: "2025/06/10",
                            watch: dummyJobs[0].watch,
                            repairSummary: "オーバーホール (Overhaul), ゼンマイ交換, パッキン交換"
                        }} />
                    )}
                </PDFViewer>
            </div>
        </div>
    );
}
