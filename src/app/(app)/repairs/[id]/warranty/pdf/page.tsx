"use client";

import dynamic from 'next/dynamic';
import React, { useEffect, useState } from 'react';
import { WarrantyDocument } from '@/components/pdf/WarrantyDocument';
import { usePDF, Document, Page, Text } from '@react-pdf/renderer';
import { getRepairDataForPDF } from '@/lib/repairs';

export default function WarrantyPDFPage({ params }: { params: { id: string } }) {
    const [pdfData, setPdfData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Fetch real data from DB
    useEffect(() => {
        async function fetchData() {
            try {
                const data = await getRepairDataForPDF(parseInt(params.id));
                setPdfData(data);
            } catch (err) {
                console.error("Failed to fetch repair data:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [params.id]);

    const docData = React.useMemo(() => {
        if (!pdfData) return null;

        // Calculate Expiry (1 Year from now)
        const deliveryDate = new Date();
        const expiryDate = new Date(deliveryDate);
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);

        const job = pdfData.jobs[0];

        return {
            warrantyNumber: `WAR-${pdfData.id}`,
            issueDate: deliveryDate.toLocaleDateString("ja-JP"),
            guaranteeStart: deliveryDate.toLocaleDateString("ja-JP"),
            guaranteeEnd: expiryDate.toLocaleDateString("ja-JP"),
            watch: job.watch,
            repairSummary: "オーバーホール修理一式"
        };
    }, [pdfData]);

    const [instance, updateInstance] = usePDF({
        document: docData ? <WarrantyDocument data={docData} /> : <Document><Page><Text>Loading...</Text></Page></Document>
    });

    useEffect(() => {
        if (docData) {
            updateInstance(<WarrantyDocument data={docData} />);
        }
    }, [docData, updateInstance]);

    if (loading) return <div className="p-10 text-center">データを取得中...</div>;

    if (!pdfData) return <div className="p-10 text-center">データが見つかりませんでした。</div>;

    return (
        <div className="min-h-screen bg-zinc-100 p-8 flex flex-col items-center justify-center">
            <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-4xl text-center h-[90vh] flex flex-col">
                <h1 className="text-2xl font-bold mb-4">修理保証書 (プレビュー)</h1>

                {instance.loading ? (
                    <div className="flex-1 flex items-center justify-center">生成中...</div>
                ) : instance.url ? (
                    <iframe src={instance.url} className="w-full flex-1 border rounded" />
                ) : (
                    <div className="text-red-500">生成エラー: {String(instance.error)}</div>
                )}
            </div>
        </div>
    );
}
