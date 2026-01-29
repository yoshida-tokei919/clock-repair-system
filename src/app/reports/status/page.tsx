"use client";
export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import dynamicImport from "next/dynamic";
import { usePDF } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Printer, RefreshCw, ListTodo } from "lucide-react";
import { StatusDocument, StatusDocumentProps } from "@/components/pdf/StatusDocument";

// --- Mock Data ---
const MOCK_STATUS_DATA: StatusDocumentProps['data'] = {
    generatedAt: new Date().toLocaleString(),
    groups: [
        {
            status: "見積・診断中",
            count: 2,
            items: [
                { id: "S-00050", customerName: "田中 様", watchInfo: "ROLEX Datejust", startDate: "2026-01-20", dueDate: "2026-01-25" },
                { id: "S-00051", customerName: "鈴木 様", watchInfo: "SEIKO Presage", startDate: "2026-01-21", dueDate: "2026-01-26" },
            ]
        },
        {
            status: "部品発注中",
            count: 1,
            items: [
                { id: "S-00048", customerName: "佐藤 様", watchInfo: "OMEGA Seamaster", startDate: "2026-01-15", dueDate: "Pending" },
            ]
        },
        {
            status: "修理進行中",
            count: 2,
            items: [
                { id: "S-00045", customerName: "株式会社 時計商事", watchInfo: "CARTIER Pasha", startDate: "2026-01-10", dueDate: "2026-02-01" },
                { id: "S-00046", customerName: "高橋 様", watchInfo: "IWC Pilot", startDate: "2026-01-12", dueDate: "2026-02-10" },
            ]
        },
        {
            status: "最終検査・QC",
            count: 1,
            items: [
                { id: "S-00042", customerName: "山田 様", watchInfo: "PANERAI Luminor", startDate: "2026-01-05", dueDate: "2026-01-23" },
            ]
        }
    ]
};

// --- PDF Viewer (Client Only) ---
const PDFViewer = dynamicImport(
    () => import("@react-pdf/renderer").then((mod) => mod.PDFViewer),
    { ssr: false, loading: () => <div className="h-full flex items-center justify-center bg-gray-100">Loading PDF Engine...</div> }
);

export default function StatusReportPage() {
    const [isReady, setIsReady] = useState(false);
    // const [instance, updateInstance] = usePDF({ document: <StatusDocument data={MOCK_STATUS_DATA} /> });

    useEffect(() => {
        setIsReady(true);
    }, []);

    const handleRefresh = () => {
        // Re-generate with specific timestamp
        // const newData = { ...MOCK_STATUS_DATA, generatedAt: new Date().toLocaleString() };
        // updateInstance(<StatusDocument data={newData} />);
        alert("Refresh not available in preview");
    };

    return (
        <div className="min-h-screen bg-zinc-50 p-6 font-sans text-zinc-900">
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-zinc-800 flex items-center gap-2">
                            <ListTodo className="w-6 h-6" /> 修理進行状況レポート
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button onClick={handleRefresh} variant="outline" className="gap-2">
                            <RefreshCw className="w-4 h-4" /> 最新データ取得
                        </Button>
                    </div>
                </div>

                {/* Preview Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Left: Summary Cards */}
                    <div className="lg:col-span-1 space-y-4">
                        <Card className="p-4 bg-white shadow-sm border-l-4 border-yellow-500">
                            <p className="text-xs text-zinc-500 font-bold uppercase">進行中案件数</p>
                            <p className="text-3xl font-bold text-zinc-900">6 <span className="text-sm font-normal text-zinc-400">件</span></p>
                        </Card>
                        <div className="p-4 bg-white rounded shadow-sm">
                            <h3 className="font-bold border-b pb-2 mb-2">ステータス内訳</h3>
                            <ul className="space-y-2 text-sm">
                                <li className="flex justify-between"><span>見積・診断中</span> <span className="font-bold">2</span></li>
                                <li className="flex justify-between"><span>部品発注中</span> <span className="font-bold">1</span></li>
                                <li className="flex justify-between"><span>修理進行中</span> <span className="font-bold">2</span></li>
                                <li className="flex justify-between text-green-600"><span>最終検査・QC</span> <span className="font-bold">1</span></li>
                            </ul>
                        </div>
                    </div>

                    {/* Right: PDF Preview */}
                    <div className="lg:col-span-2 h-[800px] bg-zinc-200 rounded-lg overflow-hidden border border-zinc-300 shadow-inner">
                        {isReady ? (
                            <PDFViewer width="100%" height="100%" showToolbar={true}>
                                <StatusDocument data={MOCK_STATUS_DATA} />
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
