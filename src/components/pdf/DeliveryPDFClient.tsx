"use client";

import { DeliveryDocument, DeliveryDocumentProps } from "@/components/pdf/DeliveryDocument";
import { usePDF } from "@react-pdf/renderer";
import { useEffect, useState } from "react";

export function DeliveryPDFClient({ data }: DeliveryDocumentProps) {
    const [instance, updateInstance] = usePDF({ document: <DeliveryDocument data={data} /> });
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
        updateInstance(<DeliveryDocument data={data} />);
    }, [data, updateInstance]);

    if (!isClient) return <div className="p-10 text-center">Loading PDF Generator...</div>;

    if (instance.loading) return <div className="p-10 text-center">Generating PDF...</div>;
    if (instance.error) return <div className="p-10 text-center text-red-500">Error: {String(instance.error)}</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center">
            <div className="bg-white p-4 rounded shadow mb-4 w-full max-w-4xl flex justify-between items-center">
                <h1 className="font-bold text-lg">納品書プレビュー: {data.id}</h1>
                <a
                    href={instance.url || "#"}
                    download={`delivery_${data.id}.pdf`}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                    PDFダウンロード
                </a>
            </div>
            {instance.url && (
                <iframe src={instance.url} className="w-full max-w-4xl h-[800px] border rounded shadow" />
            )}
        </div>
    );
}
