"use client";

import React, { useEffect, useState } from 'react';
import { WarrantyDocument } from '@/components/pdf/WarrantyDocument';
import { usePDF, Document, Page, Text } from '@react-pdf/renderer';

export default function WarrantyDocumentPage({ params }: { params: { id: string } }) {
    const [docData, setDocData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch(`/api/warranties/${params.id}`);
                const data = await res.json();
                setDocData(data);
            } catch (err) {
                console.error("保証書データ取得エラー:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [params.id]);

    const [isReady, setIsReady] = useState(false);
    const [instance, updateInstance] = usePDF({
        document: docData
            ? <WarrantyDocument data={docData} />
            : <Document><Page><Text>Loading...</Text></Page></Document>
    });

    useEffect(() => {
        if (isReady && docData) {
            updateInstance(<WarrantyDocument data={docData} />);
        }
    }, [isReady, docData, updateInstance]);

    if (loading) return <div className="h-screen flex items-center justify-center">データを取得中...</div>;
    if (!docData) return <div className="h-screen flex items-center justify-center">保証書データが見つかりませんでした。</div>;

    return (
        <div className="h-screen flex flex-col bg-gray-100">
            <div className="bg-white px-6 py-3 shadow flex justify-between items-center shrink-0">
                <h1 className="font-bold text-lg">修理保証書: {docData.warrantyNumber}</h1>
                {instance.url && (
                    <a
                        href={instance.url}
                        download={`warranty_${docData.warrantyNumber}.pdf`}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
                    >
                        PDFダウンロード
                    </a>
                )}
            </div>

            {!isReady ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <p className="text-gray-600">PDF生成エンジンは待機中です。ボタンを押して保証書を作成してください。</p>
                    <button
                        onClick={() => setIsReady(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-lg"
                    >
                        保証書を作成する
                    </button>
                </div>
            ) : instance.loading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <p className="text-gray-600">生成中...</p>
                </div>
            ) : instance.error ? (
                <div className="flex-1 flex items-center justify-center text-red-500">
                    エラー: {String(instance.error)}
                </div>
            ) : instance.url ? (
                <iframe src={instance.url} className="flex-1 w-full border-0" title="保証書プレビュー" />
            ) : null}
        </div>
    );
}
