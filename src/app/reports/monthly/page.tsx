"use client";
export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import dynamicImport from "next/dynamic";
import { usePDF } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button"; // Assumed existing
import { Card } from "@/components/ui/card";
import { Printer, Download, FileText } from "lucide-react";
import { SalesDocument, SalesDocumentProps } from "@/components/pdf/SalesDocument";

// --- Mock Data ---
const MOCK_SALES_DATA: SalesDocumentProps['data'] = {
    month: "2026-01",
    items: [
        { id: "S-00040", date: "2026-01-05", customerName: "鈴木 一郎 様", watchInfo: "ROLEX Submariner", techFee: 45000, partsFee: 2000 },
        { id: "S-00041", date: "2026-01-08", customerName: "株式会社 時計商事", watchInfo: "OMEGA Speedmaster", techFee: 60000, partsFee: 8000 },
        { id: "S-00042", date: "2026-01-12", customerName: "田中 美咲 様", watchInfo: "CARTIER Tank", techFee: 15000, partsFee: 0 },
        { id: "S-00043", date: "2026-01-15", customerName: "佐藤 健 様", watchInfo: "SEIKO GS", techFee: 55000, partsFee: 0 },
        { id: "S-00044", date: "2026-01-16", customerName: "高橋 誠 様", watchInfo: "IWC Portugieser", techFee: 70000, partsFee: 15000 },
    ]
};

// --- PDF Viewer (Client Only) ---
const PDFViewer = dynamicImport(
    () => import("@react-pdf/renderer").then((mod) => mod.PDFViewer),
    { ssr: false, loading: () => <div className="h-full flex items-center justify-center bg-gray-100">Loading PDF Engine...</div> }
);

export default function MonthlyReportPage() {
    const [isReady, setIsReady] = useState(false);
    const [reportMonth, setReportMonth] = useState("2026-01");

    // usePDF Hook causes build error in Next 14 app dir if not handled carefully
    // const [instance, updateInstance] = usePDF({ document: <SalesDocument data={MOCK_SALES_DATA} /> });

    useEffect(() => {
        // Simulate data fetching or preparation
        setIsReady(true);
    }, []);

    const handleManualGenerate = async () => {
        // updateInstance(<SalesDocument data={MOCK_SALES_DATA} />);
        alert("PDF Generation not available in preview");
    };

    return (
        <div className="min-h-screen bg-zinc-50 p-6 font-sans text-zinc-900">
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-zinc-800 flex items-center gap-2">
                            <FileText className="w-6 h-6" /> 月次売上レポート
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <input
                            type="month"
                            className="border rounded px-3 py-2 bg-white"
                            value={reportMonth}
                            onChange={(e) => setReportMonth(e.target.value)}
                        />
                        <Button onClick={handleManualGenerate} className="gap-2">
                            <Printer className="w-4 h-4" /> PDF作成
                        </Button>
                    </div>
                </div>

                {/* Preview Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Left: Summary Cards (Dashboard Lite) */}
                    <div className="lg:col-span-1 space-y-4">
                        <Card className="p-4 bg-white shadow-sm border-l-4 border-blue-500">
                            <p className="text-xs text-zinc-500 font-bold uppercase">売上合計</p>
                            <p className="text-2xl font-bold text-zinc-900">¥297,000</p>
                            <p className="text-xs text-zinc-400">税込合計</p>
                        </Card>
                        <Card className="p-4 bg-white shadow-sm border-l-4 border-green-500">
                            <p className="text-xs text-zinc-500 font-bold uppercase">完了件数</p>
                            <p className="text-2xl font-bold text-zinc-900">5 <span className="text-sm font-normal text-zinc-400">件</span></p>
                        </Card>
                        <Card className="p-4 bg-white shadow-sm border-l-4 border-orange-500">
                            <p className="text-xs text-zinc-500 font-bold uppercase">技術料計</p>
                            <p className="text-xl font-bold text-zinc-900">¥245,000</p>
                        </Card>
                    </div>

                    {/* Right: PDF Preview */}
                    <div className="lg:col-span-2 h-[800px] bg-zinc-200 rounded-lg overflow-hidden border border-zinc-300 shadow-inner">
                        {isReady ? (
                            <PDFViewer width="100%" height="100%" showToolbar={true}>
                                <SalesDocument data={MOCK_SALES_DATA} />
                            </PDFViewer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-zinc-500">
                                <p>レポートデータを準備中...</p>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
