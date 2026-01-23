"use client";

import dynamic from 'next/dynamic';
import React, { useEffect, useState } from 'react';
import { InvoiceDocument } from '@/components/pdf/InvoiceDocument'; // Import Invoice Document
import { usePDF } from '@react-pdf/renderer';

import { getRepairDataForPDF } from '@/lib/repairs';
import { Document, Page, Text } from '@react-pdf/renderer';

export default function InvoicePreviewPage({ params }: { params: { id: string } }) {
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

    // Manual Trigger State
    const [isReady, setIsReady] = useState(false);
    const [instance, updateInstance] = usePDF({
        document: pdfData ? <InvoiceDocument data={pdfData} /> : <Document><Page><Text>Loading...</Text></Page></Document>
    });

    // Only update instance when isReady becomes true (User initiated)
    useEffect(() => {
        if (isReady && pdfData) {
            updateInstance(<InvoiceDocument data={pdfData} />);
        }
    }, [isReady, pdfData, updateInstance]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">データを取得中...</div>;
    }

    if (!pdfData) {
        return <div className="min-h-screen flex items-center justify-center">修理データが見つかりませんでした。</div>;
    }

    return (
        <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center justify-center">
            <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full text-center">
                <h1 className="text-2xl font-bold mb-4">御請求書 (PDFプレビュー)</h1>

                {!isReady ? (
                    <div className="py-10">
                        <p className="mb-6 text-gray-600">
                            PDF生成エンジンは待機中です。<br />
                            ボタンを押して請求書を作成してください。
                        </p>
                        <button
                            onClick={() => setIsReady(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105"
                        >
                            請求書を作成する
                        </button>
                    </div>
                ) : (
                    <>
                        {instance.loading ? (
                            <div className="flex flex-col items-center gap-4 py-10">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                                <p className="text-gray-600 font-medium">請求書エンジン起動中...</p>
                                <p className="text-gray-400 text-sm">PDFを生成しています...</p>
                            </div>
                        ) : instance.error ? (
                            <div className="flex flex-col items-center gap-4 text-red-500 py-10">
                                <p className="font-bold">エラーが発生しました</p>
                                <p className="text-sm">{String(instance.error)}</p>
                                <button onClick={() => setIsReady(false)} className="text-blue-500 underline">リセット</button>
                            </div>
                        ) : instance.url ? (
                            <div className="w-full h-[800px] border border-gray-300 rounded overflow-hidden">
                                <iframe src={instance.url} className="w-full h-full" title="PDF Preview" />
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
}
