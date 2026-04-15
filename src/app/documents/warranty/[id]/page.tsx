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

    if (loading) return <div className="min-h-screen flex items-center justify-center">データを取得中...</div>;
    if (!docData) return <div className="min-h-screen flex items-center justify-center">保証書データが見つかりませんでした。</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center justify-center">
            <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl w-full text-center">
                <h1 className="text-2xl font-bold mb-4">修理保証書</h1>
                <p className="text-gray-500 text-sm mb-6">{docData.warrantyNumber}</p>

                {!isReady ? (
                    <div className="py-10">
                        <p className="mb-6 text-gray-600">
                            PDF生成エンジンは待機中です。<br />
                            ボタンを押して保証書を作成してください。
                        </p>
                        <button
                            onClick={() => setIsReady(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105"
                        >
                            保証書を作成する
                        </button>
                    </div>
                ) : (
                    <>
                        {instance.loading ? (
                            <div className="flex flex-col items-center gap-4 py-10">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                                <p className="text-gray-600 font-medium">生成中...</p>
                            </div>
                        ) : instance.error ? (
                            <div className="text-red-500 py-10">
                                <p className="font-bold">エラーが発生しました</p>
                                <p className="text-sm">{String(instance.error)}</p>
                            </div>
                        ) : instance.url ? (
                            <div className="w-full h-[800px] border border-gray-300 rounded overflow-hidden">
                                <iframe src={instance.url} className="w-full h-full" title="保証書プレビュー" />
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
}
